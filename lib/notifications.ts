import { Platform } from "react-native";
import type * as NotificationsModule from "expo-notifications";
import type { PlannedReminder, ReminderDelivery } from "@/lib/reminder-plan";

// The expo-notifications side of reminders: ordinary notifications (banners), on iOS and Android.
// What to schedule is decided in lib/reminder-plan; this file only hands it to the phone,
// plus asks for permission and reports taps

// Android groups notifications into channels; the user can mute each one in system settings
const CHANNEL_ID = "reminders";
// Bundled through the expo-notifications `sounds` option in app.json; iOS plays at most 30 seconds.
// Only iOS uses it here: on Android, alarms ring through lib/alarms instead
const ALARM_SOUND = "alarm.wav";

// Loaded on demand: Expo Go on Android lacks some of the module's native code and throws on import,
// so there the app keeps working with reminders turned off (a development build has everything)
const loadNotifications = (): typeof NotificationsModule | null => {
    if (Platform.OS === "web") return null;
    try {
        // A static import can't be wrapped in try/catch, so require is needed here
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require("expo-notifications");
    } catch (error) {
        console.warn("Reminders are off: expo-notifications is unavailable in this build", error);
        return null;
    }
};

const Notifications = loadNotifications();

export const notificationsSupported = Notifications !== null;

// Show reminders as a banner even while the app is open (without a handler they stay hidden)
if (Notifications) {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });
}

// Android 13+ only shows the permission prompt once a channel exists, so create it first
export const ensureNotificationPermission = async () => {
    if (!Notifications) return false;

    if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
            name: "Deadline reminders",
            importance: Notifications.AndroidImportance.HIGH,
        });
        // Removes the alarm channel an earlier version created; alarms now have their own in lib/alarms
        await Notifications.deleteNotificationChannelAsync("alarms");
    }

    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
};

// Schedules one notification at its date. An alarm reminder that lands here (the phone can't
// ring a real alarm) gets a ⏰ in its title, and on iOS the loud alarm sound
const scheduleNotification = async (Notifications: typeof NotificationsModule, reminder: PlannedReminder, sound?: string) => {
    await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: {
            title: reminder.alarm ? `⏰ ${reminder.title}` : reminder.title,
            body: reminder.body,
            // Read back by subscribeToReminderTaps to open the right application
            data: { applicationId: reminder.applicationId },
            ...(sound && { sound, interruptionLevel: "timeSensitive" as const }),
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminder.date,
            channelId: CHANNEL_ID,
        },
    });
};

// The notification adapter (see ReminderDelivery in lib/reminder-plan):
// cancels every scheduled notification, then schedules exactly `reminders`
export const notificationDelivery: ReminderDelivery = {
    replaceAll: async (reminders) => {
        if (!Notifications) return;
        await Notifications.cancelAllScheduledNotificationsAsync();

        for (const reminder of reminders) {
            const sound = reminder.alarm && Platform.OS === "ios" ? ALARM_SOUND : undefined;
            // One bad reminder shouldn't stop the rest from being scheduled
            try {
                await scheduleNotification(Notifications, reminder, sound);
            } catch (error) {
                // A build made before the alarm sound was added doesn't have it, so fall back to the default sound
                console.warn("Could not schedule reminder, retrying with the default sound", reminder.id, error);
                await scheduleNotification(Notifications, reminder).catch((retryError) =>
                    console.warn("Could not schedule reminder", retryError),
                );
            }
        }
    },
};

// Calls onOpen with the application id when a reminder is tapped: once for a tap that launched
// the app from closed, then for every tap while it runs. Returns the function that stops listening.
export const subscribeToReminderTaps = (onOpen: (applicationId: string) => void) => {
    if (!Notifications) return () => {};

    const open = (response: NotificationsModule.NotificationResponse) => {
        const id = response.notification.request.content.data?.applicationId;
        if (typeof id === "string") onOpen(id);
    };

    const launchResponse = Notifications.getLastNotificationResponse();
    if (launchResponse) open(launchResponse);

    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
};
