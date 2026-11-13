import dayjs, { type Dayjs } from "dayjs";
import { listReminders } from "@/lib/reminder-plan";
import { isValidReminderTime } from "@/lib/reminders";
import { changeStage, STAGES_BY_TYPE } from "@/lib/stage-transition";

// The changes the research agent's write tools make, worked out but not saved: each function takes
// the model's input and returns either the new data or an error message the model can act on.
// Saving is done by application-tools.ts. Nothing here deletes or overwrites what the user saved;
// every change only adds (a new application, a reminder, a note).

// Formats a date in the phone's time zone, like the rest of the tool output
const time = (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm");

// The model's text, trimmed and capped; "" and anything that isn't text become undefined
const text = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "") || undefined;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_PATTERN = /^https?:\/\/\S+$/i;

// ── create_application ───────────────────────────────────────────────────────────────────────────

// A new application, built like the form builds one: it starts at the type's first stage (saved,
// preparing or draft), with no reminders. Refuses a duplicate of one already saved
export const newApplication = (input: Record<string, unknown>, saved: Application[], now: Dayjs = dayjs()): ApplicationInput | string => {
    const { type } = input;
    if (type !== "job" && type !== "university" && type !== "professor") return 'type must be "job", "university" or "professor"';

    const title = text(input.title);
    const organization = text(input.organization);
    if (!title || !organization) return "title and organization are required";

    const duplicate = saved.find((a) => a.type === type && same(a.title, title) && same(a.organization, organization));
    if (duplicate) return `It's already saved (id ${duplicate.id}). Use that one instead of adding it again`;

    let deadline: ISODateString | null = null;
    if (input.deadline !== null && input.deadline !== undefined) {
        const parsed = dayjs(String(input.deadline));
        if (!parsed.isValid()) return "deadline must be a date and time like 2026-11-30T23:59:00+06:00, or null";
        if (!parsed.isAfter(now)) return "That deadline has already passed. Tell the user instead of saving it";
        deadline = parsed.toISOString();
    }

    const link = text(input.link, 500);
    if (link && !LINK_PATTERN.test(link)) return "link must be a full web address starting with https://, or null";

    const contactEmail = text(input.contactEmail);
    if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) return "contactEmail isn't a valid email address";

    // Undefined fields are fine: the database leaves them out
    const common = { title, organization, deadline, link, notes: text(input.notes, 2000), reminders: [] };
    // The stage, its date and the timeline, exactly as a new application from the form gets them
    const start = changeStage({ type }, STAGES_BY_TYPE[type][0], { now: now.toDate() });

    switch (start.type) {
        case "job":
            return { ...common, ...start, location: text(input.location), interviewAt: null };
        case "university":
            return { ...common, ...start, country: text(input.country, 80), intake: text(input.intake, 80), documents: [] };
        case "professor":
            // The professor's email is what the whole professor workflow is built around
            if (!contactEmail) return "A professor needs a contact email. Find it on their page, or ask the user";
            return { ...common, ...start, contactEmail, researchArea: text(input.researchArea) };
    }
};

// ── add_note ─────────────────────────────────────────────────────────────────────────────────────

export const MAX_NOTE_CHARS = 2000;

// The application with `note` added after its existing notes, under a line saying where it came from,
// so the user can tell their own notes from the agent's
export const withNote = (application: Application, note: unknown, now: Dayjs = dayjs()): Application | string => {
    const body = text(note, MAX_NOTE_CHARS);
    if (!body) return "text is required";
    const added = `Saved by Ask NextStep · ${now.format("D MMM YYYY")}\n${body}`;
    const notes = application.notes?.trim() ? `${application.notes.trim()}\n\n${added}` : added;
    return { ...application, notes };
};

// ── add_notification / add_alarm ─────────────────────────────────────────────────────────────────

// The next free id among an application's reminders: r1, r2, … (the form numbers them the same way)
const nextReminderId = (reminders: Reminder[]) => {
    const used = reminders.map((reminder) => Number(/^r(\d+)$/.exec(reminder.id)?.[1] ?? 0));
    return `r${Math.max(0, ...used) + 1}`;
};

// The application with one more reminder, the same shape the form saves for a time picked with
// "+ Custom". `alarm` makes it ring like an alarm instead of a plain notification
export const withReminder = (application: Application, at: unknown, alarm: boolean, now: Dayjs = dayjs()): Application | string => {
    const when = typeof at === "string" ? dayjs(at) : null;
    if (!when?.isValid()) return "at must be a date and time like 2026-11-20T21:00:00+06:00";

    if (!isValidReminderTime(when, application.deadline, now)) {
        return application.deadline
            ? `The time must be at least a minute from now and before the deadline (${time(application.deadline)})`
            : "The time must be at least a minute from now";
    }

    const reminder: Reminder = {
        id: nextReminderId(application.reminders),
        enabled: true,
        kind: "custom",
        at: when.toISOString(),
        minutesBefore: application.deadline ? dayjs(application.deadline).diff(when, "minute") : 0,
        // Only set when true: Firebase rejects undefined values
        ...(alarm && { alarm: true }),
    };
    const updated: Application = { ...application, reminders: [...application.reminders, reminder] };

    // The reminder plan skips reminders of a finished application or a deadline that no longer
    // matters (e.g. already applied), so one that would never go off isn't saved
    const goesOff = listReminders([updated], now.toDate()).some((planned) => planned.id === `${application.id}:${reminder.id}`);
    if (!goesOff) return `It wouldn't go off: ${application.title} is finished or its deadline no longer applies`;
    return updated;
};
