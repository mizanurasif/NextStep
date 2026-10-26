import { HttpError } from "./http.ts";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Small and fast for pulling fields out of text; a larger model for answering questions
export const MODELS = {
  extract: "gemini-3.5-flash-lite",
  answer: "gemini-3.5-flash",
} as const;

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export type Turn = { role: "user" | "model"; text: string };

const failed = async (response: Response) => {
  // 429 = Gemini's own free-tier limit, 503 = model overloaded; both are worth retrying later
  if (response.status === 429 || response.status === 503) {
    return new HttpError(503, "The AI is busy right now. Try again in a minute");
  }
  console.error("Gemini error", response.status, (await response.text()).slice(0, 300));
  return new HttpError(502, "The AI request failed");
};

// A plain-text answer, given the earlier turns of the conversation
export const generateText = async (options: { model: string; system: string; turns: Turn[] }): Promise<string> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new HttpError(500, "Server is missing GEMINI_API_KEY");

  const response = await fetch(`${BASE_URL}/${options.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.system }] },
      contents: options.turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      // Measured on a RAG answer: default thinking took ~19 s, "low" ~2 s with the same complete,
      // cited answer. flash-lite was faster still (~1 s) but only used one of three relevant excerpts
      generationConfig: { temperature: 0.3, thinkingConfig: { thinkingLevel: "low" } },
    }),
  });
  if (!response.ok) throw await failed(response);

  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new HttpError(502, "The AI returned an empty answer");
  return text;
};

// Asks Gemini for JSON shaped by `schema` (Gemini's OpenAPI-style schema) and parses it
export const generateJson = async <T>(options: {
  model: string;
  system: string;
  parts: Part[];
  schema: Record<string, unknown>;
}): Promise<T> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new HttpError(500, "Server is missing GEMINI_API_KEY");

  const response = await fetch(`${BASE_URL}/${options.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.system }] },
      contents: [{ role: "user", parts: options.parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: options.schema,
        // Extraction should give the same answer every time
        temperature: 0,
      },
    }),
  });

  if (!response.ok) throw await failed(response);

  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(502, "The AI returned an unreadable answer");
  }
};
