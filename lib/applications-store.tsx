import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import * as database from "@/lib/database";

type ApplicationsState = {
    applications: Application[];
    loading: boolean;
    error: string | null;
    addApplication: (input: ApplicationInput) => Promise<string>;
    updateApplication: (id: string, changes: Partial<ApplicationInput>) => Promise<void>;
    // Like updateApplication, but fields left undefined are cleared instead of kept
    editApplication: (id: string, changes: Partial<ApplicationInput>) => Promise<void>;
    deleteApplication: (id: string) => Promise<void>;
};

const ApplicationsContext = createContext<ApplicationsState | null>(null);

// One shared empty list, so effects that depend on `applications` don't re-run on every render
const NO_APPLICATIONS: Application[] = [];

// Keeps the signed-in user's applications in sync with Realtime Database
export const ApplicationsProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useAuth();
    const uid = user?.uid;
    // Tagged with the uid it belongs to, so a previous user's data is never shown
    const [snapshot, setSnapshot] = useState<{ uid: string; applications: Application[]; error: string | null } | null>(null);

    // Start listening when a user signs in; the cleanup stops it on sign-out
    useEffect(() => {
        if (!uid) return;
        return database.subscribeToApplications(
            uid,
            (list) => setSnapshot({ uid, applications: list, error: null }),
            (err) => setSnapshot({ uid, applications: [], error: err.message }),
        );
    }, [uid]);

    // Derived during render instead of reset inside the effect
    const current = uid && snapshot?.uid === uid ? snapshot : null;
    const applications = current?.applications ?? NO_APPLICATIONS;
    const error = current?.error ?? null;
    const loading = !!uid && !current;

    const requireUid = () => {
        if (!user) throw new Error("You must be signed in");
        return user.uid;
    };

    // No need to update state by hand: the listener above picks up every write
    const value: ApplicationsState = {
        applications,
        loading,
        error,
        addApplication: (input) => database.addApplication(requireUid(), input),
        updateApplication: (id, changes) => database.updateApplication(requireUid(), id, changes),
        editApplication: (id, changes) => database.editApplication(requireUid(), id, changes),
        deleteApplication: (id) => database.deleteApplication(requireUid(), id),
    };

    return <ApplicationsContext.Provider value={value}>{children}</ApplicationsContext.Provider>;
};

export const useApplications = () => {
    const context = useContext(ApplicationsContext);
    if (!context) throw new Error("useApplications must be used inside ApplicationsProvider");
    return context;
};