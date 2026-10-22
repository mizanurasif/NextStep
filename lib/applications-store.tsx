import { createContext, useContext, useState, type ReactNode } from "react";
import { APPLICATIONS } from "@/constants/data";

type ApplicationsState = {
    applications: Application[];
    addApplication: (input: ApplicationInput) => Application;
};

const ApplicationsContext = createContext<ApplicationsState | null>(null);

// Holds every application in memory, starting from the dummy data.
// New entries last until the app restarts; Realtime Database will replace this later.
export const ApplicationsProvider = ({ children }: { children: ReactNode }) => {
    const [applications, setApplications] = useState<Application[]>(APPLICATIONS);

    const addApplication = (input: ApplicationInput) => {
        const timestamp = new Date().toISOString();
        const application = {
            ...input,
            id: `${input.type}-${Date.now()}`,
            createdAt: timestamp,
            updatedAt: timestamp,
        } as Application;
        setApplications((current) => [application, ...current]);
        return application;
    };

    return (
        <ApplicationsContext.Provider value={{ applications, addApplication }}>
            {children}
        </ApplicationsContext.Provider>
    );
};

export const useApplications = () => {
    const context = useContext(ApplicationsContext);
    if (!context) throw new Error("useApplications must be used inside ApplicationsProvider");
    return context;
};
