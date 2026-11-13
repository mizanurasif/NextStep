import dayjs, { type Dayjs } from "dayjs";

// ─────────────────────────────────────────────────────────────────────────────
// Reminder schedule: everything about the user's own deadline reminders.
//
//   1. Presets          the "1 week before" / "3 days before" / "On the day" / "1 hour before" chips
//   2. Fire time        the exact moment a saved reminder goes off
//   3. Labels           how a reminder reads on screen
//   4. Custom times     checking and suggesting a time the user picks
//   5. Form round trip  saved reminders ⇄ the form's chips
//
// This module only decides WHEN and WHAT. Delivering a reminder (notification or alarm) is done by
// lib/notifications and lib/alarms, which ask getFireTime when to ring.
// It only imports dayjs, so it runs anywhere, with no React Native.
//
// How a reminder is stored (see `Reminder` in type.d.ts), for a deadline of Nov 20, 11:59 PM:
//   preset  { minutesBefore: 4320 }                              → 3 days before: Nov 17, 11:59 PM
//   on day  { minutesBefore: 899, kind: "on_day" }               → 9 AM on the deadline's date: Nov 20, 9:00 AM
//   custom  { minutesBefore: 120, kind: "custom", at: "<ISO>" }  → exactly at `at`, deadline or not
// ─────────────────────────────────────────────────────────────────────────────

// Any date these functions take: an ISO string from the database, a Date from a picker, or a Dayjs
type DateInput = string | Date | Dayjs;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

// "On the day" reminders go off at this hour on the deadline's date
export const ON_DAY_HOUR = 9;
const ON_DAY_LABEL = `On the day · ${ON_DAY_HOUR} AM`;

// How exact reminder times are shown, e.g. "Nov 12, 3:30 PM"
const TIME_FORMAT = "MMM D, h:mm A";

// ─── 1. Presets ──────────────────────────────────────────────────────────────

export type ReminderPreset = {
    // Identifies the chip in the form, e.g. "week"
    key: string;
    label: string;
    minutesBefore: number;
    kind?: "on_day";
};

// The presets with a fixed distance from the deadline. "On the day" isn't here because its distance
// depends on the deadline's time (see onDayPreset)
const WEEK_BEFORE: ReminderPreset = { key: "week", label: "1 week before", minutesBefore: 7 * MINUTES_PER_DAY };
const THREE_DAYS_BEFORE: ReminderPreset = { key: "3days", label: "3 days before", minutesBefore: 3 * MINUTES_PER_DAY };
const HOUR_BEFORE: ReminderPreset = { key: "hour", label: "1 hour before", minutesBefore: MINUTES_PER_HOUR };
const FIXED_PRESETS = [WEEK_BEFORE, THREE_DAYS_BEFORE, HOUR_BEFORE];

// "On the day" for this deadline: the minutes from 9 AM on its date to the deadline itself.
// A deadline at 11:59 PM gives 899 minutes; a deadline at or before 9 AM gives 0 or less (not offered)
const onDayPreset = (deadline: Dayjs): ReminderPreset => ({
    key: "on_day",
    label: ON_DAY_LABEL,
    minutesBefore: deadline.diff(deadline.startOf("day").hour(ON_DAY_HOUR), "minute"),
    kind: "on_day",
});

// The preset chips that fit how far away the deadline is:
//   a week or more away  → 1 week before, 3 days before, on the day
//   3 days or more away  → 3 days before, on the day
//   a day or more away   → on the day
//   less than a day away → 1 hour before
// Any preset whose time has already passed (or is under a minute away) is left out.
//
// Example: now = Nov 12, 10 AM, deadline = Nov 14, 11:59 PM (2.5 days away) → [On the day · 9 AM]
export const getReminderPresets = (deadline: DateInput, now: Dayjs): ReminderPreset[] => {
    const end = dayjs(deadline);
    const minutesLeft = end.diff(now, "minute");

    let presets: ReminderPreset[];
    if (minutesLeft >= 7 * MINUTES_PER_DAY) presets = [WEEK_BEFORE, THREE_DAYS_BEFORE, onDayPreset(end)];
    else if (minutesLeft >= 3 * MINUTES_PER_DAY) presets = [THREE_DAYS_BEFORE, onDayPreset(end)];
    else if (minutesLeft >= MINUTES_PER_DAY) presets = [onDayPreset(end)];
    else presets = [HOUR_BEFORE];

    return presets.filter(
        (preset) =>
            // "On the day" for a deadline at or before 9 AM would ring after the deadline
            preset.minutesBefore > 0 && isValidReminderTime(end.subtract(preset.minutesBefore, "minute"), end, now),
    );
};

