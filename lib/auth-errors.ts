import { FirebaseError } from "firebase/app";

type AuthErrorField = "email" | "password";

const MESSAGES: Record<string, { field: AuthErrorField; message: string }> = {
    "auth/invalid-email": { field: "email", message: "Enter a valid email address" },
    "auth/email-already-in-use": { field: "email", message: "This email already has an account. Try signing in." },
    "auth/user-disabled": { field: "email", message: "This account has been disabled" },
    "auth/user-not-found": { field: "password", message: "Wrong email or password" },
    "auth/wrong-password": { field: "password", message: "Wrong email or password" },
    "auth/invalid-credential": { field: "password", message: "Wrong email or password" },
    "auth/weak-password": { field: "password", message: "Choose a stronger password" },
    "auth/too-many-requests": { field: "password", message: "Too many attempts. Wait a moment and try again." },
    "auth/network-request-failed": { field: "email", message: "No internet connection. Check your network and try again." },
    "auth/operation-not-allowed": { field: "email", message: "Email sign-in is not enabled for this app yet" },
};

// Turns a Firebase Auth error into a friendly message and the field it belongs under
export const getAuthErrorMessage = (error: unknown): { field: AuthErrorField; message: string } => {
    if (error instanceof FirebaseError && MESSAGES[error.code]) {
        return MESSAGES[error.code];
    }
    return { field: "email", message: "Something went wrong. Please try again." };
};
