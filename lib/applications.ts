import dayjs, { type Dayjs } from "dayjs";
import type { ImageSourcePropType } from "react-native";
import { icons } from "@/constants/icons";
import { getStatus, type StatusEvent } from "@/lib/status";

export const TYPE_META: Record<ApplicationType, { label: string; chipClass: string; icon: ImageSourcePropType }> = {
    job: { label: "Job", chipClass: "bg-job", icon: icons.briefcase },
    university: { label: "University", chipClass: "bg-university", icon: icons.university },
    professor: { label: "Professor", chipClass: "bg-professor", icon: icons.mail },
};

type StageTone = "muted" | "dark" | "accent" | "positive";

// accent = needs your attention, dark = sent and in progress, positive = good outcome
export const STAGE_META: Record<ApplicationStage, { label: string; tone: StageTone }> = {
    saved: { label: "Saved", tone: "muted" },
    applied: { label: "Applied", tone: "dark" },
    interview: { label: "Interview", tone: "accent" },
    offer: { label: "Offer", tone: "positive" },
    rejected: { label: "Rejected", tone: "muted" },
    preparing: { label: "Preparing", tone: "muted" },
    submitted: { label: "Submitted", tone: "dark" },
    under_review: { label: "Under review", tone: "dark" },
    admitted: { label: "Admitted", tone: "positive" },
    draft: { label: "Draft", tone: "muted" },
    sent: { label: "Waiting", tone: "dark" },
    follow_up_due: { label: "Follow up due", tone: "accent" },
    replied: { label: "Replied", tone: "positive" },
    declined: { label: "Declined", tone: "muted" },
};

export const STAGE_TONE_CLASSES: Record<StageTone, { pill: string; text: string }> = {
    muted: { pill: "bg-muted", text: "text-primary" },
    dark: { pill: "bg-primary", text: "text-background" },
    accent: { pill: "bg-accent", text: "text-primary" },
    positive: { pill: "bg-professor", text: "text-primary" },
};

// Stage order and the follow-up delay belong to stage changes; re-exported so existing imports keep working
export { FOLLOW_UP_DAYS, STAGES_BY_TYPE } from "@/lib/stage-transition";

// Reminder presets, fire times and labels live in lib/reminders

export type ApplicationFilter = "all" | ApplicationType;

export const APPLICATION_FILTERS: { key: ApplicationFilter; label: string; chipClass: string }[] = [
    { key: "all", label: "All", chipClass: "bg-card" },
    { key: "job", label: "Jobs", chipClass: "bg-job" },
    { key: "university", label: "University", chipClass: "bg-university" },
    { key: "professor", label: "Prof", chipClass: "bg-professor" },
];

// What each stage means (to do, waiting, closed…), which date matters, the stepper and the
// calendar dates all come from getStatus in lib/status, one module per type

// Morning from 6:00 AM, noon from 12:00 PM, afternoon from 4:00 PM,
// evening from 6:30 PM, night from 7:30 PM until 6:00 AM
export const getGreeting = (now: Dayjs) => {
    const minutes = now.hour() * 60 + now.minute();
    if (minutes < 6 * 60) return "Good night,";
    if (minutes < 12 * 60) return "Good morning,";
    if (minutes < 16 * 60) return "Good noon,";
    if (minutes < 18 * 60 + 30) return "Good afternoon,";
    if (minutes < 19 * 60 + 30) return "Good evening,";
    return "Good night,";
};

export const getInitials = (name: string) =>
    name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");

// How far a date is from now, in either direction (`inPast` is true once it has passed):
//   a day or more -> whole days ("2" "days"), under a day -> "5h 20m", under an hour -> "45" "min"
export const getTimeDistance = (date: string, now: Dayjs) => {
    const target = dayjs(date);
    const minutes = Math.abs(target.diff(now, "minute"));
    const inPast = target.isBefore(now);

    if (minutes >= 1440) {
        const days = Math.floor(minutes / 1440);
        return { value: String(days), unit: days === 1 ? "day" : "days", inPast };
    }
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return { value: rest ? `${hours}h ${rest}m` : `${hours}h`, unit: "", inPast };
    }
    // Never "0 min": the last minute still reads "1 min"
    return { value: String(Math.max(1, minutes)), unit: "min", inPast };
};

