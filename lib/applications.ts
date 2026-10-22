import dayjs, { type Dayjs } from "dayjs";
import type { ImageSourcePropType } from "react-native";
import { icons } from "@/constants/icons";

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

// Reminders a new deadline starts with, in minutes before it (3 days and 1 day)
export const DEFAULT_REMINDERS = [4320, 1440];

// How long to wait for a professor's reply before following up
export const FOLLOW_UP_DAYS = 7;

export type ApplicationFilter = "all" | ApplicationType;

export const APPLICATION_FILTERS: { key: ApplicationFilter; label: string; chipClass: string }[] = [
    { key: "all", label: "All", chipClass: "bg-card" },
    { key: "job", label: "Jobs", chipClass: "bg-job" },
    { key: "university", label: "University", chipClass: "bg-university" },
    { key: "professor", label: "Prof", chipClass: "bg-professor" },
];

// Stages where nothing is left to do, so their deadlines no longer matter
const CLOSED_STAGES: ApplicationStage[] = ["rejected", "admitted", "declined", "replied"];

// Stages that mean the application or email hasn't been sent yet
const NOT_SUBMITTED_STAGES: ApplicationStage[] = ["saved", "preparing", "draft"];

const isOpen = (application: Application) => !CLOSED_STAGES.includes(application.stage);

// A deadline only matters while you still have to act: before applying or
// submitting, or while an offer waits for your answer
const DEADLINE_STAGES: ApplicationStage[] = ["saved", "preparing", "offer"];

const hasLiveDeadline = (application: Application) =>
    !!application.deadline && DEADLINE_STAGES.includes(application.stage);

export const getGreeting = (now: Dayjs) => {
    const hour = now.hour();
    if (hour < 12) return "Good morning,";
    if (hour < 17) return "Good afternoon,";
    return "Good evening,";
};

export const getInitials = (name: string) =>
    name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");

// How far a date is from now: hours when it's less than a day away, otherwise calendar days.
// `inPast` is true once the date has passed.
export const getTimeDistance = (date: string, now: Dayjs) => {
    const target = dayjs(date);
    const hours = Math.abs(target.diff(now, "hour", true));
    const inPast = target.isBefore(now);

    if (hours < 24) {
        // Round up, so 20 minutes away still reads "1 hour" rather than "0 hours"
        const value = Math.max(1, Math.ceil(hours));
        return { value, unit: value === 1 ? "hour" : "hours", inPast };
    }
    const days = Math.abs(target.startOf("day").diff(now.startOf("day"), "day"));
    return { value: days, unit: days === 1 ? "day" : "days", inPast };
};

export const formatDaysLeft = (deadline: string, now: Dayjs) => {
    const { value, unit, inPast } = getTimeDistance(deadline, now);
    return inPast ? "Deadline passed" : `${value} ${unit} left`;
};

export const formatDaysAgo = (date: string, now: Dayjs) => {
    const days = now.startOf("day").diff(dayjs(date).startOf("day"), "day");
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return `${days} days ago`;
};

// Applications you still need to act on before a deadline that's still ahead, soonest first
export const getDueSoon = (applications: Application[], now: Dayjs) =>
    applications
        .filter((a) => hasLiveDeadline(a) && dayjs(a.deadline).isAfter(now))
        .sort((a, b) => dayjs(a.deadline).valueOf() - dayjs(b.deadline).valueOf());

export type AwaitingReply = Application;

// When the user started waiting: applied for the job, submitted to the university, or emailed the professor
export const getWaitingSince = (item: AwaitingReply) => {
    if (item.type === "job") return item.appliedAt;
    if (item.type === "university") return item.submittedAt;
    return item.sentAt;
};

// Still waiting on the other side, oldest first:
//   jobs that are applied or at interview (not yet offered or rejected),
//   universities that are submitted or under review (not yet admitted or rejected),
//   professors who haven't replied
export const getAwaitingReplies = (applications: Application[]) =>
    applications
        .filter(
            (a) =>
                (a.type === "job" && (a.stage === "applied" || a.stage === "interview")) ||
                (a.type === "university" && (a.stage === "submitted" || a.stage === "under_review")) ||
                (a.type === "professor" && (a.stage === "sent" || a.stage === "follow_up_due")),
        )
        .sort((a, b) => dayjs(getWaitingSince(a)).valueOf() - dayjs(getWaitingSince(b)).valueOf());

