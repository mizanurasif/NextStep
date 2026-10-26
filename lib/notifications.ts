import { Platform } from "react-native";
import type * as NotificationsModule from "expo-notifications";
import dayjs from "dayjs";
import { CLOSED_STAGES, formatTimeDistance, hasLiveDeadline } from "@/lib/applications";
import { alarmsSupported, syncAlarms } from "@/lib/alarms";

// Android groups notifications into channels; the user can mute each one in system settings
const CHANNEL_ID = "reminders";
// Bundled through the expo-notifications `sounds` option in app.json; iOS plays at most 30 seconds.
// Only iOS uses it here: on Android, alarms ring through lib/alarms instead
const ALARM_SOUND = "alarm.wav";

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
    alarm: boolean;
};

// Turns everything worth a heads-up into future notifications:
//   - "Time is over" when a live deadline passes, for every type
//   - "Time to follow up" for a professor still waiting on a reply (automatic)
//   - the user's own reminders: counted back from a live deadline, or at their exact time
//     when there's no deadline (custom reminders only)
export const getReminderNotifications = (applications: Application[], now = new Date()): ReminderNotification[] => {
    const notifications: ReminderNotification[] = [];

    for (const application of applications) {
        const body = `${application.title} · ${application.organization}`;
        const add = (key: string, date: Date, title: string, alarm = false, text = body) => {
            if (date > now) notifications.push({ identifier: `${application.id}:${key}`, date, title, body: text, applicationId: application.id, alarm });
        };

        if (
            application.type === "professor" &&
            (application.stage === "sent" || application.stage === "follow_up_due") &&
            application.followUpAt
        ) {
            add("follow-up", new Date(application.followUpAt), "Time to follow up");
        }

        // A deadline that no longer matters (already applied, rejected…) silences its reminders too
        const deadline = hasLiveDeadline(application) ? application.deadline : null;
        if (application.deadline && !deadline) continue;
        if (CLOSED_STAGES.includes(application.stage)) continue;

        if (deadline) {
            add("deadline", new Date(deadline), "Time is over", false, `The deadline for ${body} has passed`);
        }

        for (const reminder of application.reminders) {
            if (!reminder.enabled) continue;

            if (!deadline) {
                // Nothing to count back from: only custom reminders, which keep their exact time
                if (reminder.at) add(reminder.id, new Date(reminder.at), "Reminder", !!reminder.alarm);
                continue;
            }

            // Older 0-minute reminders meant "at the deadline", which "Time is over" now covers
            if (!reminder.at && reminder.minutesBefore === 0) continue;
            const date = reminder.at ? new Date(reminder.at) : new Date(new Date(deadline).getTime() - reminder.minutesBefore * 60_000);
            const title =
                reminder.kind === "on_day"
                    ? `Due today at ${dayjs(deadline).format("h:mm A")}`
                    : `Due in ${formatTimeDistance(deadline, dayjs(date))}`;
            add(reminder.id, date, title, !!reminder.alarm);
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
        // Removes the alarm channel an earlier version created; alarms now have their own in lib/alarms
        await Notifications.deleteNotificationChannelAsync("alarms");
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
            const all = getReminderNotifications(applications);
            // On Android an alarm is a real ringing alarm instead of a notification
            const ringing = alarmsSupported ? all.filter((n) => n.alarm) : [];
            await syncAlarms(ringing);

            for (const notification of all) {
                if (ringing.includes(notification)) continue;
                const schedule = (sound?: string) =>
                    Notifications.scheduleNotificationAsync({
                        identifier: notification.identifier,
                        content: {
                            title: notification.alarm ? `⏰ ${notification.title}` : notification.title,
                            body: notification.body,
                            data: { applicationId: notification.applicationId },
                            ...(sound && { sound, interruptionLevel: "timeSensitive" as const }),
                        },
                        trigger: {
                            type: Notifications.SchedulableTriggerInputTypes.DATE,
                            date: notification.date,
                            channelId: CHANNEL_ID,
                        },
                    });
                // One bad reminder shouldn't stop the rest from being scheduled
                try {
                    await schedule(notification.alarm && Platform.OS === "ios" ? ALARM_SOUND : undefined);
                } catch (error) {
                    // A build made before the alarm sound was added doesn't have it, so fall back to the default sound
                    console.warn("Could not schedule reminder, retrying with the default sound", notification.identifier, error);
                    await schedule().catch((retryError) => console.warn("Could not schedule reminder", retryError));
                }
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
