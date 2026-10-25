import { useEffect, useState } from "react";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useApplications } from "@/lib/applications-store";
import {
    ensureNotificationPermission,
    notificationsSupported,
    subscribeToReminderTaps,
    syncReminderNotifications,
} from "@/lib/notifications";

// Keeps the phone's scheduled reminders in sync with the live applications list
// and opens the right screen when a reminder is tapped
export const useReminderNotifications = () => {
    const { user } = useAuth();
    const { applications, loading } = useApplications();
    const [permitted, setPermitted] = useState(false);

    // Ask once someone is signed in, since that's when there are reminders to deliver
    useEffect(() => {
        if (!user || !notificationsSupported) return;
        ensureNotificationPermission().then(setPermitted);
    }, [user]);

    // Re-runs on every Firebase change
    useEffect(() => {
        if (!notificationsSupported || loading) return;
        // An empty list cancels everything, so a signed-out phone keeps no one's reminders
        if (!user) syncReminderNotifications([]);
        else if (permitted) syncReminderNotifications(applications);
    }, [user, applications, loading, permitted]);

    // Opens the application a reminder is about
    useEffect(
        () => subscribeToReminderTaps((id) => router.push({ pathname: "/application/[id]", params: { id } })),
        [],
    );
};
