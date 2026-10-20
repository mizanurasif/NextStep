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

    type ApplicationType = "job" | "university" | "professor";

    type ApplicationStage =
        | "saved"
        | "applied"
        | "interview"
        | "offer"
        | "rejected"
        | "sent"
        | "replied";

    // What the app sends when creating or editing an application
    interface ApplicationInput {
        type: ApplicationType;
        title: string;
        organization?: string;
        link?: string;
        stage: ApplicationStage;
        deadline: Date | null;
        notes?: string;
        contactEmail?: string;
        sentAt?: Date | null;
        followUpAt?: Date | null;
    }

    // An application as read back from Firestore
    interface Application extends Required<ApplicationInput> {
        id: string;
        createdAt: Date | null;
        updatedAt: Date | null;
    }

    interface ListHeadingProps {
        title: string;
    }
}

export {};