export const needsFollowUp = (professor: ProfessorApplication, now: Dayjs) =>
    professor.stage === "follow_up_due" || (professor.followUpAt !== null && !dayjs(professor.followUpAt).isAfter(now));

// The one date worth showing on a card: the deadline, or the follow-up for a professor
export const getCardDate = (application: Application, now: Dayjs): { label: string; urgent: boolean } | null => {
    if (application.type === "professor") {
        if (application.stage === "replied") {
            return { label: application.repliedAt ? `Replied ${dayjs(application.repliedAt).format("MMM D")}` : "Replied", urgent: false };
        }
        if (application.stage === "declined" || application.stage === "draft") return null;
        if (needsFollowUp(application, now)) return { label: "Follow up", urgent: true };
        return application.followUpAt ? { label: `Follow up ${dayjs(application.followUpAt).format("MMM D")}`, urgent: false } : null;
    }

    const isWithinWeek = (date: string) => dayjs(date).startOf("day").diff(now.startOf("day"), "day") <= 7;

    // Already sent: show where it stands instead of the old deadline
    if (application.type === "job" && application.stage === "interview" && application.interviewAt) {
        const upcoming = dayjs(application.interviewAt).isAfter(now);
        return {
            label: `Interview ${dayjs(application.interviewAt).format("MMM D")}`,
            urgent: upcoming && isWithinWeek(application.interviewAt),
        };
    }
    if (application.type === "job" && (application.stage === "applied" || application.stage === "interview")) {
        return application.appliedAt ? { label: `Applied ${dayjs(application.appliedAt).format("MMM D")}`, urgent: false } : null;
    }
    if (application.type === "university" && (application.stage === "submitted" || application.stage === "under_review")) {
        return application.submittedAt ? { label: `Submitted ${dayjs(application.submittedAt).format("MMM D")}`, urgent: false } : null;
    }

    if (!hasLiveDeadline(application)) return null;
    const deadline = dayjs(application.deadline);
    if (!deadline.isAfter(now)) return { label: `Missed ${deadline.format("MMM D")}`, urgent: false };
    return { label: deadline.format("MMM D"), urgent: isWithinWeek(deadline.toISOString()) };
};

// The next date that matters, used to put the most pressing items first
const getNextDate = (application: Application, now: Dayjs) => {
    let date: string | null | undefined = null;
    if (application.type === "professor") date = application.followUpAt;
    else if (application.type === "job" && application.stage === "interview") date = application.interviewAt;
    else if (hasLiveDeadline(application)) date = application.deadline;
    return date && dayjs(date).isAfter(now.subtract(1, "day")) ? dayjs(date).valueOf() : Infinity;
};

// Open items first, soonest date first; finished ones (rejected, admitted, replied…) at the end
export const sortApplications = (applications: Application[], now: Dayjs) =>
    [...applications].sort((a, b) => {
        if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
        if (!isOpen(a)) return dayjs(b.updatedAt).valueOf() - dayjs(a.updatedAt).valueOf();
        return getNextDate(a, now) - getNextDate(b, now);
    });

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

export const formatReminder = (minutesBefore: number) => {
    if (minutesBefore === 0) return "On the day";
    if (minutesBefore % 1440 === 0) {
        const days = minutesBefore / 1440;
        return days === 1 ? "1 day before" : `${days} days before`;
    }
    const hours = Math.round(minutesBefore / 60);
    return hours === 1 ? "1 hour before" : `${hours} hours before`;
};

export type StepState = "done" | "current" | "todo" | "failed";

