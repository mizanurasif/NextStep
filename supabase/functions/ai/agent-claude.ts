import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http.ts";
import { APPLICATION_TOOLS } from "./applications.ts";
import { type Agent, MAX_ROUNDS, MAX_WEB_SEARCHES, type SavedChat, type Source, STOPPED_EARLY, SYSTEM, answerWriter } from "./agent.ts";

// Reads ANTHROPIC_API_KEY. Made on first use, so a missing key only breaks this agent, not the function
let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

// Each question adds a few messages (more when it uses tools). The history can't be trimmed, because
// Claude rejects an edited one, so a long chat has to be started again instead
const MAX_HISTORY_MESSAGES = 120;

// The chat this agent saves: every message so far, exactly as Claude returned it
type ClaudeChat = SavedChat & { provider: "claude"; messages: Anthropic.Beta.BetaMessageParam[] };

const TOOLS = [
  // Run by Anthropic within the call. "excluded" leaves the raw search results out of the response,
  // so the chat stays small
  {
    type: "web_search_20260318" as const,
    name: "web_search" as const,
    max_uses: MAX_WEB_SEARCHES,
    response_inclusion: "excluded" as const,
  },
  {
    type: "web_fetch_20260318" as const,
    name: "web_fetch" as const,
    max_uses: 4,
    max_content_tokens: 20000,
    response_inclusion: "excluded" as const,
  },
  // Run by us
  ...APPLICATION_TOOLS.map((tool): Anthropic.Beta.BetaTool => ({
    name: tool.name,
    description: tool.description,
    input_schema: { ...tool.parameters, type: "object" },
    strict: true,
    eager_input_streaming: true,
  })),
];

// Every web page the answer cites, once each
const webSources = (messages: Anthropic.Beta.BetaMessageParam[]): Source[] => {
  const pages = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content === "string") continue;
    for (const block of message.content) {
      if (block.type !== "text") continue;
      for (const citation of block.citations ?? []) {
        if (citation.type === "web_search_result_location") pages.set(citation.url, citation.title ?? citation.url);
      }
    }
  }
  return [...pages].map(([url, title]) => ({ type: "web", url, title }));
};

// The agent loop. Web search and web fetch run on Anthropic's side within one call; when Claude calls
// one of the application tools, the call stops with "tool_use", the tool runs here, and the result
// goes back in the next call
export const claudeAgent: Agent = {
  name: "claude",

  checkHistory: (chat) => {
    const { messages } = chat as Partial<ClaudeChat>;
    if (!Array.isArray(messages)) throw new HttpError(400, "This chat can't be continued. Start a new one");
    if (messages.length > MAX_HISTORY_MESSAGES) throw new HttpError(413, "This chat is full. Start a new one");
  },

  run: async ({ chat, userMessage, runTool, send }) => {
    const saved = chat as ClaudeChat | null;
    const writer = answerWriter(send);
    // Sent back as the server returned it; the API checks it, and a malformed one is a 400 from Claude
    const messages: Anthropic.Beta.BetaMessageParam[] = [...(saved?.messages ?? []), { role: "user", content: userMessage }];

    let jsonRetries = 0;
    let finished = false;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      writer.newRound();
      const stream = anthropic().beta.messages.stream({
        model: "claude-opus-5-5",
        max_tokens: 64000,
        // When a safety check declines, the API retries on a fallback model within the same call
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: SYSTEM,
        tools: TOOLS,
        messages,
      });

      stream.on("text", (delta) => writer.write(delta));
      stream.on("contentBlock", (block) => {
        if (block.type !== "server_tool_use") return;
        const input = block.input as { query?: string; url?: string };
        if (block.name === "web_search" && input.query) send({ type: "status", text: `Searching: ${input.query}` });
        else if (block.name === "web_fetch" && input.url) send({ type: "status", text: `Reading: ${input.url}` });
        else send({ type: "status", text: "Searching the web…" });
      });

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (error) {
        // A tool input that isn't valid JSON can't be answered, so that call is made again. Every other error stops here
        if (error instanceof Anthropic.APIError || jsonRetries++ >= 2) throw error;
        continue;
      }

      // Not added to the chat, so the user can just ask again
      if (message.stop_reason === "refusal") throw new HttpError(422, "This question couldn't be answered. Try asking it another way");

      const toolUses = message.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use");
      // A tool input cut off at the token limit can still look valid, so it isn't run
      if (message.stop_reason === "max_tokens" && toolUses.length > 0) {
        throw new HttpError(502, "The answer got too long. Try a narrower question");
      }
      messages.push({ role: "assistant", content: message.content });
      if (message.stop_reason === "pause_turn") continue;
      if (message.stop_reason !== "tool_use") {
        finished = true;
        break;
      }

      // All results go back in one message, which keeps Claude making parallel calls
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const result = await runTool(toolUse.name, toolUse.input);
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.content,
          ...(result.isError && { is_error: true }),
        });
      }
      messages.push({ role: "user", content: results });
    }

    // Claude accepts a chat that ends with tool results, so it's kept and the user can say "continue"
    if (!finished) writer.note(STOPPED_EARLY);
    const added = messages.slice(saved?.messages.length ?? 0);
    const next: ClaudeChat = { provider: "claude", messages };
    return { chat: next, webSources: webSources(added) };
  },
};
