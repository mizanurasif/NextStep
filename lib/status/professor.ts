import dayjs, { type Dayjs } from "dayjs";
import { buildSteps, deadlineEvents, deadlineKeyDate, deadlineMatters, type ApplicationStatus, type KeyDate, type Phase, type StatusEvent } from "@/lib/status/shared";

// Every rule about where an email to a professor stands. See lib/status/shared.ts for the shapes.

// What each stage means. `satisfies` makes a new ProfessorStage without a row a type error
const PHASES = {
    draft: "to_do", // not emailed yet
    sent: "waiting", // emailed, waiting for a reply
    follow_up_due: "waiting", // still no reply, and it's time to nudge
    replied: "closed",
    declined: "closed",
} satisfies Record<ProfessorStage, Phase>;

const STEP_LABELS = ["Draft", "Sent", "Follow up", "Replied"];
const STEP_OF = { draft: 0, sent: 1, follow_up_due: 2, replied: 3 } satisfies Record<Exclude<ProfessorStage, "declined">, number>;

// Still waiting, and it's time to follow up: the stage was set to "follow up due",
// or the follow-up date has arrived
const isFollowUpDue = (professor: ProfessorApplication, phase: Phase, now: Dayjs) =>
    phase === "waiting" &&
    (professor.stage === "follow_up_due" || (!!professor.followUpAt && !dayjs(professor.followUpAt).isAfter(now)));

// The one date to show. Before the email goes out it's the deadline, like the other types;
// after that it's about the conversation: the reply, or when to follow up
const keyDate = (professor: ProfessorApplication, phase: Phase, followUpDue: boolean): KeyDate | null => {
    if (professor.stage === "draft") return deadlineKeyDate(professor, phase);
    if (professor.stage === "replied") return { kind: "replied", date: professor.repliedAt ?? null };
    if (professor.stage === "declined") return { kind: "outcome", outcome: "declined" };
    if (followUpDue) return { kind: "follow_up", date: professor.followUpAt, due: true };
    if (professor.followUpAt) return { kind: "follow_up", date: professor.followUpAt, due: false };
    return null;
};

export const professorStatus = (professor: ProfessorApplication, now: Dayjs): ApplicationStatus => {
    const phase = PHASES[professor.stage];
    const liveDeadline = deadlineMatters(phase) ? professor.deadline : null;
    const followUpDue = isFollowUpDue(professor, phase, now);
    // The follow-up only matters while waiting for a reply
    const followUp = phase === "waiting" ? professor.followUpAt : null;

    const events: StatusEvent[] = deadlineEvents(liveDeadline);
    if (professor.sentAt) events.push({ kind: "sent", date: professor.sentAt });
    if (followUp) events.push({ kind: "follow_up", date: followUp });

    return {
        phase,
        liveDeadline,
        sentAt: professor.sentAt,
        followUpDue,
        keyDate: keyDate(professor, phase, followUpDue),
        actionDate: followUp ?? liveDeadline,
        // A decline comes as a reply to the email, so "Sent" happened
        steps:
            professor.stage === "declined"
                ? buildSteps(STEP_LABELS, 1, "Declined")
                : buildSteps(STEP_LABELS, STEP_OF[professor.stage]),
        events,
    };
};
