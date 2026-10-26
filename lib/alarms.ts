import { Alert, Linking, Platform, TurboModuleRegistry } from "react-native";
import type NotifeeModule from "react-native-notify-kit";
import type { Event, Notification } from "react-native-notify-kit";

// Real ringing alarms (looping sound, Stop / Snooze buttons, full-screen when allowed) are Android only:
// iOS has no API for that, so there an alarm reminder stays a loud expo-notifications notification

// Loaded only when its native code is in the build: Expo Go and builds made before the library
// was added don't have it, and there the JS loads fine but every call throws.
// Without it, alarm reminders fall back to ordinary notifications
const loadNotifyKit = () => {
    if (Platform.OS !== "android") return null;
    if (!TurboModuleRegistry.get("NotifeeApiModule")) {
        console.warn("Alarms are off: this build doesn't include react-native-notify-kit. Make a new development build.");
        return null;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require("react-native-notify-kit") as typeof import("react-native-notify-kit");
    } catch (error) {
        console.warn("Alarms are off: react-native-notify-kit is unavailable in this build", error);
        return null;
    }
};

const kit = loadNotifyKit();
const notifee: typeof NotifeeModule | null = kit?.default ?? null;

export const alarmsSupported = notifee !== null;

// A channel's sound can't change after it's created, so this one is only for alarms.
// "alarm" is res/raw/alarm.wav, bundled by the expo-notifications `sounds` option in app.json
const CHANNEL_ID = "deadline-alarm";
const SOUND = "alarm";

// Scheduled alarms start with "alarm:", snoozed ones with "snooze:"; sync only replaces the first kind
const ALARM_PREFIX = "alarm:";
const SNOOZE_PREFIX = "snooze:";
export const SNOOZE_MINUTES = 5;
// Stop ringing on its own after 10 minutes, like a clock alarm
const RING_FOR_MS = 10 * 60_000;

export type AlarmInput = {
    identifier: string;
    date: Date;
    title: string;
    body: string;
    applicationId: string;
};

const isAlarmId = (id?: string) => !!id && (id.startsWith(ALARM_PREFIX) || id.startsWith(SNOOZE_PREFIX));

const createChannel = async () => {
    if (!kit || !notifee) return;
    await notifee.createChannel({
        id: CHANNEL_ID,
        name: "Deadline alarms",
        importance: kit.AndroidImportance.HIGH,
        sound: SOUND,
        vibration: true,
        vibrationPattern: [800, 400, 800, 400],
        bypassDnd: true,
        visibility: kit.AndroidVisibility.PUBLIC,
    });
};

// The notification that rings: loops its sound, can't be swiped away, wakes the screen,
// and asks Android to open the app full-screen
const buildNotification = (id: string, title: string, body: string, applicationId: string): Notification => ({
    id,
    title: `⏰ ${title}`,
    body,
    data: { applicationId },
    android: {
        channelId: CHANNEL_ID,
        category: kit!.AndroidCategory.ALARM,
        importance: kit!.AndroidImportance.HIGH,
        loopSound: true,
        ongoing: true,
        autoCancel: false,
        lightUpScreen: true,
        timeoutAfter: RING_FOR_MS,
        pressAction: { id: "default" },
        fullScreenAction: { id: "default" },
        actions: [
            { title: "Stop", pressAction: { id: "stop" } },
            { title: `Snooze ${SNOOZE_MINUTES} min`, pressAction: { id: "snooze" } },
        ],
    },
});

// setAlarmClock is what the Clock app uses: exact, wakes the phone from Doze, survives battery savers
const scheduleAt = async (notification: Notification, date: Date) => {
    await notifee!.createTriggerNotification(notification, {
        type: kit!.TriggerType.TIMESTAMP,
        timestamp: date.getTime(),
        alarmManager: { type: kit!.AlarmType.SET_ALARM_CLOCK },
    });
};

