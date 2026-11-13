import dayjs from "dayjs";
import { describeAiError, type AiKey, type AiProvider } from "@/lib/ai/providers";
import { APPLICATION_TOOLS, applicationDetails, runApplicationTool } from "@/lib/ai/research/application-tools";
import { INSTRUCTIONS } from "@/lib/ai/research/instructions";
import type { Exchange, ModelAdapter, ModelSession, ToolCall, ToolOutput } from "@/lib/ai/research/model-turn";
import { openaiAdapter } from "@/lib/ai/research/openai-adapter";
import { claudeAdapter } from "@/lib/ai/research/claude-adapter";

// "Ask NextStep": a research agent that runs on the phone. It talks to the user's chosen AI directly
// with their own key, reads their saved applications through two tools, and searches the web (the
// AI's own web search). The answer streams in through onEvent.
//
// This file is the whole agent: the loop, the stop rules, the sources and the chat memory. The AI
// itself sits behind a "model turn" seam (model-turn.ts), with one small adapter per provider.

// A web page the answer cites, or a saved application the agent read. Shown as chips under the answer
export type ResearchSource = { type: "web"; url: string; title: string } | { type: "application"; id: string; title: string };

// What the chat screen is told while an answer is being written
export type ResearchEvent =
    // What the agent is doing, e.g. "Searching: Google SWE interview questions"
    | { type: "status"; text: string }
    // The next piece of the answer
    | { type: "text"; delta: string }
    | { type: "sources"; sources: ResearchSource[] };

export type ResearchQuestion = {
    question: string;
    aiKey: AiKey;
    // The user's saved applications, as the app holds them right now
    applications: Application[];
    // The application the chat was opened from. Its details go with the first question only;
    // after that they're part of the chat
    application?: Application;
};

// One chat. It remembers its earlier questions and answers; start a new chat for a fresh start
export type ResearchChat = {
    // Answers one question, streaming it through onEvent. Throws an Error whose message is meant for
    // the user; a question that fails isn't remembered, so asking again starts clean
    ask: (request: ResearchQuestion, onEvent: (event: ResearchEvent) => void) => Promise<void>;
};

// ── Limits and messages ───────────────────────────────────────────────────────────────────────────

// Model calls per question: tool rounds, plus continuing a long web search that paused
const MAX_ROUNDS = 10;
// Web searches per model call; keeps the cost and the wait predictable
const MAX_WEB_SEARCHES = 8;
// Earlier exchanges sent with each question. Older ones are forgotten, which keeps a long chat's
// cost flat (every remembered exchange is sent, and billed, again with each question)
const MAX_REMEMBERED = 10;

const STOPPED_EARLY = "I stopped before finishing. Ask me to continue, or try a narrower question.";
const REFUSED = "This question couldn't be answered. Try asking it another way";
const TOO_LONG = "The answer got too long. Try a narrower question";

const ADAPTERS: Record<AiProvider, ModelAdapter> = { openai: openaiAdapter, claude: claudeAdapter };

const TOOL_STATUS: Record<string, string> = {
    list_applications: "Checking your applications…",
    read_applications: "Reading your saved applications…",
};

// ── The answer text ───────────────────────────────────────────────────────────────────────────────

// Streams the answer and keeps a copy for the chat memory. Text from different model calls is shown
// as one answer, so the parts are kept apart with a blank line
const answerWriter = (onEvent: (event: ResearchEvent) => void) => {
    let text = "";
    let roundHasText = false;
    const append = (delta: string) => {
        text += delta;
        onEvent({ type: "text", delta });
    };
    return {
        newRound: () => {
            roundHasText = false;
        },
        write: (delta: string) => {
            if (!roundHasText && text) append("\n\n");
            roundHasText = true;
            append(delta);
        },
        // A last line of our own, e.g. STOPPED_EARLY
        note: (line: string) => append(`${text ? "\n\n" : ""}${line}`),
        text: () => text,
    };
};

// ── The loop ──────────────────────────────────────────────────────────────────────────────────────

