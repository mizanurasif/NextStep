import type OpenAI from "openai";
import { HttpError } from "./http.ts";
import { APPLICATION_TOOLS } from "./applications.ts";
import { OPENAI_MODEL, openai } from "./openai.ts";
import { type Agent, MAX_ROUNDS, MAX_WEB_SEARCHES, type SavedChat, type Source, STOPPED_EARLY, SYSTEM, answerWriter } from "./agent.ts";

// Every earlier turn is billed again as input on each question, so a chat has a cap
const MAX_TURNS = 40;

// The chat this agent saves: OpenAI keeps the conversation (for 30 days), and we keep the id of
// its latest response. Each call continues from there with `previous_response_id`
type OpenAIChat = SavedChat & { provider: "openai"; responseId: string; turns: number };

const TOOLS: OpenAI.Responses.Tool[] = [
  // Run by OpenAI within the call; nothing for us to execute
  { type: "web_search", search_context_size: "medium" },
  // Run by us: the model asks, we run them and send the results back in the next call
  ...APPLICATION_TOOLS.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: true,
  })),
];

// Every web page the answer cites, once each
const citedPages = (response: OpenAI.Responses.Response, pages: Map<string, string>) => {
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type !== "output_text") continue;
      for (const annotation of part.annotations) {
        if (annotation.type !== "url_citation") continue;
        // OpenAI tags the links it cites; the tag isn't part of the page's address
        const url = annotation.url.replace(/[?&]utm_source=openai$/, "");
        pages.set(url, annotation.title || url);
      }
    }
  }
};

const refused = (response: OpenAI.Responses.Response) =>
  response.output.some((item) => item.type === "message" && item.content.some((part) => part.type === "refusal"));

// The agent loop. Web search runs on OpenAI's side within one call; when the model calls one of the
// application tools, the call ends with "function_call" items, the tools run here, and their results
// go back in the next call
export const openaiAgent: Agent = {
  name: "openai",

  checkHistory: (chat) => {
    const { responseId, turns } = chat as Partial<OpenAIChat>;
    if (typeof responseId !== "string" || !responseId || typeof turns !== "number") {
      throw new HttpError(400, "This chat can't be continued. Start a new one");
    }
    if (turns >= MAX_TURNS) throw new HttpError(413, "This chat is full. Start a new one");
  },

  run: async ({ chat, userMessage, runTool, send }) => {
    const saved = chat as OpenAIChat | null;
    const writer = answerWriter(send);
    const pages = new Map<string, string>();

    let responseId = saved?.responseId;
    let input: OpenAI.Responses.ResponseInput = [{ role: "user", content: userMessage }];
    for (let round = 0; round < MAX_ROUNDS; round++) {
      writer.newRound();
      const stream = openai().responses.stream({
        model: OPENAI_MODEL,
        // Sent every time; it isn't carried over from the previous response
        instructions: SYSTEM,
        input,
        previous_response_id: responseId,
        tools: TOOLS,
        reasoning: { effort: "medium" },
        max_tool_calls: MAX_WEB_SEARCHES,
        // previous_response_id only works with stored responses
        store: true,
      });

      stream.on("response.output_text.delta", (event) => writer.write(event.delta));
      stream.on("response.web_search_call.searching", () => send({ type: "status", text: "Searching the web…" }));
      stream.on("response.output_item.done", ({ item }) => {
        if (item.type !== "web_search_call") return;
        if (item.action.type === "search") {
          // `query` is deprecated in favour of `queries`, but OpenAI's own examples still show it
          const queries = item.action.queries ?? (item.action.query ? [item.action.query] : []);
          if (queries.length > 0) send({ type: "status", text: `Searching: ${queries.join(" · ")}` });
        } else if (item.action.type === "open_page" && item.action.url) {
          send({ type: "status", text: `Reading: ${item.action.url}` });
        }
      });

      const response = await stream.finalResponse();
      responseId = response.id;

      // Not saved to the chat, so the user can just ask again
      if (refused(response)) throw new HttpError(422, "This question couldn't be answered. Try asking it another way");
      if (response.status === "incomplete") {
        throw new HttpError(
          502,
          response.incomplete_details?.reason === "max_output_tokens"
            ? "The answer got too long. Try a narrower question"
            : "The answer was cut off. Please try again",
        );
      }
      citedPages(response, pages);

      const calls = response.output.flatMap((item) => (item.type === "function_call" ? [item] : []));
      if (calls.length === 0) {
        const webSources: Source[] = [...pages].map(([url, title]) => ({ type: "web", url, title }));
        const next: OpenAIChat = { provider: "openai", responseId: response.id, turns: (saved?.turns ?? 0) + 1 };
        return { chat: next, webSources };
      }

      // The arguments arrive as a JSON string; a broken one goes back as an error for the model to fix
      input = [];
      for (const call of calls) {
        let args: unknown = null;
        try {
          args = JSON.parse(call.arguments);
        } catch {
          // left as null, which runTool reports as an error
        }
        const result = await runTool(call.name, args);
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: result.isError ? `Error: ${result.content}` : result.content,
        });
      }
    }

    // Out of rounds with tool results still unsent: OpenAI won't continue a response whose tool
    // calls have no results, so the chat stays as it was before this question
    writer.note(STOPPED_EARLY);
    return { chat: null, webSources: [...pages].map(([url, title]) => ({ type: "web", url, title })) };
  },
};