// Makes the scheduled alarms match exactly; snoozed alarms are left alone so they still ring
export const syncAlarms = async (alarms: AlarmInput[]) => {
    if (!notifee) return;
    await createChannel();
    const scheduled = await notifee.getTriggerNotificationIds();
    const stale = scheduled.filter((id) => id.startsWith(ALARM_PREFIX));
    if (stale.length) await notifee.cancelTriggerNotifications(stale);

    for (const alarm of alarms) {
        try {
            await scheduleAt(
                buildNotification(`${ALARM_PREFIX}${alarm.identifier}`, alarm.title, alarm.body, alarm.applicationId),
                alarm.date,
            );
        } catch (error) {
            console.warn("Could not schedule alarm", alarm.identifier, error);
        }
    }
};

export const stopAlarm = async (id: string) => {
    if (!notifee) return;
    await notifee.cancelNotification(id);
};

// Silences this alarm and rings it again in a few minutes
export const snoozeAlarm = async (notification: Notification) => {
    if (!notifee || !notification.id) return;
    await notifee.cancelNotification(notification.id);
    const original = notification.id.replace(SNOOZE_PREFIX, "").replace(ALARM_PREFIX, "");
    const title = (notification.title ?? "").replace(/^⏰ /, "");
    const applicationId = String(notification.data?.applicationId ?? "");
    await scheduleAt(
        buildNotification(`${SNOOZE_PREFIX}${original}`, title, notification.body ?? "", applicationId),
        new Date(Date.now() + SNOOZE_MINUTES * 60_000),
    );
};

// Stop / Snooze pressed on the notification, from any app state; returns true when it was an alarm action
export const handleAlarmEvent = async ({ type, detail }: Event) => {
    if (!kit || !detail.notification || !isAlarmId(detail.notification.id)) return false;
    if (type !== kit.EventType.ACTION_PRESS) return false;
    if (detail.pressAction?.id === "stop") await stopAlarm(detail.notification.id!);
    if (detail.pressAction?.id === "snooze") await snoozeAlarm(detail.notification);
    return true;
};

// Must run before the app renders, so Stop / Snooze work while the app is closed
export const registerAlarmBackgroundHandler = () => {
    notifee?.onBackgroundEvent(async (event) => {
        await handleAlarmEvent(event);
    });
};

// The alarm ringing right now, if any
export const getRingingAlarm = async () => {
    if (!notifee) return null;
    const displayed = await notifee.getDisplayedNotifications();
    return displayed.find((item) => isAlarmId(item.notification.id))?.notification ?? null;
};

export const getAlarm = async (id: string) => {
    if (!notifee) return null;
    const displayed = await notifee.getDisplayedNotifications();
    return displayed.find((item) => item.notification.id === id)?.notification ?? null;
};

// Calls onRing when an alarm starts while the app is open, and handles Stop / Snooze in the foreground
export const subscribeToAlarms = (onRing: (id: string) => void) => {
    if (!kit || !notifee) return () => {};
    return notifee.onForegroundEvent((event) => {
        const id = event.detail.notification?.id;
        if (!isAlarmId(id)) return;
        if (event.type === kit.EventType.DELIVERED || event.type === kit.EventType.PRESS) onRing(id!);
        else handleAlarmEvent(event);
    });
};

// Android 12+ needs "Alarms & reminders" access for exact alarms, and Android 14+ needs
// full-screen access for the ringing screen; asks the user to turn on whichever is off
export const ensureAlarmPermissions = async () => {
    if (!kit || !notifee) return;
    const { android } = await notifee.getNotificationSettings();

    if (android.alarm === kit.AndroidNotificationSetting.DISABLED) {
        Alert.alert(
            "Allow alarms",
            "To ring exactly on time, turn on “Alarms & reminders” for this app.",
            [{ text: "Not now", style: "cancel" }, { text: "Open settings", onPress: () => notifee.openAlarmPermissionSettings() }],
        );
        return;
    }
    if (android.fullScreenIntent === kit.AndroidNotificationSetting.DISABLED) {
        Alert.alert(
            "Allow full-screen alarms",
            "To show the ringing screen, allow full-screen notifications for this app in its settings.",
            [{ text: "Not now", style: "cancel" }, { text: "Open settings", onPress: () => Linking.openSettings() }],
        );
    }
};