// The rule every reminder time must follow: at least a minute from now, and before the deadline
// when there is one
export const isValidReminderTime = (time: DateInput, deadline: DateInput | null, now: Dayjs) => {
    const at = dayjs(time);
    const isFarEnoughAhead = !at.isBefore(now.add(1, "minute"));
    const isBeforeDeadline = !deadline || at.isBefore(dayjs(deadline));
    return isFarEnoughAhead && isBeforeDeadline;
};

// ─── 2. Fire time ────────────────────────────────────────────────────────────

// The moment a saved reminder goes off, or null when it can't:
//   - a custom reminder fires at its exact `at` time, with or without a deadline
//   - any other reminder counts back `minutesBefore` from the deadline, so it needs one
//   - an old 0-minute reminder ("at the deadline") gives null: the "Time is over" notification covers it
//
// Notifications pass only a deadline that still matters (status.liveDeadline from lib/status), so a reminder for a
// job you've already applied to doesn't fire.
//
// Example: { minutesBefore: 4320 } with deadline Nov 20, 11:59 PM → Nov 17, 11:59 PM
export const getFireTime = (reminder: Reminder, deadline: DateInput | null): Date | null => {
    if (reminder.at) return dayjs(reminder.at).toDate();
    if (!deadline || reminder.minutesBefore === 0) return null;
    return dayjs(deadline).subtract(reminder.minutesBefore, "minute").toDate();
};

// ─── 3. Labels ───────────────────────────────────────────────────────────────

// An exact reminder time, e.g. "Nov 12, 3:30 PM"
export const formatReminderTime = (time: DateInput) => dayjs(time).format(TIME_FORMAT);

// A distance before the deadline in words: "1 week before", "3 days before", "2 hours before"
const formatMinutesBefore = (minutesBefore: number) => {
    if (minutesBefore === 0) return "On the day";
    if (minutesBefore === WEEK_BEFORE.minutesBefore) return "1 week before";
    if (minutesBefore % MINUTES_PER_DAY === 0) {
        const days = minutesBefore / MINUTES_PER_DAY;
        return days === 1 ? "1 day before" : `${days} days before`;
    }
    const hours = Math.round(minutesBefore / MINUTES_PER_HOUR);
    return hours === 1 ? "1 hour before" : `${hours} hours before`;
};

// How a saved reminder reads on the detail screen:
//   { minutesBefore: 4320 }                    → "3 days before"
//   { kind: "on_day", … }                      → "On the day · 9 AM"
//   { kind: "custom", at: "2026-11-12T…" }     → "Nov 12, 3:30 PM"
// `deadline` is only needed for old custom reminders saved without `at`
export const formatReminder = (reminder: Reminder, deadline?: string | null) => {
    if (reminder.kind === "on_day") return ON_DAY_LABEL;
    if (reminder.kind === "custom") {
        // Custom reminders keep their exact time in `at`; old ones without it count back from the deadline
        const time = reminder.at ?? (deadline ? dayjs(deadline).subtract(reminder.minutesBefore, "minute") : null);
        if (time) return formatReminderTime(time);
    }
    return formatMinutesBefore(reminder.minutesBefore);
};

// ─── 4. Custom times ─────────────────────────────────────────────────────────

// The error for the custom time being picked, or "" when it's fine
export const getCustomTimeError = (time: Date, deadline: Dayjs | null, now: Dayjs) => {
    if (isValidReminderTime(time, deadline, now)) return "";
    return deadline
        ? "Pick a time at least 1 minute from now and before the deadline"
        : "Pick a time at least 1 minute from now";
};

// The error for the custom times already added, or "" when they're all fine. They can go bad
// after being added: the clock moves on while the form is open, or the deadline is moved earlier
export const getCustomTimesError = (times: Date[], deadline: Dayjs | null, now: Dayjs) => {
    if (times.every((time) => isValidReminderTime(time, deadline, now))) return "";
    return deadline ? "Remove reminders that are in the past or after the deadline" : "Remove reminders that are in the past";
};

// "+ Custom" is only offered while there's still time before the deadline
export const canAddCustomTime = (deadline: Dayjs | null, now: Dayjs) =>
    !deadline || deadline.isAfter(now.add(1, "minute"));

// Where the time picker starts: an hour before the deadline (or an hour from now without one),
// or 5 minutes from now when that's already too late. Seconds are zeroed, as the picker has none
export const suggestCustomTime = (deadline: Dayjs | null, now: Dayjs): Date => {
    const anHourBefore = (deadline ? deadline.subtract(1, "hour") : now.add(1, "hour")).second(0).millisecond(0);
    if (isValidReminderTime(anHourBefore, deadline, now)) return anHourBefore.toDate();
    return now.add(5, "minute").second(0).millisecond(0).toDate();
};

// ─── 5. Form round trip ──────────────────────────────────────────────────────

