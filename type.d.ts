import type { ImageSourcePropType } from "react-native";

declare global {
    interface AppTab {
        name: string;
        title: string;
        icon: ImageSourcePropType;
    }

    interface TabIconProps {
        focused: boolean;
        icon: ImageSourcePropType;
    }

    interface Subscription {
        id: string;
        icon: ImageSourcePropType;
        name: string;
        plan?: string;
        category?: string;
        paymentMethod?: string;
        status?: string;
        startDate?: string;
        price: number;
        currency?: string;
        billing: string;
        renewalDate?: string;
        color?: string;
    }

    interface SubscriptionCardProps extends Omit<Subscription, "id"> {
        expanded: boolean;
        onPress: () => void;
        onCancelPress?: () => void;
        isCancelling?: boolean;
    }

    interface UpcomingSubscription {
        id: string;
        icon: ImageSourcePropType;
        name: string;
        price: number;
        currency?: string;
        daysLeft: number;
    }

    interface UpcomingSubscriptionCardProps
        extends Omit<UpcomingSubscription, "id"> {}

    // All dates are ISO 8601 strings (e.g. "2026-10-25T23:59:00+06:00"),
    // so the same shape works in data.json and in the Realtime Database.
    type ISODateString = string;

    type ApplicationType = "job" | "university" | "professor";

    type JobStage = "saved" | "applied" | "interview" | "offer" | "rejected";
    type UniversityStage = "preparing" | "submitted" | "under_review" | "admitted" | "rejected";
    type ProfessorStage = "draft" | "sent" | "follow_up_due" | "replied" | "declined";
    type ApplicationStage = JobStage | UniversityStage | ProfessorStage;

    interface Reminder {
        id: string;
        // How long before the deadline to notify, e.g. 4320 = 3 days, 1440 = 1 day, 120 = 2 hours
        minutesBefore: number;
        enabled: boolean;
    }

    interface TimelineEvent {
        id: string;
        date: ISODateString;
        title: string;
        detail?: string;
    }

    interface Money {
        amount: number;
        currency: string;
    }

    // Fields every kind of application has
    interface ApplicationBase {
        id: string;
        type: ApplicationType;
        title: string;
        organization: string;
        link?: string;
        deadline: ISODateString | null;
        notes?: string;
        reminders: Reminder[];
        timeline: TimelineEvent[];
        createdAt: ISODateString;
        updatedAt: ISODateString;
    }

    interface JobApplication extends ApplicationBase {
        type: "job";
        stage: JobStage;
        location?: string;
        employmentType?: "full-time" | "part-time" | "internship" | "contract";
        workMode?: "onsite" | "remote" | "hybrid";
        salary?: string;
        appliedAt: ISODateString | null;
        interviewAt?: ISODateString | null;
        interviewMode?: string;
    }

    interface UniversityDocument {
        name: string;
        done: boolean;
    }

    interface UniversityApplication extends ApplicationBase {
        type: "university";
        stage: UniversityStage;
        // `title` holds the program name and `organization` the university
        country?: string;
        intake?: string;
        submittedAt: ISODateString | null;
        applicationFee?: Money;
        documents: UniversityDocument[];
    }

    interface ProfessorApplication extends ApplicationBase {
        type: "professor";
        stage: ProfessorStage;
        // `title` holds the professor's name and `organization` the lab and university
        contactEmail: string;
        researchArea?: string;
        emailSubject?: string;
        sentAt: ISODateString | null;
        followUpAt: ISODateString | null;
        repliedAt?: ISODateString | null;
        linkedApplicationId?: string;
    }

    // Narrow with `application.type` to reach the type-specific fields
    type Application = JobApplication | UniversityApplication | ProfessorApplication;

    // Omit that keeps the union split per type, unlike the built-in Omit
    type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

    // What the app sends when creating an application; the database adds the rest
    type ApplicationInput = DistributiveOmit<Application, "id" | "createdAt" | "updatedAt">;

    interface UserProfile {
        uid: string;
        name: string;
        email: string;
        photoURL: string | null;
        createdAt: ISODateString;
    }

    interface AppData {
        user: UserProfile;
        applications: Application[];
    }

    interface ListHeadingProps {
        title: string;
    }
}

export {};