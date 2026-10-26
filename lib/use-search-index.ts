import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { useApplications } from "@/lib/applications-store";
import { INDEX_BATCH_SIZE, indexApplications, listIndexed, removeFromIndex } from "@/lib/ai";

// Waits for a burst of edits to settle before syncing
const DEBOUNCE_MS = 3000;

// What was last indexed for each application, as a short fingerprint of its searchable text
type Fingerprints = Record<string, string>;

const storageKey = (uid: string) => `search-index:${uid}`;

// Only the fields that end up in the chunks; changing a stage or a reminder doesn't need re-indexing
const fingerprint = (application: Application) => {
    const text = JSON.stringify([
        application.type,
        application.title,
        application.organization,
        application.notes ?? "",
        application.circular?.text ?? "",
        application.circular?.headings ?? [],
    ]);
    // djb2: tiny and good enough to notice a change; the server compares real SHA-256 hashes per chunk
    let hash = 5381;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    return `${text.length}:${hash >>> 0}`;
};

const readFingerprints = async (uid: string): Promise<Fingerprints | null> => {
    try {
        const saved = await AsyncStorage.getItem(storageKey(uid));
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
};

const syncSearchIndex = async (uid: string, applications: Application[]) => {
    const saved = await readFingerprints(uid);
    const fingerprints: Fingerprints = saved ?? {};
    const save = () => AsyncStorage.setItem(storageKey(uid), JSON.stringify(fingerprints));

    // Without saved fingerprints (new phone, reinstall) ask the server, so applications deleted
    // elsewhere don't stay searchable
    const indexedIds = saved ? Object.keys(fingerprints) : (await listIndexed()).applicationIds;
    const currentIds = new Set(applications.map((application) => application.id));
    const removed = indexedIds.filter((id) => !currentIds.has(id));
    if (removed.length > 0) {
        await removeFromIndex(removed);
        removed.forEach((id) => delete fingerprints[id]);
        await save();
    }

    const changed = applications.filter((application) => fingerprints[application.id] !== fingerprint(application));
    for (let i = 0; i < changed.length; i += INDEX_BATCH_SIZE) {
        const batch = changed.slice(i, i + INDEX_BATCH_SIZE);
        await indexApplications(batch);
        // Saved per batch, so an interrupted sync picks up where it stopped
        batch.forEach((application) => (fingerprints[application.id] = fingerprint(application)));
        await save();
    }
};

// One sync at a time; each waits for the one before it, then works from the latest list
let queue: Promise<void> = Promise.resolve();

// Keeps the AI search index (Supabase) in step with the applications (Realtime Database), which stay
// the source of truth. Offline or failed syncs are simply tried again on the next change or launch
export const useSearchIndex = () => {
    const { user } = useAuth();
    const { applications, loading } = useApplications();
    const uid = user?.uid;

    useEffect(() => {
        if (!uid || loading) return;
        const timer = setTimeout(() => {
            queue = queue
                .then(() => syncSearchIndex(uid, applications))
                .catch((error) => console.warn("Search index sync failed:", error instanceof Error ? error.message : error));
        }, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [uid, applications, loading]);
};
