import { fetch as expoFetch } from "expo/fetch";
import { auth } from "@/lib/firebase";

// The Supabase Edge Function in supabase/functions/ai. It holds the AI keys, so the app never does
const AI_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai`;

// Matches MAX_CIRCULAR_CHARS on the server, so the form can say so before sending
export const MAX_CIRCULAR_CHARS = 20_000;

export type CircularFields = {
    type: ApplicationType;
    title: string | null;
    organization: string | null;
    link: string | null;
    deadline: ISODateString | null;
    location: string | null;
    country: string | null;
    intake: string | null;
    contactEmail: string | null;
    researchArea: string | null;
    summary: string | null;
};

export type CircularResult = {
    fields: CircularFields;
    // Section headings found in the circular; saved with it
    headings: string[];
};

// A web page the answer cites, or a saved application the agent read
export type ResearchSource =
    | { type: "web"; url: string; title: string }
    | { type: "application"; id: string; title: string };

// The chat so far, exactly as the server returned it; null for a new chat. The app never looks
// inside it: it goes back unchanged with the next question. Its contents depend on which AI the
// server uses (OpenAI keeps the conversation and this holds its id; for Claude it's every message)
export type ResearchHistory = unknown;

export type ResearchEvent =
    // What the agent is doing, e.g. "Searching: Google SWE interview questions"
    | { type: "status"; text: string }
    // The next piece of the answer
    | { type: "text"; delta: string }
    | { type: "sources"; sources: ResearchSource[] }
    // The chat to send with the next question; null means keep the one you have
    | { type: "done"; history: ResearchHistory }
    | { type: "error"; message: string };

// The chat shows plain text, but answers can carry Markdown links: OpenAI puts each citation in the
// text as "([site.com](https://…))". Those pages are already listed as sources under the answer, so
// citations are dropped and any other link keeps only its words
export const readableAnswer = (text: string) =>
    text
        .replace(/\s*\(\[[^\]]*\]\([^)\s]*\)\)/g, "")
        .replace(/\[([^\]]+)\]\(https?:[^)\s]*\)/g, "$1");

// getTimezoneOffset is minutes behind UTC (Dhaka gives -360), so flip it
const utcOffsetMinutes = () => -new Date().getTimezoneOffset();

const OFFLINE = "You're offline. Connect to the internet to use AI features";

// The Firebase ID token for the server. It checks the token and takes the user's id from it,
// so nothing in the body can act as someone else
const idToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Sign in to use AI features");
    return user.getIdToken();
};

// Calls one AI action as the signed-in user and returns its JSON answer
const callAi = async <T>(action: string, body: Record<string, unknown> = {}): Promise<T> => {
    const token = await idToken();

    let response: Response;
    try {
        response = await fetch(AI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action, ...body }),
        });
    } catch {
        throw new Error(OFFLINE);
    }

    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? "The AI request failed. Please try again");
    return result as T;
};

// Reads a pasted circular and returns the form's fields; the user checks them before saving
export const extractCircular = (text: string) =>
    callAi<CircularResult>("extract", { text, utcOffsetMinutes: utcOffsetMinutes() });

// Asks the research agent. It reads the user's saved applications and searches the web, and the
// answer streams in: onEvent gets each status line and piece of text as it arrives.
// expo/fetch, because React Native's own fetch can't read a response as it streams
export const streamResearch = async (
    options: {
        question: string;
        history: ResearchHistory;
        // The application the chat was opened from; only needed with the first question
        applicationId?: string;
    },
    onEvent: (event: ResearchEvent) => void,
) => {
    const token = await idToken();

    let response: Awaited<ReturnType<typeof expoFetch>>;
    try {
        // React Native's normal fetch waits for the whole response. expo/fetch can hand it over piece by piece.
        response = await expoFetch(AI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
            body: JSON.stringify({ action: "research", ...options, utcOffsetMinutes: utcOffsetMinutes() }),
        });
    } catch {
        throw new Error(OFFLINE);
    }

    // Problems found before the answer starts (expired sign-in, daily limit) come back as JSON
    if (!response.ok || !response.body) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "The research request failed. Please try again");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let ended = false;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // Each event is one "data: {json}" line followed by a blank line
            let end;
            while ((end = buffer.indexOf("\n\n")) !== -1) {
                const line = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                if (!line.startsWith("data: ")) continue;
                const event = JSON.parse(line.slice(6)) as ResearchEvent;
                if (event.type === "done" || event.type === "error") ended = true;
                onEvent(event);
            }
        }
    } catch {
        throw new Error("The connection dropped. Please try again");
    }
    if (!ended) throw new Error("The connection dropped. Please try again");
};
