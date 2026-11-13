import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { onValue, ref, runTransaction } from "firebase/database";
import { AIError, GoogleAIBackend, getAI, getGenerativeModel } from "firebase/ai";
import { app, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

// The free AI for users without their own key: Gemini through Firebase AI Logic (Gemini Developer API).
// It runs on Firebase's no-cost Spark plan, and no Gemini key ships in the app: Firebase calls Gemini
// for us. It only reads circulars; every other AI feature needs the user's own key.
// Setup: Firebase console → AI Logic → Get started → Gemini Developer API
// Tried in order: when one is overloaded (it happens at busy times) or retired, the next one answers
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash"];
// The SDK waits up to 3 minutes by default; on a phone it's better to give up sooner and try the next model
const TIMEOUT_MS = 45_000;

export const FREE_FILLS_PER_DAY = 50;
export const NO_FREE_FILLS_MESSAGE = `You've used today's ${FREE_FILLS_PER_DAY} free fills. Add your own API key in Profile for more`;

// Stored at users/{uid}/aiUsage. The day is the phone's local date, so the count starts again at midnight
type Usage = { day: string; freeFills: number };

const today = () => dayjs().format("YYYY-MM-DD");
const usedToday = (usage: Usage | null) => (usage?.day === today() ? usage.freeFills : 0);
const usageRef = (uid: string) => ref(db, `users/${uid}/aiUsage`);

// How many free circular fills the signed-in user has left today; null while loading.
// Live, so the form and Profile update as soon as one is used (on any device)
export const useFreeFillsLeft = () => {
    const { user } = useAuth();
    const uid = user?.uid;
    const [usage, setUsage] = useState<{ uid: string; value: Usage | null } | null>(null);

    useEffect(() => {
        if (!uid) return;
        return onValue(
            usageRef(uid),
            (snapshot) => setUsage({ uid, value: snapshot.val() }),
            // Can't read the count (e.g. offline on a fresh install): don't block the button; the
            // transaction in askGemini still enforces the limit
            () => setUsage({ uid, value: null }),
        );
    }, [uid]);

    if (!uid || usage?.uid !== uid) return null;
    return Math.max(0, FREE_FILLS_PER_DAY - usedToday(usage.value));
};

// Counts one free fill, atomically, so two taps at once can't both slip past the limit.
// Counted before the call: a fill that then fails still uses one, which keeps this simple
const spendFreeFill = async (uid: string) => {
    const result = await runTransaction(usageRef(uid), (usage: Usage | null) => {
        const used = usedToday(usage);
        // Returning undefined cancels the transaction
        if (used >= FREE_FILLS_PER_DAY) return undefined;
        return { day: today(), freeFills: used + 1 };
    });
    if (!result.committed) throw new Error(NO_FREE_FILLS_MESSAGE);
};

// Created on first use, so the app starts without touching AI Logic
let ai: ReturnType<typeof getAI> | null = null;

// One Gemini call that must answer with JSON matching `schema`; returns the JSON text.
// Uses one of the user's free fills
// Uses one of the user's free fills, however many models it takes to get an answer
export const askGemini = async (request: { uid: string; system: string; schema: Record<string, unknown>; prompt: string }) => {
    await spendFreeFill(request.uid);
    let lastError: unknown;
    for (const modelName of GEMINI_MODELS) {
        try {
            ai ??= getAI(app, { backend: new GoogleAIBackend() });
            const model = getGenerativeModel(
                ai,
                {
                    model: modelName,
                    systemInstruction: request.system,
                    generationConfig: { responseMimeType: "application/json", responseJsonSchema: request.schema },
                },
                { timeout: TIMEOUT_MS },
            );
            const result = await model.generateContent(request.prompt);
            return result.response.text();
        } catch (error) {
            // The user only sees a short sentence, so the full error goes to the dev console
            if (__DEV__) console.warn(`[Gemini ${modelName}]`, error);
            lastError = error;
            // Anything other than "this model can't answer right now" would fail on the next model too
            if (!worthTryingNextModel(error)) break;
        }
    }
    throw new Error(describeGeminiError(lastError));
};

// Busy (429, 500, 503), retired (404) or too slow: another model may still answer
const worthTryingNextModel = (error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") return true;
    const status = error instanceof AIError ? error.customErrorData?.status : undefined;
    return status === 404 || status === 429 || status === 500 || status === 503;
};

// Turns a Firebase AI Logic error into one short sentence for the user.
// "fetch-error" means Gemini answered with an HTTP error (its status is in customErrorData), not
// that the phone is offline; a request that never got an answer comes back with the plain "error" code
const describeGeminiError = (error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") return "The free AI took too long to answer. Please try again";
    if (!(error instanceof AIError)) return "The free AI couldn't read this circular. Please try again";

    const status = error.customErrorData?.status;
    if (error.code.endsWith("api-not-enabled")) return "The free AI isn't set up for this app yet. Add your own API key in Profile";
    // 401/403: Firebase refused the app, e.g. App Check is enforced for AI Logic but the app sends no token
    if (status === 401 || status === 403) return "The free AI isn't available right now. Add your own API key in Profile";
    if (status === 429 || status === 500 || status === 503) return "The free AI is busy right now. Try again in a minute";
    if (error.code.endsWith("fetch-error")) return "The free AI had a problem. Please try again";
    if (/network request failed/i.test(error.message)) return "You're offline. Connect to the internet to use AI features";
    return "The free AI couldn't read this circular. Please try again";
};
