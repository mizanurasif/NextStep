import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { alarmsSupported, getRingingAlarm, subscribeToAlarms } from "@/lib/alarms";
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

    // Shows the ringing screen when an alarm goes off while the app is open, and whenever the app
    // comes to the front with one still ringing (e.g. opened by the alarm's full-screen launch)
    useEffect(() => {
        if (!alarmsSupported || !user) return;
        let shownId: string | null = null;
        const show = (id: string) => {
            if (shownId === id) return;
            shownId = id;
            router.push({ pathname: "/alarm", params: { id } });
        };
        const checkRinging = () =>
            getRingingAlarm().then((alarm) => {
                if (alarm?.id) show(alarm.id);
                else shownId = null;
            });

        checkRinging();
        const unsubscribe = subscribeToAlarms(show);
        const appState = AppState.addEventListener("change", (state) => state === "active" && checkRinging());
        return () => {
            unsubscribe();
            appState.remove();
        };
    }, [user]);
};
