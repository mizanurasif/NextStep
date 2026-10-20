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

// Realtime Database layout (same shapes as constants/data.json):
//   users/{uid}/profile                 → UserProfile
//   users/{uid}/applications/{id}       → Application (without `id`, which is the key)
// Dates are ISO strings, which sort correctly as text, so ordering by deadline works.

const applicationsRef = (uid: string) => ref(db, `users/${uid}/applications`);

const now = () => new Date().toISOString();

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
                applications.push({ ...child.val(), id: child.key as string });
            });
            onChange(applications);
        },
        onError,
    );

export const addApplication = async (uid: string, input: ApplicationInput) => {
    const newRef = push(applicationsRef(uid));
    const timestamp = now();
    await update(newRef, { ...input, createdAt: timestamp, updatedAt: timestamp });
    return newRef.key as string;
};

export const updateApplication = (uid: string, id: string, changes: Partial<ApplicationInput>) =>
    update(ref(db, `users/${uid}/applications/${id}`), { ...changes, updatedAt: now() });

export const deleteApplication = (uid: string, id: string) => remove(ref(db, `users/${uid}/applications/${id}`));