// What the form holds for reminders:
//   presetKeys   the preset chips that are on, e.g. ["week", "on_day"]
//   customTimes  the exact times added with "+ Custom", soonest first
//   alarmKeys    which of those should also ring an alarm: preset keys, or custom keys (see customKey)
export type ReminderChoices = {
    presetKeys: string[];
    customTimes: Date[];
    alarmKeys: string[];
};

// A custom time's key in alarmKeys, e.g. "custom-1762941000000"
export const customKey = (time: Date) => `custom-${time.getTime()}`;

const byTime = (a: Date, b: Date) => a.getTime() - b.getTime();

// Which preset chip a saved reminder belongs to, or undefined for a custom one
const presetKeyOf = (reminder: Reminder) => {
    if (reminder.kind === "on_day") return "on_day";
    if (reminder.kind === "custom") return undefined;
    return FIXED_PRESETS.find((preset) => preset.minutesBefore === reminder.minutesBefore)?.key;
};

// LOAD: saved reminders → the form's choices, when the edit form opens.
//   - a preset reminder turns its chip back on (needs a deadline to count back from)
//   - anything else becomes a custom time, e.g. an old "2 days before" that no chip matches
//   - reminders that already went off, or are turned off, are dropped
//
// Example (deadline Nov 20, 11:59 PM; now Nov 12):
//   [{ minutesBefore: 4320, alarm: true }, { kind: "custom", at: "Nov 15, 6 PM" }]
//   → { presetKeys: ["3days"], customTimes: [Nov 15, 6 PM], alarmKeys: ["3days"] }
export const remindersToChoices = (reminders: Reminder[], deadline: string | null, now: Dayjs): ReminderChoices => {
    const choices: ReminderChoices = { presetKeys: [], customTimes: [], alarmKeys: [] };
    const earliest = now.add(1, "minute");

    for (const reminder of reminders) {
        if (!reminder.enabled) continue;

        const presetKey = presetKeyOf(reminder);
        if (presetKey && deadline) {
            choices.presetKeys.push(presetKey);
            if (reminder.alarm) choices.alarmKeys.push(presetKey);
            continue;
        }

        const fireTime = getFireTime(reminder, deadline);
        if (!fireTime || dayjs(fireTime).isBefore(earliest)) continue;
        const time = dayjs(fireTime).second(0).millisecond(0).toDate();
        choices.customTimes.push(time);
        if (reminder.alarm) choices.alarmKeys.push(customKey(time));
    }

    choices.customTimes.sort(byTime);
    return choices;
};

// SAVE: the form's choices → reminders to store.
//   - a preset chip that no longer fits the deadline is dropped (e.g. "1 week before" after the
//     deadline moved to tomorrow)
//   - a custom time keeps its exact time in `at`, which is all there is when there's no deadline
//   - ids are given in order: r1, r2, …
//   - `kind` and `alarm` are only set when needed, since Firebase rejects undefined values
//
// Example (deadline Nov 20, 11:59 PM):
//   { presetKeys: ["3days"], customTimes: [Nov 20, 9:59 PM], alarmKeys: ["3days"] }
//   → [{ id: "r1", enabled: true, minutesBefore: 4320, alarm: true },
//      { id: "r2", enabled: true, minutesBefore: 120, kind: "custom", at: "…" }]
export const choicesToReminders = (choices: ReminderChoices, deadline: Dayjs | null, now: Dayjs): Reminder[] => {
    const presets = deadline ? getReminderPresets(deadline, now) : [];
    const isAlarm = (key: string) => choices.alarmKeys.includes(key);

    const fromPresets = presets
        .filter((preset) => choices.presetKeys.includes(preset.key))
        .map((preset) => ({
            minutesBefore: preset.minutesBefore,
            ...(preset.kind && { kind: preset.kind }),
            ...(isAlarm(preset.key) && { alarm: true }),
        }));

    const fromCustomTimes = choices.customTimes.map((time) => ({
        minutesBefore: deadline ? deadline.diff(time, "minute") : 0,
        kind: "custom" as const,
        at: time.toISOString(),
        ...(isAlarm(customKey(time)) && { alarm: true }),
    }));

    return [...fromPresets, ...fromCustomTimes].map((reminder, i) => ({ id: `r${i + 1}`, enabled: true, ...reminder }));
};

// The picked reminders in the order the form shows them, each with its key and label, so the form
// can offer "Notification / + Alarm" for each one
export const listPickedReminders = (choices: ReminderChoices, presets: ReminderPreset[]) => [
    ...presets
        .filter((preset) => choices.presetKeys.includes(preset.key))
        .map((preset) => ({ key: preset.key, label: preset.label })),
    ...choices.customTimes.map((time) => ({ key: customKey(time), label: formatReminderTime(time) })),
];
