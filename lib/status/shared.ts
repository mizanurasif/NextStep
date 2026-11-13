// =====================================================================================
// Application status: the shared vocabulary.
//
// "Where does this application stand, and which date matters?" used to be answered
// separately by the list card, the sort, the home rows, the stepper, the calendar,
// the detail screens and the reminders. Now each type answers it once:
//
//   lib/status/job.ts         every rule about job stages
//   lib/status/university.ts  every rule about university stages
//   lib/status/professor.ts   every rule about professor stages
//   lib/status/index.ts       getStatus(application, now) picks the right one
//
// This file holds what all three share: the shapes of the answer, and small helpers.
// The status says WHAT is true (phase, which date, is it urgent); screens choose the WORDS.
// Only imports dayjs, so it runs anywhere (no React Native).
// =====================================================================================

// -------------------------------------------------------------------------------------
// Phase: where an application stands, from your side
// -------------------------------------------------------------------------------------
//   to_do   - not sent yet; the deadline is what matters      (saved, preparing, draft)
//   waiting - sent; waiting on the other side                  (applied, interview, submitted,
//                                                                under_review, sent, follow_up_due)
//   decide  - they said yes; now it's your move by the deadline (offer)
//   closed  - finished, either way; nothing left to do         (rejected, admitted, declined, replied)
export type Phase = "to_do" | "waiting" | "decide" | "closed";

// The deadline only matters while the next move is yours
export const deadlineMatters = (phase: Phase) => phase === "to_do" || phase === "decide";

// -------------------------------------------------------------------------------------
// Key date: the one date (or outcome) worth showing for an application
// -------------------------------------------------------------------------------------
// Screens turn it into words: the list card says "Applied Nov 15",
// the detail screen says "Applied on · Sat, Nov 15 · 3:00 PM" with a countdown
export type KeyDate =
    // The deadline. `live` is false once it no longer matters (e.g. already applied);
    // `forOffer` means it's the date to answer an offer by
    | { kind: "deadline"; date: ISODateString; live: boolean; forOffer: boolean }
    | { kind: "interview"; date: ISODateString }
    | { kind: "applied"; date: ISODateString }
    | { kind: "submitted"; date: ISODateString }
    // A professor follow-up; `due` = it's time now. The date can be missing when the stage
    // was set to "follow up due" by hand
    | { kind: "follow_up"; date: ISODateString | null; due: boolean }
    | { kind: "replied"; date: ISODateString | null }
    // A final answer with no date worth showing
    | { kind: "outcome"; outcome: "not_selected" | "admitted" | "not_admitted" | "declined" };

// -------------------------------------------------------------------------------------
// Steps: the progress stepper on the detail screen
// -------------------------------------------------------------------------------------
export type StepState = "done" | "current" | "todo" | "failed";
export type Step = { label: string; state: StepState };

// Builds the 4-step stepper.
//   labels  - the steps, e.g. ["Saved", "Applied", "Interview", "Offer"]
//   reached - index of the step the application has got to
//   failed  - for a bad outcome: its label replaces the last step, and the step reached
//             counts as done (it happened, it just didn't lead anywhere)
// Reaching the last step (offer, admitted, replied) marks everything done.
//
//   buildSteps(L, 2)             → done, done, current, todo
//   buildSteps(L, 3)             → done, done, done, done
//   buildSteps(L, 1, "Rejected") → done, done, todo, failed("Rejected")
export const buildSteps = (labels: string[], reached: number, failed?: string): Step[] =>
    labels.map((label, index) => {
        const isLast = index === labels.length - 1;
        if (failed && isLast) return { label: failed, state: "failed" };
        if (index < reached) return { label, state: "done" };
        if (index === reached) return { label, state: failed || isLast ? "done" : "current" };
        return { label, state: "todo" };
    });

// -------------------------------------------------------------------------------------
// Events: the dated things worth putting on the calendar
// -------------------------------------------------------------------------------------
export type StatusEvent = {
    kind: "deadline" | "interview" | "sent" | "follow_up";
    date: ISODateString;
};

// -------------------------------------------------------------------------------------
// The full answer, the same shape for every type
// -------------------------------------------------------------------------------------
export type ApplicationStatus = {
    phase: Phase;
    // The deadline while it still matters (phase to_do or decide), otherwise null
    liveDeadline: ISODateString | null;
    // When you applied, submitted or emailed; null before that
    sentAt: ISODateString | null;
    // A professor email that needs a follow-up now; always false for the other types
    followUpDue: boolean;
    // The one date (or outcome) to show, or null when there's nothing worth showing
    keyDate: KeyDate | null;
    // The next date you have to act by (a live deadline, an interview, a follow-up),
    // or null when nothing is waiting on you. The list sorts by it
    actionDate: ISODateString | null;
    steps: Step[];
    events: StatusEvent[];
};

// The deadline entry for an application in this phase, or nothing without a deadline
export const deadlineKeyDate = (application: Application, phase: Phase): KeyDate | null =>
    application.deadline
        ? { kind: "deadline", date: application.deadline, live: deadlineMatters(phase), forOffer: phase === "decide" }
        : null;

// The deadline event for the calendar, only while it still matters
export const deadlineEvents = (liveDeadline: ISODateString | null): StatusEvent[] =>
    liveDeadline ? [{ kind: "deadline", date: liveDeadline }] : [];
