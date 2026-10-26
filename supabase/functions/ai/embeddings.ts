import { HttpError } from "./http.ts";

// 768 of the model's 3072 dimensions: a quarter of the storage and faster search, for little loss in quality.
// Stored with every chunk, since vectors from different models or sizes can't be compared
export const EMBEDDING = { model: "gemini-embedding-2", dimensions: 768 } as const;

// Documents and questions are embedded differently, which makes a question land near the passage that answers it
type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

// Parallel calls at a time; the model has no batch endpoint and the free tier limits requests per minute
const CONCURRENCY = 4;

const embedOne = async (text: string, taskType: TaskType): Promise<number[]> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING.model}:embedContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY") ?? "" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBEDDING.dimensions,
      }),
    },
  );
  if (!response.ok) {
    if (response.status === 429 || response.status === 503) {
      throw new HttpError(503, "The AI is busy right now. Try again in a minute");
    }
    console.error("Embedding error", response.status, (await response.text()).slice(0, 300));
    throw new HttpError(502, "Could not embed the text");
  }
  const values = (await response.json()).embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING.dimensions) throw new HttpError(502, "Unexpected embedding size");
  return values;
};

export const embedQuery = (text: string) => embedOne(text, "RETRIEVAL_QUERY");

// Keeps the input order
export const embedDocuments = async (texts: string[]) => {
  const vectors: number[][] = new Array(texts.length);
  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch = await Promise.all(texts.slice(i, i + CONCURRENCY).map((text) => embedOne(text, "RETRIEVAL_DOCUMENT")));
    batch.forEach((vector, j) => (vectors[i + j] = vector));
  }
  return vectors;
};

// Same text with the same model and size → same hash → no need to embed it again
export const contentHash = async (content: string) => {
  const bytes = new TextEncoder().encode(`${EMBEDDING.model}:${EMBEDDING.dimensions}:${content}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};
