import dayjs from "dayjs";
import { formatTimeDistance } from "@/lib/applications";
import { getFireTime } from "@/lib/reminders";
import { getStatus } from "@/lib/status";

// =====================================================================================
// Reminder plan: decides WHAT should go off on this phone, WHEN, and HOW it's delivered.
//
// It never touches the phone. Applications go in, plain data comes out:
//
//   planReminders(applications, { now, alarmsSupported })
//     → { notifications: [...], alarms: [...] }
//
// Two adapters then carry the plan out. Both have the same one-method interface,
// ReminderDelivery.replaceAll(list) = "make the phone hold exactly this list":
//
//   lib/notifications.ts  notificationDelivery → expo-notifications (banners, iOS + Android)
//   lib/alarms.ts         alarmDelivery        → react-native-notify-kit (ringing alarms, Android)
//
// lib/reminder-sync.ts runs plan → adapters every time the applications change.
// Since this file is data in, data out, every decision in it can be checked without a phone.
// =====================================================================================

// iOS keeps at most 64 pending local notifications, so only the soonest 60 are scheduled.
// Ringing alarms go through Android's AlarmManager instead, so they get their own 60
const MAX_SCHEDULED = 60;

// -------------------------------------------------------------------------------------
// 1. Shapes
// -------------------------------------------------------------------------------------

// One thing that should go off, already worked out
export type PlannedReminder = {
    // "<applicationId>:<key>", e.g. "-Nx7abc:r1", "-Nx7abc:deadline", "-Nx7abc:follow-up".
    // Stable across syncs, so the same reminder always gets the same id on the phone
    id: string;
    applicationId: string;
    date: Date;
    // Plain text, no emoji: each adapter decorates it its own way
    title: string;
    body: string;
    // The user picked "+ Alarm". In `alarms` it rings like a clock; in `notifications` it means
    // this phone can't ring one, so the notification should be as loud as possible instead
    alarm: boolean;
};

// The plan: which reminders go to which adapter
export type ReminderPlan = {
    notifications: PlannedReminder[];
    alarms: PlannedReminder[];
};

// The interface both adapters satisfy (and a fake one in a test could too)
export type ReminderDelivery = {
    // Cancel what this adapter scheduled before, then schedule exactly `reminders`
    replaceAll: (reminders: PlannedReminder[]) => Promise<void>;
};

// -------------------------------------------------------------------------------------
// 2. What should go off
// -------------------------------------------------------------------------------------

// Everything worth a heads-up, soonest first (only future ones):
//   - "Time to follow up" for a professor still waiting on a reply (automatic)
//   - "Time is over" when a live deadline passes, for every type (automatic)
//   - the user's own reminders: counted back from a live deadline, or at their exact time
//     when there's no deadline (custom reminders only)
export const listReminders = (applications: Application[], now: Date): PlannedReminder[] => {
    const list: PlannedReminder[] = [];

    for (const application of applications) {
        const body = `${application.title} · ${application.organization}`;

        // Adds one reminder for this application, unless its time has already passed
        const add = (key: string, date: Date, title: string, alarm = false, text = body) => {
            if (date <= now) return;
            list.push({ id: `${application.id}:${key}`, applicationId: application.id, date, title, body: text, alarm });
        };

        // Which dates still matter is decided in lib/status
        const status = getStatus(application, dayjs(now));

        // Follow-up: the status only has one while the email is sent and no reply has come yet
        const followUp = status.events.find((event) => event.kind === "follow_up");
        if (followUp) add("follow-up", new Date(followUp.date), "Time to follow up");

        // A deadline that no longer matters (already applied, rejected…) silences its reminders too,
        // and so does a finished application
        const deadline = status.liveDeadline;
        if (application.deadline && !deadline) continue;
        if (status.phase === "closed") continue;

        if (deadline) {
            add("deadline", new Date(deadline), "Time is over", false, `The deadline for ${body} has passed`);
        }

        for (const reminder of application.reminders) {
            if (!reminder.enabled) continue;

            // When it rings is decided in lib/reminders; null means it can't ring
            // (no deadline to count back from, or an old 0-minute one that "Time is over" covers)
            const date = getFireTime(reminder, deadline);
            if (!date) continue;

            add(reminder.id, date, reminderTitle(reminder, deadline, date), !!reminder.alarm);
        }
    }

    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
};

// "Due today at 11:59 PM" (on-the-day reminder), "Due in 3 days", or "Reminder" when there's no deadline
const reminderTitle = (reminder: Reminder, deadline: string | null, date: Date) => {
    if (!deadline) return "Reminder";
    if (reminder.kind === "on_day") return `Due today at ${dayjs(deadline).format("h:mm A")}`;
    return `Due in ${formatTimeDistance(deadline, dayjs(date))}`;
};

// -------------------------------------------------------------------------------------
// 3. How each one is delivered
// -------------------------------------------------------------------------------------

// Splits the list between the two adapters:
//   - "+ Alarm" reminders ring as real alarms when this phone can (Android with notify-kit)
//   - everything else, and every alarm on a phone that can't ring one, is a notification
// Each side keeps only its soonest MAX_SCHEDULED
export const planReminders = (
    applications: Application[],
    { now, alarmsSupported }: { now: Date; alarmsSupported: boolean },
): ReminderPlan => {
    const all = listReminders(applications, now);
    const rings = (reminder: PlannedReminder) => alarmsSupported && reminder.alarm;

    return {
        notifications: all.filter((reminder) => !rings(reminder)).slice(0, MAX_SCHEDULED),
        alarms: all.filter(rings).slice(0, MAX_SCHEDULED),
    };
};