// Calls the model until it has answered: each turn either finishes, asks for tools (we run them and
// send the outputs back), or pauses (we let it carry on). Returns the answer text
const runAgentLoop = async (
    session: ModelSession,
    runTool: (call: ToolCall) => ToolOutput,
    onEvent: (event: ResearchEvent) => void,
) => {
    const writer = answerWriter(onEvent);
    const webSources = new Map<string, string>();
    let toolOutputs: ToolOutput[] = [];

    for (let round = 0; round < MAX_ROUNDS; round++) {
        writer.newRound();
        const turn = await session.turn(toolOutputs, {
            text: writer.write,
            status: (text) => onEvent({ type: "status", text }),
        });
        for (const { url, title } of turn.webSources) webSources.set(url, title);

        // The stop rules. A thrown error isn't remembered, so the user can just ask again
        switch (turn.stop) {
            case "refused":
                throw new Error(REFUSED);
            // A tool input cut off at the limit can still look valid, so nothing is run
            case "cut_off":
                throw new Error(TOO_LONG);
            case "done":
                return { answer: writer.text(), webSources };
            case "paused":
                toolOutputs = [];
                break;
            case "tool_calls":
                toolOutputs = turn.toolCalls.map(runTool);
                break;
        }
    }

    // Out of rounds: what was written so far is kept, so the user can say "continue"
    writer.note(STOPPED_EARLY);
    return { answer: writer.text(), webSources };
};

// ── The chat ──────────────────────────────────────────────────────────────────────────────────────

// `adapters` is only passed in tests, to answer with a scripted fake instead of a real AI
export const createResearchChat = (adapters: Record<AiProvider, ModelAdapter> = ADAPTERS): ResearchChat => {
    // The earlier questions and answers, oldest first
    const memory: Exchange[] = [];

    return {
        ask: async ({ question, aiKey, applications, application }, onEvent) => {
            // The applications the agent read, shown as sources under the answer
            const read = new Map<string, string>();

            // When the chat is opened from an application, its details go with the first question, so
            // the AI knows what "this job" means without a tool call
            const opened = application && memory.length === 0 ? application : undefined;
            if (opened) read.set(opened.id, `${opened.title} · ${opened.organization}`);
            const context = opened
                ? `\n\nThe user opened this chat from one of their saved applications:\n<application>\n${applicationDetails(opened)}\n</application>`
                : "";
            const today = dayjs().format("YYYY-MM-DD"); // in the phone's time zone
            const fullQuestion = `Today is ${today}.${context}\n\n${question.trim()}`;

            const runTool = ({ id, name, input }: ToolCall): ToolOutput => {
                onEvent({ type: "status", text: TOOL_STATUS[name] ?? "Working…" });
                const result = runApplicationTool(applications, name, input);
                for (const application of result.read) read.set(application.id, application.title);
                return { id, content: result.content, isError: result.isError };
            };

            onEvent({ type: "status", text: "Thinking…" });
            try {
                const session = await adapters[aiKey.provider].start({
                    apiKey: aiKey.apiKey,
                    system: INSTRUCTIONS,
                    tools: APPLICATION_TOOLS,
                    maxWebSearches: MAX_WEB_SEARCHES,
                    history: memory.slice(-MAX_REMEMBERED),
                    question: fullQuestion,
                });
                const { answer, webSources } = await runAgentLoop(session, runTool, onEvent);

                const sources: ResearchSource[] = [
                    ...[...webSources].map(([url, title]): ResearchSource => ({ type: "web", url, title })),
                    ...[...read].map(([id, title]): ResearchSource => ({ type: "application", id, title })),
                ];
                onEvent({ type: "sources", sources });
                // An empty answer would leave a gap in the conversation the AI sees next time
                if (answer) memory.push({ question: fullQuestion, answer });
            } catch (error) {
                throw new Error(describeAiError(error, aiKey.provider));
            }
        },
    };
};

// The chat shows plain text, but answers can carry Markdown links: OpenAI puts each citation in the
// text as "([site.com](https://…))". Those pages are already listed as sources under the answer, so
// citations are dropped and any other link keeps only its words
export const readableAnswer = (text: string) =>
    text.replace(/\s*\(\[[^\]]*\]\([^)\s]*\)\)/g, "").replace(/\[([^\]]+)\]\(https?:[^)\s]*\)/g, "$1");
