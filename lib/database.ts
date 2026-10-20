import {
    onValue,
    orderByChild,
    push,
    query,
    ref,
    remove,
    serverTimestamp,
    update,
} from "firebase/database";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";

// Realtime Database layout:
//   users/{uid}/profile                 → email, displayName, photoURL
//   users/{uid}/applications/{id}       → one job, university or professor entry
// Dates are stored as milliseconds since 1970, because the database has no date type.

type StoredApplication = Omit<ApplicationInput, "deadline" | "sentAt" | "followUpAt"> & {
    deadline: number | null;
    sentAt: number | null;
    followUpAt: number | null;
    createdAt?: number;
    updatedAt?: number;
};

const applicationsRef = (uid: string) => ref(db, `users/${uid}/applications`);

const toMillis = (date?: Date | null) => (date ? date.getTime() : null);
const toDate = (value?: number | null) => (typeof value === "number" ? new Date(value) : null);

// Only converts the date fields that are present, so partial updates stay partial
const toStored = (input: Partial<ApplicationInput>) => {
    const { deadline, sentAt, followUpAt, ...rest } = input;
    return {
        ...rest,
        ...(deadline !== undefined && { deadline: toMillis(deadline) }),
        ...(sentAt !== undefined && { sentAt: toMillis(sentAt) }),
        ...(followUpAt !== undefined && { followUpAt: toMillis(followUpAt) }),
    };
};

const toApplication = (id: string, data: StoredApplication): Application => ({
    id,
    type: data.type,
    title: data.title,
    organization: data.organization ?? "",
    link: data.link ?? "",
    stage: data.stage,
    deadline: toDate(data.deadline),
    notes: data.notes ?? "",
    contactEmail: data.contactEmail ?? "",
    sentAt: toDate(data.sentAt),
    followUpAt: toDate(data.followUpAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
});

// Creates or refreshes the profile; safe to call on every sign-up or sign-in
export const saveUserProfile = (user: User) =>
    update(ref(db, `users/${user.uid}/profile`), {
        email: user.email,
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        updatedAt: serverTimestamp(),
    });

// Live list ordered by deadline (entries without one come first); returns the function that stops listening
export const subscribeToApplications = (
    uid: string,
    onChange: (applications: Application[]) => void,
    onError?: (error: Error) => void,
) =>
    onValue(
        query(applicationsRef(uid), orderByChild("deadline")),
        (snapshot) => {
            const applications: Application[] = [];
            // forEach keeps the deadline order; returning nothing continues the loop
            snapshot.forEach((child) => {
                applications.push(toApplication(child.key as string, child.val()));
            });
            onChange(applications);
        },
        onError,
    );

export const addApplication = async (uid: string, input: ApplicationInput) => {
    const newRef = push(applicationsRef(uid));
    await update(newRef, {
        ...toStored(input),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return newRef.key as string;
};

export const updateApplication = (uid: string, id: string, changes: Partial<ApplicationInput>) =>
    update(ref(db, `users/${uid}/applications/${id}`), { ...toStored(changes), updatedAt: serverTimestamp() });

export const deleteApplication = (uid: string, id: string) => remove(ref(db, `users/${uid}/applications/${id}`));
