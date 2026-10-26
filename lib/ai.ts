import { auth } from "@/lib/firebase";

// The Supabase Edge Function in supabase/functions/ai. It holds the Gemini key, so the app never does
const AI_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai`;

// Matches MAX_CIRCULAR_CHARS on the server, so the form can say so before sending
export const MAX_CIRCULAR_CHARS = 20_000;

// The server takes at most this many applications per index request
export const INDEX_BATCH_SIZE = 10;

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
    // Section headings found in the circular; saved with it so the search index can split it there
    headings: string[];
};

export type ChatTurn = { role: "user" | "model"; text: string };

// An excerpt the answer may cite as [n]
export type AnswerSource = { n: number; applicationId: string | null; section: string | null; label: string };

export type Answer = { answer: string; sources: AnswerSource[] };

// getTimezoneOffset is minutes behind UTC (Dhaka gives -360), so flip it
const utcOffsetMinutes = () => -new Date().getTimezoneOffset();

// Calls one AI action as the signed-in user. The server checks the Firebase ID token and takes the
// user's id from it, so nothing in the body can act as someone else
const callAi = async <T>(action: string, body: Record<string, unknown> = {}): Promise<T> => {
    const user = auth.currentUser;
    if (!user) throw new Error("Sign in to use AI features");

    let response: Response;
    try {
        response = await fetch(AI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
            body: JSON.stringify({ action, ...body }),
        });
    } catch {
        throw new Error("You're offline. Connect to the internet to use AI features");
    }

    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? "The AI request failed. Please try again");
    return result as T;
};

// Reads a pasted circular and returns the form's fields; the user checks them before saving
export const extractCircular = (text: string) =>
    callAi<CircularResult>("extract", { text, utcOffsetMinutes: utcOffsetMinutes() });

// Brings these applications' search chunks up to date; the server only embeds text that changed
export const indexApplications = (applications: Application[]) =>
    callAi("index", {
        applications: applications.map((application) => ({
            applicationId: application.id,
            type: application.type,
            title: application.title,
            organization: application.organization,
            notes: application.notes ?? null,
            circular: application.circular ?? null,
        })),
    });

export const removeFromIndex = (applicationIds: string[]) => callAi("removeIndex", { applicationIds });

export const listIndexed = () => callAi<{ applicationIds: string[] }>("listIndexed");

// RAG: the server finds the most relevant excerpts and answers from them, citing each as [n].
// The application list goes along for dates, stages and counts, which don't need a search
export const askQuestion = (options: {
    question: string;
    history: ChatTurn[];
    applications: Application[];
    // Limits the search to one application
    applicationId?: string;
}) =>
    callAi<Answer>("ask", {
        question: options.question,
        history: options.history,
        applicationId: options.applicationId,
        applications: options.applications.map((application) => ({
            id: application.id,
            type: application.type,
            title: application.title,
            organization: application.organization,
            stage: application.stage,
            deadline: application.deadline,
        })),
        utcOffsetMinutes: utcOffsetMinutes(),
    });
