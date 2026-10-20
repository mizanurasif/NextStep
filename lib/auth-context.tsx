import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

type AuthState = {
    user: User | null;
    // True until Firebase has restored the saved session on app start
    initializing: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, initializing: true });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<AuthState>({ user: null, initializing: true });

    // Fires once with the restored session, then again on every sign-in or sign-out
    useEffect(() => onAuthStateChanged(
        auth, (user) => setState({ user, initializing: false })
        ),[]);

    return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
