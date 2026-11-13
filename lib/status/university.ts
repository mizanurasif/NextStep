import { buildSteps, deadlineEvents, deadlineKeyDate, deadlineMatters, type ApplicationStatus, type KeyDate, type Phase } from "@/lib/status/shared";

// Every rule about where a university application stands. See lib/status/shared.ts for the shapes.

// What each stage means. `satisfies` makes a new UniversityStage without a row a type error
const PHASES = {
    preparing: "to_do", // gathering documents, not submitted yet
    submitted: "waiting",
    under_review: "waiting",
    admitted: "closed",
    rejected: "closed",
} satisfies Record<UniversityStage, Phase>;

const STEP_LABELS = ["Preparing", "Submitted", "Review", "Admitted"];
const STEP_OF = { preparing: 0, submitted: 1, under_review: 2, admitted: 3 } satisfies Record<
    Exclude<UniversityStage, "rejected">,
    number
>;

// The one date to show: the decision once there is one, the day you submitted while
// waiting, otherwise the deadline
const keyDate = (university: UniversityApplication, phase: Phase): KeyDate | null => {
    if (university.stage === "admitted") return { kind: "outcome", outcome: "admitted" };
    if (university.stage === "rejected") return { kind: "outcome", outcome: "not_admitted" };
    if (phase === "waiting" && university.submittedAt) return { kind: "submitted", date: university.submittedAt };
    return deadlineKeyDate(university, phase);
};

export const universityStatus = (university: UniversityApplication): ApplicationStatus => {
    const phase = PHASES[university.stage];
    const liveDeadline = deadlineMatters(phase) ? university.deadline : null;

    return {
        phase,
        liveDeadline,
        sentAt: university.submittedAt,
        followUpDue: false,
        keyDate: keyDate(university, phase),
        actionDate: liveDeadline,
        // A rejection comes after review, so the first three steps happened
        steps:
            university.stage === "rejected"
                ? buildSteps(STEP_LABELS, 2, "Rejected")
                : buildSteps(STEP_LABELS, STEP_OF[university.stage]),
        events: deadlineEvents(liveDeadline),
    };
};
