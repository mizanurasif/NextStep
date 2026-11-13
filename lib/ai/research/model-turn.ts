// The seam between the research agent and an AI provider: one "model turn", meaning one call to the
// model, in a form that doesn't depend on whose model it is.
//
// The agent loop (research.ts) owns everything that is the same for every AI: rounds, running tools,
// the stop rules, sources, the answer text and the chat memory. An adapter (openai-adapter.ts,
// claude-adapter.ts) only translates: our neutral input into that AI's request, and its streamed
// response back into a ModelTurn. A scripted fake adapter can stand in for both in a test.

// A tool the model may call, e.g. list_applications. `parameters` is a JSON schema
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

// The model asking to run one of our tools. `input` is parsed but unchecked (null when the model
// wrote broken JSON); the tool checks it before using it
export type ToolCall = { id: string; name: string; input: unknown };

// What a tool gave back, sent to the model on the next turn. `id` matches the ToolCall's
export type ToolOutput = { id: string; content: string; isError: boolean };

// A web page the model cited while answering
export type WebSource = { url: string; title: string };

// One earlier question and its answer, as plain text. The chat memory is kept in this neutral form,
// so it doesn't matter which AI wrote an answer and the user can switch AI mid-chat
export type Exchange = { question: string; answer: string };

// Why the model stopped
export type TurnStop =
    // It finished answering
    | "done"
    // It wants the tools in `toolCalls` run; the results go back with the next turn
    | "tool_calls"
    // It paused a long web search; the next turn (with no tool outputs) lets it carry on
    | "paused"
    // Its safety check declined to answer
    | "refused"
    // It hit the output limit, so the answer or a tool input may be incomplete
    | "cut_off";

export type ModelTurn = { stop: TurnStop; toolCalls: ToolCall[]; webSources: WebSource[] };

// Called while the turn streams in, so the answer appears as it's written
export type TurnEvents = {
    // The next piece of answer text
    text: (delta: string) => void;
    // What the model is doing, e.g. "Searching: Google SWE interview questions"
    status: (text: string) => void;
};

// The work on one question. Each AI keeps the turns of the current question in its own format
// (server tool blocks, reasoning, ids), so that state lives in here, not in the loop.
export type ModelSession = {
    // One model call. The first call sends the question; each later call sends the outputs of the
    // tools the previous turn asked for (an empty list after "paused")
    turn: (toolOutputs: ToolOutput[], on: TurnEvents) => Promise<ModelTurn>;
};

export type ModelAdapter = {
    // Starts answering `question`, with the earlier exchanges of the chat as context.
    // `maxWebSearches` caps the AI's own web search per turn
    start: (input: {
        apiKey: string;
        system: string;
        tools: ToolSpec[];
        maxWebSearches: number;
        history: Exchange[];
        question: string;
    }) => Promise<ModelSession>;
};