// The progress steps for each type; a bad outcome replaces the last step
export const getSteps = (application: Application): { label: string; state: StepState }[] => {
    const build = (labels: string[], current: number, failedLabel?: string) =>
        labels.map((label, index) => {
            if (failedLabel && index === labels.length - 1) return { label: failedLabel, state: "failed" as const };
            if (index < current) return { label, state: "done" as const };
            if (index === current) return { label, state: failedLabel ? ("done" as const) : ("current" as const) };
            return { label, state: "todo" as const };
        });

    if (application.type === "job") {
        const labels = ["Saved", "Applied", "Interview", "Offer"];
        if (application.stage === "rejected") return build(labels, application.interviewAt ? 2 : 1, "Rejected");
        const current = { saved: 0, applied: 1, interview: 2, offer: 3 }[application.stage];
        return build(labels, current).map((s, i) => (i === 3 && current === 3 ? { ...s, state: "done" as const } : s));
    }

    if (application.type === "university") {
        const labels = ["Preparing", "Submitted", "Review", "Admitted"];
        if (application.stage === "rejected") return build(labels, 2, "Rejected");
        const current = { preparing: 0, submitted: 1, under_review: 2, admitted: 3 }[application.stage];
        return build(labels, current).map((s, i) => (i === 3 && current === 3 ? { ...s, state: "done" as const } : s));
    }

    const labels = ["Draft", "Sent", "Follow up", "Replied"];
    if (application.stage === "declined") return build(labels, 1, "Declined");
    const current = { draft: 0, sent: 1, follow_up_due: 2, replied: 3 }[application.stage];
    return build(labels, current).map((s, i) => (i === 3 && current === 3 ? { ...s, state: "done" as const } : s));
};

export const getWeekSummary = (applications: Application[], now: Dayjs) => {
    const weekEnd = now.add(7, "day");
    const isThisWeek = (date?: string | null) => !!date && dayjs(date).isAfter(now) && dayjs(date).isBefore(weekEnd);

    return {
        dueThisWeek: applications.filter((a) => hasLiveDeadline(a) && isThisWeek(a.deadline)).length,
        upcomingInterviews: applications.filter((a) => a.type === "job" && isThisWeek(a.interviewAt)).length,
        awaitingReply: getAwaitingReplies(applications).length,
        submitted: applications.filter((a) => !NOT_SUBMITTED_STAGES.includes(a.stage)).length,
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
// emails sent to professors and their follow-ups
export const getCalendarEvents = (applications: Application[]): CalendarEvent[] => {
    const events: CalendarEvent[] = [];
    const add = (application: Application, kind: string, date: string | null | undefined, title: string, meta: string) => {
        if (date) events.push({ id: `${application.id}-${kind}`, applicationId: application.id, type: application.type, date, title, meta });
    };
    // "Machine Learning Lab · University of Alberta" → "Machine Learning Lab"
    const shortOrg = (application: Application) => application.organization.split("·")[0].trim();

    applications.forEach((a) => {
        if (hasLiveDeadline(a)) add(a, "deadline", a.deadline, a.title, `Deadline · ${a.organization}`);
        if (a.type === "job" && a.stage === "interview") {
            add(a, "interview", a.interviewAt, "Interview", `${a.title} · ${a.interviewMode ?? a.organization}`);
        }
        if (a.type === "professor") {
            add(a, "sent", a.sentAt, `Emailed ${a.title}`, `Professor · ${shortOrg(a)}`);
            if (a.stage === "sent" || a.stage === "follow_up_due") {
                add(a, "follow-up", a.followUpAt, `Follow up: ${a.title}`, `Professor · ${shortOrg(a)}`);
            }
        }
    });

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
    const emailed = applications.filter((a): a is ProfessorApplication => a.type === "professor" && a.stage !== "draft");

    return {
        jobsApplied: jobs.filter((a) => a.stage !== "saved").length,
        interviews: jobs.filter((a) => !!a.interviewAt).length,
        professorsReplied: emailed.filter((a) => a.stage === "replied").length,
        professorsEmailed: emailed.length,
    };
};

// Short form for a pill: 4320 → "3d", 120 → "2h", 0 → "On day"
export const formatReminderShort = (minutesBefore: number) => {
    if (minutesBefore === 0) return "On day";
    if (minutesBefore % 1440 === 0) return `${minutesBefore / 1440}d`;
    return `${Math.round(minutesBefore / 60)}h`;
};
