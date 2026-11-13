import { buildSteps, deadlineEvents, deadlineKeyDate, deadlineMatters, type ApplicationStatus, type KeyDate, type Phase } from "@/lib/status/shared";

// Every rule about where a job application stands. See lib/status/shared.ts for the shapes.

// What each stage means. `satisfies` makes a new JobStage without a row a type error
const PHASES = {
    saved: "to_do", // found it, haven't applied yet
    applied: "waiting", // applied, waiting to hear back
    interview: "waiting", // invited to interview, waiting on the outcome
    offer: "decide", // got an offer; answer it by the deadline
    rejected: "closed",
} satisfies Record<JobStage, Phase>;

const STEP_LABELS = ["Saved", "Applied", "Interview", "Offer"];
const STEP_OF = { saved: 0, applied: 1, interview: 2, offer: 3 } satisfies Record<Exclude<JobStage, "rejected">, number>;

// The one date to show, in order of what matters most:
//   an interview date > the day you applied > "not selected" > the deadline
const keyDate = (job: JobApplication, phase: Phase): KeyDate | null => {
    if (job.stage === "interview" && job.interviewAt) return { kind: "interview", date: job.interviewAt };
    if (phase === "waiting" && job.appliedAt) return { kind: "applied", date: job.appliedAt };
    if (job.stage === "rejected") return { kind: "outcome", outcome: "not_selected" };
    return deadlineKeyDate(job, phase);
};

export const jobStatus = (job: JobApplication): ApplicationStatus => {
    const phase = PHASES[job.stage];
    const liveDeadline = deadlineMatters(phase) ? job.deadline : null;
    // At the interview stage, the interview is what's coming up
    const interview = job.stage === "interview" ? (job.interviewAt ?? null) : null;

    return {
        phase,
        liveDeadline,
        sentAt: job.appliedAt,
        followUpDue: false,
        keyDate: keyDate(job, phase),
        actionDate: interview ?? liveDeadline,
        // Rejected after an interview got further than rejected straight after applying
        steps:
            job.stage === "rejected"
                ? buildSteps(STEP_LABELS, job.interviewAt ? 2 : 1, "Rejected")
                : buildSteps(STEP_LABELS, STEP_OF[job.stage]),
        events: [...deadlineEvents(liveDeadline), ...(interview ? [{ kind: "interview" as const, date: interview }] : [])],
    };
};
