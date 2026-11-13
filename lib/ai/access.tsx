import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "@/lib/auth-context";
import { readCircular, type CircularResult } from "@/lib/ai/circular";
import { NO_FREE_FILLS_MESSAGE, useFreeFillsLeft } from "@/lib/ai/gemini";
import type { AiKey } from "@/lib/ai/providers";
import type { ResearchChat, ResearchEvent, ResearchQuestion } from "@/lib/ai/research/research";
import { showToast } from "@/lib/toast";

// AI access: the one place that knows the user's key, their chosen AI, and what that unlocks.
//
// The rule:
//   • With their own OpenAI or Claude key, every AI feature is on and uses that key.
//   • Without one, only "Fill from a circular" works, through the free Gemini reader
//     (a few fills a day); Ask NextStep is off.
//
// Screens ask "what can AI do right now?" (`research`, `circular`) and get ready-to-use functions
// (`askResearch`, `readCircular`) that already hold the key, so none of them re-decides the rule.

// Shown wherever Ask NextStep is used without a key
export const NO_KEY_MESSAGE = "Add your OpenAI or Claude API key in Profile to use this";

// Whether a feature can be used right now; when it can't, `reason` says why (shown as a toast)
export type Feature = { allowed: true } | { allowed: false; reason: string };

export type AiAccess = {
    // ── Settings, edited in Profile ──
    // The signed-in user's key, or null when they haven't added one
    aiKey: AiKey | null;
    // True until the saved key has been read from the phone
    loading: boolean;
    saveAiKey: (key: AiKey) => Promise<void>;
    removeAiKey: () => Promise<void>;
    // Free circular fills left today, for a user without a key; null with a key or while loading
    freeFillsLeft: number | null;

    // ── What AI can do right now ──
    research: Feature;
    circular: Feature;

    // ── The AI features, ready to use ──
    // Reads a pasted circular with the user's key, or with a free fill when they have none
    readCircular: (text: string) => Promise<CircularResult>;
    // Asks the research chat a question with the user's key. Throws NO_KEY_MESSAGE without one
    askResearch: (
        chat: ResearchChat,
        request: Omit<ResearchQuestion, "aiKey">,
        onEvent: (event: ResearchEvent) => void,
    ) => Promise<void>;
};

// For a button's onPress: runs `action` when the feature is allowed, otherwise says why in a toast.
// The button itself should look disabled (dimmed) when `feature.allowed` is false
export const whenAllowed = (feature: Feature, action: () => void) => () => (feature.allowed ? action() : showToast(feature.reason));

// ── Where the key is kept ─────────────────────────────────────────────────────────────────────────

// The storage the key is read from and written to. The app uses SecureStore; a test can pass a fake
export type KeyStore = {
    get: (name: string) => Promise<string | null>;
    set: (name: string, value: string) => Promise<void>;
    remove: (name: string) => Promise<void>;
};

// The key lives only on this phone, in the system's encrypted storage (Android Keystore / iOS
// Keychain), never in the database
const secureKeyStore: KeyStore = {
    get: (name) => SecureStore.getItemAsync(name),
    set: (name, value) => SecureStore.setItemAsync(name, value),
    remove: (name) => SecureStore.deleteItemAsync(name),
};

// One entry per account, so a second account on the same phone doesn't use it.
// Firebase uids are letters and digits, which SecureStore allows in names
const storageName = (uid: string) => `ai-key-${uid}`;

// The saved JSON back into a key; anything unreadable counts as no key
const parseKey = (saved: string | null): AiKey | null => {
    if (!saved) return null;
    try {
        const value = JSON.parse(saved) as AiKey;
        return (value.provider === "openai" || value.provider === "claude") && value.apiKey ? value : null;
    } catch {
        return null;
    }
};

// ── The provider ──────────────────────────────────────────────────────────────────────────────────

const AiAccessContext = createContext<AiAccess | null>(null);

export const AiAccessProvider = ({ children, keyStore = secureKeyStore }: { children: ReactNode; keyStore?: KeyStore }) => {
    const { user } = useAuth();
    const uid = user?.uid;
    // Tagged with the uid it was read for, so a previous account's key is never used
    const [saved, setSaved] = useState<{ uid: string; aiKey: AiKey | null } | null>(null);
    const freeFills = useFreeFillsLeft();

    useEffect(() => {
        if (!uid) return;
        let cancelled = false;
        keyStore
            .get(storageName(uid))
            .catch(() => null)
            .then((value) => {
                if (!cancelled) setSaved({ uid, aiKey: parseKey(value) });
            });
        return () => {
            cancelled = true;
        };
    }, [uid, keyStore]);

    const current = uid && saved?.uid === uid ? saved : null;
    const aiKey = current?.aiKey ?? null;
    const loading = !!uid && !current;
    const freeFillsLeft = aiKey ? null : freeFills;

    const requireUid = () => {
        if (!uid) throw new Error("Sign in first");
        return uid;
    };

    const value: AiAccess = {
        aiKey,
        loading,
        freeFillsLeft,
        saveAiKey: async (key) => {
            const id = requireUid();
            await keyStore.set(storageName(id), JSON.stringify(key));
            setSaved({ uid: id, aiKey: key });
        },
        removeAiKey: async () => {
            const id = requireUid();
            await keyStore.remove(storageName(id));
            setSaved({ uid: id, aiKey: null });
        },

        // Ask NextStep needs the user's own key. While the key is still being read it stays off,
        // but without the "add a key" message, which would be wrong if they have one
        research: aiKey
            ? { allowed: true }
            : { allowed: false, reason: loading ? "Loading your AI settings…" : NO_KEY_MESSAGE },
        // Without a key: allowed while free fills are left. While the count loads it stays on;
        // using a fill checks the limit again anyway
        circular: aiKey || freeFillsLeft === null || freeFillsLeft > 0 ? { allowed: true } : { allowed: false, reason: NO_FREE_FILLS_MESSAGE },

        readCircular: (text) => readCircular(text, { uid: requireUid(), aiKey }),
        askResearch: async (chat, request, onEvent) => {
            if (!aiKey) throw new Error(NO_KEY_MESSAGE);
            await chat.ask({ ...request, aiKey }, onEvent);
        },
    };

    return <AiAccessContext.Provider value={value}>{children}</AiAccessContext.Provider>;
};

export const useAiAccess = () => {
    const context = useContext(AiAccessContext);
    if (!context) throw new Error("useAiAccess must be used inside AiAccessProvider");
    return context;
};
