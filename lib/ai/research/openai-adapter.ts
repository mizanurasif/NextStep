import type OpenAI from "openai";
import { PROVIDERS, openaiClient } from "@/lib/ai/providers";
import type { ModelAdapter, ModelTurn, ToolCall, TurnStop, WebSource } from "@/lib/ai/research/model-turn";

// Translates a model turn to and from OpenAI's Responses API. No loop here: see research.ts.
//
// Within one question, each call continues from the previous one with `previous_response_id`, so
// OpenAI keeps the turns (including its reasoning) and we only send what's new: the question first,
// then tool outputs.

// Collects the web pages the answer cites
const citedPages = (response: OpenAI.Responses.Response): WebSource[] => {
    const pages: WebSource[] = [];
    for (const item of response.output) {
        if (item.type !== "message") continue;
        for (const part of item.content) {
            if (part.type !== "output_text") continue;
            for (const annotation of part.annotations) {
                if (annotation.type !== "url_citation") continue;
                // OpenAI tags the links it cites; the tag isn't part of the page's address
                const url = annotation.url.replace(/[?&]utm_source=openai$/, "");
                pages.push({ url, title: annotation.title || url });
            }
        }
    }
    return pages;
};

const stopReason = (response: OpenAI.Responses.Response, toolCalls: ToolCall[]): TurnStop => {
    const refused = response.output.some((item) => item.type === "message" && item.content.some((part) => part.type === "refusal"));
    if (refused || response.incomplete_details?.reason === "content_filter") return "refused";
    if (response.status === "incomplete") return "cut_off";
    return toolCalls.length > 0 ? "tool_calls" : "done";
};

// The arguments arrive as a JSON string; broken JSON becomes null, which the tool reports as an error
const parseArguments = (json: string): unknown => {
    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
};

export const openaiAdapter: ModelAdapter = {
    start: async ({ apiKey, system, tools, maxWebSearches, history, question }) => {
        const client = await openaiClient(apiKey);
        const requestTools: OpenAI.Responses.Tool[] = [
            // Run by OpenAI within the call; nothing for us to execute
            { type: "web_search", search_context_size: "medium" },
            // Run by us: the call ends with "function_call" items, and their outputs go in the next call
            ...tools.map((tool) => ({ type: "function" as const, ...tool, strict: true })),
        ];

        // The id of the last response, which the next call continues from
        let previousResponseId: string | undefined;
        let isFirstTurn = true;

        return {
            turn: async (toolOutputs, on) => {
                // The first call carries the earlier exchanges and the question; later ones only tool outputs
                const input: OpenAI.Responses.ResponseInput = isFirstTurn
                    ? [
                          ...history.flatMap(({ question: asked, answer }) => [
                              { role: "user" as const, content: asked },
                              { role: "assistant" as const, content: answer },
                          ]),
                          { role: "user", content: question },
                      ]
                    : toolOutputs.map((output) => ({
                          type: "function_call_output" as const,
                          call_id: output.id,
                          output: output.isError ? `Error: ${output.content}` : output.content,
                      }));
                isFirstTurn = false;

                const stream = client.responses.stream({
                    model: PROVIDERS.openai.model,
                    // Sent every time; it isn't carried over from the previous response
                    instructions: system,
                    input,
                    previous_response_id: previousResponseId,
                    tools: requestTools,
                    reasoning: { effort: "medium" },
                    max_tool_calls: maxWebSearches,
                    // previous_response_id only works with stored responses
                    store: true,
                });

                stream.on("response.output_text.delta", (event) => on.text(event.delta));
                stream.on("response.web_search_call.searching", () => on.status("Searching the web…"));
                stream.on("response.output_item.done", ({ item }) => {
                    if (item.type !== "web_search_call") return;
                    if (item.action.type === "search") {
                        // `query` is deprecated in favour of `queries`, but OpenAI's own examples still show it
                        const queries = item.action.queries ?? (item.action.query ? [item.action.query] : []);
                        if (queries.length > 0) on.status(`Searching: ${queries.join(" · ")}`);
                    } else if (item.action.type === "open_page" && item.action.url) {
                        on.status(`Reading: ${item.action.url}`);
                    }
                });

                const response = await stream.finalResponse();
                previousResponseId = response.id;

                const toolCalls: ToolCall[] = response.output.flatMap((item) =>
                    item.type === "function_call" ? [{ id: item.call_id, name: item.name, input: parseArguments(item.arguments) }] : [],
                );
                const turn: ModelTurn = { stop: stopReason(response, toolCalls), toolCalls, webSources: citedPages(response) };
                return turn;
            },
        };
    },
};