// "2 days", "5h 20m", "45 min"
export const formatTimeDistance = (date: string, now: Dayjs) => {
    const { value, unit } = getTimeDistance(date, now);
    return unit ? `${value} ${unit}` : value;
};

export const formatDaysLeft = (deadline: string, now: Dayjs) =>
    dayjs(deadline).isBefore(now) ? "Deadline passed" : `${formatTimeDistance(deadline, now)} left`;

export const formatDaysAgo = (date: string, now: Dayjs) => {
    const days = now.startOf("day").diff(dayjs(date).startOf("day"), "day");
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return `${days} days ago`;
};

// Applications you still need to act on before a deadline in the next 7 days, soonest first
export const getDueSoon = (applications: Application[], now: Dayjs) =>
    applications
        .filter((a) => {
            const deadline = getStatus(a, now).liveDeadline;
            return !!deadline && dayjs(deadline).isAfter(now) && !dayjs(deadline).isAfter(now.add(7, "day"));
        })
        .sort((a, b) => dayjs(a.deadline).valueOf() - dayjs(b.deadline).valueOf());

export type AwaitingReply = Application;

// Still waiting on the other side (phase "waiting"), the one you've waited on longest first
export const getAwaitingReplies = (applications: Application[]) =>
    applications
        .filter((a) => getStatus(a).phase === "waiting")
        .sort((a, b) => dayjs(getStatus(a).sentAt).valueOf() - dayjs(getStatus(b).sentAt).valueOf());

// The date line on a list card, in words: "Interview Nov 25", "Applied Nov 15",
// "Follow up", "Missed Nov 20", "Nov 20"… `urgent` paints it red.
// Which date it is comes from the status; this only words it
export const getCardDate = (application: Application, now: Dayjs): { label: string; urgent: boolean } | null => {
    const key = getStatus(application, now).keyDate;
    if (!key) return null;

    const day = (date: string) => dayjs(date).format("MMM D");
    const isWithinWeek = (date: string) => dayjs(date).startOf("day").diff(now.startOf("day"), "day") <= 7;

    switch (key.kind) {
        case "interview":
            return { label: `Interview ${day(key.date)}`, urgent: dayjs(key.date).isAfter(now) && isWithinWeek(key.date) };
        case "applied":
            return { label: `Applied ${day(key.date)}`, urgent: false };
        case "submitted":
            return { label: `Submitted ${day(key.date)}`, urgent: false };
        case "replied":
            return { label: key.date ? `Replied ${day(key.date)}` : "Replied", urgent: false };
        case "follow_up":
            if (key.due) return { label: "Follow up", urgent: true };
            return key.date ? { label: `Follow up ${day(key.date)}`, urgent: false } : null;
        case "outcome":
            // The stage pill already says it
            return null;
        case "deadline":
            // A deadline that no longer matters (already applied…) isn't worth a line
            if (!key.live) return null;
            if (!dayjs(key.date).isAfter(now)) return { label: `Missed ${day(key.date)}`, urgent: false };
            return { label: day(key.date), urgent: isWithinWeek(key.date) };
    }
};

// 0 = something to act on ahead, 1 = nothing to act on, 2 = the date to act by has passed
const getSortGroup = (actionDate: string | null, now: Dayjs) => {
    if (!actionDate) return 1;
    return dayjs(actionDate).isAfter(now) ? 0 : 2;
};

// Sorted by the next date you have to act by (status.actionDate: a live deadline, an interview,
// a follow-up): upcoming ones first (soonest first), then items with nothing to act on
// (latest change first), then passed ones (the one that passed most recently first)
export const sortApplications = (applications: Application[], now: Dayjs) => {
    const actionDate = new Map(applications.map((a) => [a.id, getStatus(a, now).actionDate]));
    return [...applications].sort((a, b) => {
        const dateA = actionDate.get(a.id) ?? null;
        const dateB = actionDate.get(b.id) ?? null;
        const groupA = getSortGroup(dateA, now);
        const groupB = getSortGroup(dateB, now);
        if (groupA !== groupB) return groupA - groupB;
        if (groupA === 1) return dayjs(b.updatedAt).valueOf() - dayjs(a.updatedAt).valueOf();
        // Smallest distance from now first, whether the date is ahead or behind
        return Math.abs(dayjs(dateA).diff(now)) - Math.abs(dayjs(dateB).diff(now));
    });
};

