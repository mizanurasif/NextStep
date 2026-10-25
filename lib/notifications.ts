import { Platform } from "react-native";
import type * as NotificationsModule from "expo-notifications";
import dayjs from "dayjs";
import { formatTimeDistance, hasLiveDeadline } from "@/lib/applications";

// Android groups notifications into channels; the user can mute each one in system settings
const CHANNEL_ID = "reminders";

// iOS keeps at most 64 pending local notifications, so only the soonest ones are scheduled
const MAX_SCHEDULED = 60;

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

type ReminderNotification = {
    identifier: string;
    date: Date;
    title: string;
    body: string;
    applicationId: string;
};

// Turns each enabled reminder into a future notification:
// deadlines for jobs and universities, follow-up dates for professors still waiting on a reply
export const getReminderNotifications = (applications: Application[], now = new Date()): ReminderNotification[] => {
    const notifications: ReminderNotification[] = [];

    for (const application of applications) {
        const isProfessor = application.type === "professor";
        const anchor = isProfessor
            ? (application.stage === "sent" || application.stage === "follow_up_due") && application.followUpAt
            : hasLiveDeadline(application) && application.deadline;
        if (!anchor) continue;

        // Always tell the user the moment a deadline runs out, whatever reminders they picked
        if (!isProfessor && new Date(anchor) > now) {
            notifications.push({
                identifier: `${application.id}:deadline`,
                date: new Date(anchor),
                title: "Time is over",
                body: `The deadline for ${application.title} · ${application.organization} has passed`,
                applicationId: application.id,
            });
        }

        for (const reminder of application.reminders) {
            if (!reminder.enabled) continue;
            // The "time is over" notification above already covers the deadline itself
            if (!isProfessor && reminder.minutesBefore === 0) continue;
            const date = new Date(new Date(anchor).getTime() - reminder.minutesBefore * 60_000);
            if (date <= now) continue;

            notifications.push({
                identifier: `${application.id}:${reminder.id}`,
                date,
                title: isProfessor
                    ? "Time to follow up"
                    : reminder.kind === "on_day"
                      ? `Due today at ${dayjs(anchor).format("h:mm A")}`
                      : `Due in ${formatTimeDistance(anchor, dayjs(date))}`,
                body: `${application.title} · ${application.organization}`,
                applicationId: application.id,
            });
        }
    }

    return notifications.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, MAX_SCHEDULED);
};

// Android 13+ only shows the permission prompt once a channel exists, so create it first
export const ensureNotificationPermission = async () => {
    if (!Notifications) return false;

    if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
            name: "Deadline reminders",
            importance: Notifications.AndroidImportance.HIGH,
        });
    }

    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
};

// Runs one sync at a time, so quick back-to-back data changes can't schedule duplicates
let queue = Promise.resolve();

// Makes the phone's scheduled reminders match the applications exactly:
// cancels everything, then schedules what should be there now
export const syncReminderNotifications = (applications: Application[]) => {
    if (!Notifications) return queue;
    queue = queue
        .then(async () => {
            await Notifications.cancelAllScheduledNotificationsAsync();
            for (const notification of getReminderNotifications(applications)) {
                await Notifications.scheduleNotificationAsync({
                    identifier: notification.identifier,
                    content: {
                        title: notification.title,
                        body: notification.body,
                        data: { applicationId: notification.applicationId },
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.DATE,
                        date: notification.date,
                        channelId: CHANNEL_ID,
                    },
                });
            }
        })
        .catch((error) => console.warn("Could not schedule reminders", error));
    return queue;
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
