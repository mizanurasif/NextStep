import type Anthropic from "@anthropic-ai/sdk";
import { PROVIDERS, claudeClient, loadAnthropic } from "@/lib/ai/providers";
import type { ModelAdapter, ToolCall, TurnStop, WebSource } from "@/lib/ai/research/model-turn";

// Translates a model turn to and from Claude's Messages API. No loop here: see research.ts.
//
// Claude keeps no state between calls, so the session holds every message of the current question
// (exactly as Claude returned them, including web search blocks) and sends them all each turn.

type Message = Anthropic.Beta.BetaMessageParam;

// A tool input that isn't valid JSON makes the SDK throw, and the call is simply made again; this
// many times at most
const MAX_JSON_RETRIES = 2;

// Every web page the answer cites
const citedPages = (message: Anthropic.Beta.BetaMessage): WebSource[] =>
    message.content.flatMap((block) =>
        block.type === "text"
            ? (block.citations ?? []).flatMap((citation) =>
                  citation.type === "web_search_result_location" ? [{ url: citation.url, title: citation.title ?? citation.url }] : [],
              )
            : [],
    );

const STOP_REASONS: Partial<Record<NonNullable<Anthropic.Beta.BetaStopReason>, TurnStop>> = {
    tool_use: "tool_calls",
    pause_turn: "paused",
    refusal: "refused",
    max_tokens: "cut_off",
};

export const claudeAdapter: ModelAdapter = {
    start: async ({ apiKey, system, tools, maxWebSearches, history, question }) => {
        const client = await claudeClient(apiKey);
        // For telling the API's own errors apart from a broken tool input (see the retry below)
        const { APIError } = await loadAnthropic();

        const requestTools = [
            // Run by Anthropic within the call. "excluded" leaves the raw search results out of the
            // response, so the messages stay small
            {
                type: "web_search_20260318" as const,
                name: "web_search" as const,
                max_uses: maxWebSearches,
                response_inclusion: "excluded" as const,
            },
            {
                type: "web_fetch_20260318" as const,
                name: "web_fetch" as const,
                max_uses: 4,
                max_content_tokens: 20000,
                response_inclusion: "excluded" as const,
            },
            // Run by us: the call stops with "tool_use", and the results go in the next call
            ...tools.map(
                (tool): Anthropic.Beta.BetaTool => ({
                    name: tool.name,
                    description: tool.description,
                    input_schema: { ...tool.parameters, type: "object" },
                    strict: true,
                    // Tool input streams as it's written; the tool checks it before using it
                    eager_input_streaming: true,
                }),
            ),
        ];

        // The earlier exchanges as plain text, then the question
        const messages: Message[] = [
            ...history.flatMap(({ question: asked, answer }): Message[] => [
                { role: "user", content: asked },
                { role: "assistant", content: answer },
            ]),
            { role: "user", content: question },
        ];

        return {
            turn: async (toolOutputs, on) => {
                // All results go back in one message, which keeps Claude making parallel calls
                if (toolOutputs.length > 0) {
                    messages.push({
                        role: "user",
                        content: toolOutputs.map((output) => ({
                            type: "tool_result" as const,
                            tool_use_id: output.id,
                            content: output.content,
                            ...(output.isError && { is_error: true }),
                        })),
                    });
                }

                let message: Anthropic.Beta.BetaMessage | undefined;
                for (let attempt = 0; !message; attempt++) {
                    const stream = client.beta.messages.stream({
                        model: PROVIDERS.claude.model,
                        max_tokens: 64000,
                        // If Claude's safety check declines, the API retries on a fallback model within the same call
                        betas: ["server-side-fallback-2026-07-01"],
                        fallbacks: "default",
                        output_config: { effort: "medium" },
                        // The rules and tools are the same on every call, so they're cached
                        cache_control: { type: "ephemeral" },
                        system,
                        tools: requestTools,
                        messages,
                    });

                    stream.on("text", on.text);
                    stream.on("contentBlock", (block) => {
                        if (block.type !== "server_tool_use") return;
                        const input = block.input as { query?: string; url?: string };
                        if (block.name === "web_search" && input.query) on.status(`Searching: ${input.query}`);
                        else if (block.name === "web_fetch" && input.url) on.status(`Reading: ${input.url}`);
                        else on.status("Searching the web…");
                    });

                    try {
                        message = await stream.finalMessage();
                    } catch (error) {
                        // Only a broken tool input is worth another try. Every API error (wrong key, no
                        // credit, offline…) goes up to the loop
                        if (error instanceof APIError || attempt >= MAX_JSON_RETRIES) throw error;
                    }
                }

                // Kept as Claude returned it: the next call must send it back unchanged
                messages.push({ role: "assistant", content: message.content });

                const toolCalls: ToolCall[] = message.content.flatMap((block) =>
                    block.type === "tool_use" ? [{ id: block.id, name: block.name, input: block.input }] : [],
                );
                const stop = (message.stop_reason && STOP_REASONS[message.stop_reason]) || "done";
                return { stop, toolCalls, webSources: citedPages(message) };
            },
        };
    },
};
