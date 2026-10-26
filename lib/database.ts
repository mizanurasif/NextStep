import {
    onValue,
    orderByChild,
    push,
    query,
    ref,
    remove,
    update,
} from "firebase/database";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import { withoutUndefined } from "@/lib/utils";

// Realtime Database layout (same shapes as constants/data.json):
//   users/{uid}/profile                 → UserProfile
//   users/{uid}/applications/{id}       → Application (without `id`, which is the key)
// Dates are ISO strings, which sort correctly as text, so ordering by deadline works.

const applicationsRef = (uid: string) => ref(db, `users/${uid}/applications`);

const now = () => new Date().toISOString();

// Realtime Database drops null values and empty arrays, so put them back to match the Application type
const normalizeApplication = (id: string, value: Application): Application => {
    const base = {
        ...value,
        id,
        deadline: value.deadline ?? null,
        reminders: value.reminders ?? [],
        timeline: value.timeline ?? [],
    };
    switch (base.type) {
        case "job":
            return { ...base, appliedAt: base.appliedAt ?? null, interviewAt: base.interviewAt ?? null };
        case "university":
            return { ...base, submittedAt: base.submittedAt ?? null, documents: base.documents ?? [] };
        case "professor":
            return { ...base, sentAt: base.sentAt ?? null, followUpAt: base.followUpAt ?? null, repliedAt: base.repliedAt ?? null };
    }
};

// Creates or refreshes the profile; safe to call on every sign-up or sign-in
export const saveUserProfile = (user: User) =>
    update(ref(db, `users/${user.uid}/profile`), {
        uid: user.uid,
        name: user.displayName ?? "",
        email: user.email ?? "",
        photoURL: user.photoURL ?? null,
        createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : now(),
    } satisfies UserProfile);

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
                applications.push(normalizeApplication(child.key as string, child.val()));
            });
            onChange(applications);
        },
        onError,
    );

export const addApplication = async (uid: string, input: ApplicationInput) => {
    const newRef = push(applicationsRef(uid));
    const timestamp = now();
    await update(newRef, withoutUndefined({ ...input, createdAt: timestamp, updatedAt: timestamp }));
    return newRef.key as string;
};

export const updateApplication = (uid: string, id: string, changes: Partial<ApplicationInput>) =>
    update(ref(db, `users/${uid}/applications/${id}`), withoutUndefined({ ...changes, updatedAt: now() }));

// Saves an edit: a field left empty in the form (undefined) is written as null, which
// Realtime Database treats as "delete", so clearing a field really clears it
export const editApplication = (uid: string, id: string, changes: Partial<ApplicationInput>) =>
    update(
        ref(db, `users/${uid}/applications/${id}`),
        Object.fromEntries(Object.entries({ ...changes, updatedAt: now() }).map(([key, value]) => [key, value ?? null])),
    );

export const deleteApplication =(uid: string, id: string) => remove(ref(db, `users/${uid}/applications/${id}`));