// Matches the query against the name, organization, place, research area and stage
export const matchesSearch = (application: Application, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    const fields = [application.title, application.organization, STAGE_META[application.stage].label];
    if (application.type === "job") fields.push(application.location ?? "");
    if (application.type === "university") fields.push(application.country ?? "");
    if (application.type === "professor") fields.push(application.researchArea ?? "", application.contactEmail);

    return fields.some((field) => field.toLowerCase().includes(q));
};

export const findApplication = (applications: Application[], id: string) => applications.find((a) => a.id === id);

// Professors whose email is about this university application
export const getLinkedProfessors = (applications: Application[], universityId: string) =>
    applications.filter((a): a is ProfessorApplication => a.type === "professor" && a.linkedApplicationId === universityId);

export const getWeekSummary = (applications: Application[], now: Dayjs) => {
    const weekEnd = now.add(7, "day");
    const isThisWeek = (date?: string | null) => !!date && dayjs(date).isAfter(now) && dayjs(date).isBefore(weekEnd);
    const statuses = applications.map((a) => getStatus(a, now));

    return {
        dueThisWeek: statuses.filter((s) => isThisWeek(s.liveDeadline)).length,
        upcomingInterviews: applications.filter((a) => a.type === "job" && isThisWeek(a.interviewAt)).length,
        awaitingReply: statuses.filter((s) => s.phase === "waiting").length,
        // Everything past "to do" has been applied, submitted or emailed
        submitted: statuses.filter((s) => s.phase !== "to_do").length,
        total: applications.length,
    };
};

export type CalendarEvent = {
    id: string;
    applicationId: string;
    type: ApplicationType;
    date: ISODateString;
    title: string;
    meta: string;
};

// Every dated thing worth seeing on the calendar: live deadlines, interviews,
// emails sent to professors and their follow-ups. Which dates come from the status
// (status.events); this only words them
export const getCalendarEvents = (applications: Application[]): CalendarEvent[] => {
    // "Machine Learning Lab · University of Alberta" → "Machine Learning Lab"
    const shortOrg = (application: Application) => application.organization.split("·")[0].trim();

    const words = (a: Application, kind: StatusEvent["kind"]) => {
        switch (kind) {
            case "deadline":
                return { title: a.title, meta: `Deadline · ${a.organization}` };
            case "interview":
                return { title: "Interview", meta: `${a.title} · ${(a.type === "job" ? a.interviewMode : undefined) ?? a.organization}` };
            case "sent":
                return { title: `Emailed ${a.title}`, meta: `Professor · ${shortOrg(a)}` };
            case "follow_up":
                return { title: `Follow up: ${a.title}`, meta: `Professor · ${shortOrg(a)}` };
        }
    };

    const events = applications.flatMap((a) =>
        getStatus(a).events.map((event) => ({
            // "follow-up" (not follow_up) keeps the ids the calendar already used
            id: `${a.id}-${event.kind === "follow_up" ? "follow-up" : event.kind}`,
            applicationId: a.id,
            type: a.type,
            date: event.date,
            ...words(a, event.kind),
        })),
    );

    return events.sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());
};

// Groups events by day, keyed "YYYY-MM-DD"
export const groupEventsByDay = (events: CalendarEvent[]) =>
    events.reduce<Record<string, CalendarEvent[]>>((groups, event) => {
        const key = dayjs(event.date).format("YYYY-MM-DD");
        (groups[key] ??= []).push(event);
        return groups;
    }, {});

// The days to draw for a month, Sunday first, with nulls padding the first week
export const getMonthGrid = (month: Dayjs) => {
    const start = month.startOf("month");
    const blanks: (Dayjs | null)[] = Array.from({ length: start.day() }, () => null);
    const days = Array.from({ length: start.daysInMonth() }, (_, i) => start.add(i, "day"));
    return [...blanks, ...days];
};

// Numbers for the profile tiles
export const getProfileStats = (applications: Application[]) => {
    const jobs = applications.filter((a): a is JobApplication => a.type === "job");
    // Past "to do" = the application or email went out
    const isSent = (a: Application) => getStatus(a).phase !== "to_do";
    const emailed = applications.filter((a): a is ProfessorApplication => a.type === "professor" && isSent(a));

    return {
        jobsApplied: jobs.filter(isSent).length,
        interviews: jobs.filter((a) => !!a.interviewAt).length,
        professorsReplied: emailed.filter((a) => a.stage === "replied").length,
        professorsEmailed: emailed.length,
    };
};
