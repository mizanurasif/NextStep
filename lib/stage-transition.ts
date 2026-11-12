import dayjs from "dayjs";

// Moving an application to a stage changes more than the stage: it stamps the date that stage stands
// for (applied, submitted, emailed, replied) and records it on the timeline. Every screen that changes
// a stage goes through changeStage, so the form and the stage chips can't disagree.
// Only imports dayjs, so it runs anywhere (no React Native)

// Every stage in the order an application moves through them; the first is where a new one starts
export const STAGES_BY_TYPE: Record<ApplicationType, ApplicationStage[]> = {
    job: ["saved", "applied", "interview", "offer", "rejected"],
    university: ["preparing", "submitted", "under_review", "admitted", "rejected"],
    professor: ["draft", "sent", "follow_up_due", "replied", "declined"],
};

// How long to wait for a professor's reply before following up
export const FOLLOW_UP_DAYS = 7;

// The timeline entry for reaching each stage; null for a stage that isn't something that happened
// (a follow-up falling due is just time passing)
const STAGE_EVENTS: Record<ApplicationStage, string | null> = {
    saved: "Saved",
    applied: "Applied",
    interview: "Interview stage",
    offer: "Got an offer",
    rejected: "Rejected",
    preparing: "Started application",
    submitted: "Submitted",
    under_review: "Under review",
    admitted: "Admitted",
    draft: "Draft created",
    sent: "First email sent",
    follow_up_due: null,
    replied: "Replied",
    declined: "Declined",
};

// Entries this module adds are keyed by stage, so moving back can take them off again.
// Entries made any other way (older versions used "t1") are never touched
const eventId = (stage: ApplicationStage) => `stage:${stage}`;

// Everything to save for a stage change; `type` is included so callers can narrow it
export type StageChange =
    | { type: "job"; stage: JobStage; appliedAt: ISODateString | null; timeline: TimelineEvent[] }
    | { type: "university"; stage: UniversityStage; submittedAt: ISODateString | null; timeline: TimelineEvent[] }
    | {
          type: "professor";
          stage: ProfessorStage;
          sentAt: ISODateString | null;
          followUpAt: ISODateString | null;
          repliedAt: ISODateString | null;
          timeline: TimelineEvent[];
      };

type Options = {
    // When the change happens; defaults to now
    now?: Date;
    // The day the professor's email went out, when the user picked one. Without it a sent date
    // already saved is kept, or the email counts as sent now
    sentAt?: Date;
};

// The timeline after moving to `stage`:
//   - entries for stages after it are removed, since moving back undoes them
//   - moving forward (or creating) adds the stage's entry, once
//   - `stampedAt` is the date the stage stamped (e.g. sentAt); its entry follows it if that date is edited
const moveTimeline = (
    timeline: TimelineEvent[],
    type: ApplicationType,
    from: ApplicationStage | null,
    to: ApplicationStage,
    date: ISODateString,
    stampedAt: boolean,
) => {
    const order = STAGES_BY_TYPE[type];
    const undone = new Set(order.slice(order.indexOf(to) + 1).map(eventId));
    //console.log("undone:" ,undone)
    const kept = timeline.filter((event) => !undone.has(event.id));

    const title = STAGE_EVENTS[to];
    if (!title) return kept;
    const id = eventId(to);
    if (kept.some((event) => event.id === id)) {
        return stampedAt ? kept.map((event) => (event.id === id ? { ...event, date } : event)) : kept;
    }
    const forward = from === null || order.indexOf(to) > order.indexOf(from);
    return forward ? [...kept, { id, date, title }] : kept;
};

// What to save when `application` moves to `stage`. For a new application pass just `{ type }`.
// Moving back undoes what the later stage stamped: back to the first stage clears its date (a professor
// back in draft has no sent date), and leaving "replied" clears repliedAt. So a mis-tapped chip is
// fixed by tapping the stage it came from
export const changeStage = (
    application: Application | { type: ApplicationType },
    stage: ApplicationStage,
    { now = new Date(), sentAt }: Options = {},
): StageChange => {
    const existing = "id" in application ? application : null;
    const nowIso = now.toISOString();
    const isStart = stage === STAGES_BY_TYPE[application.type][0];
    const timeline = (date: ISODateString, stampedAt = false) =>
        moveTimeline(existing?.timeline ?? [], application.type, existing?.stage ?? null, stage, date, stampedAt);

    switch (application.type) {
        case "job": {
            const previous = existing?.type === "job" ? existing.appliedAt : null;
            const appliedAt = isStart ? null : (previous ?? nowIso);
            return {
                type: "job",
                stage: stage as JobStage,
                appliedAt,
                timeline: stage === "applied" && appliedAt ? timeline(appliedAt, true) : timeline(nowIso),
            };
        }

        case "university": {
            const previous = existing?.type === "university" ? existing.submittedAt : null;
            const submittedAt = isStart ? null : (previous ?? nowIso);
            return {
                type: "university",
                stage: stage as UniversityStage,
                submittedAt,
                timeline: stage === "submitted" && submittedAt ? timeline(submittedAt, true) : timeline(nowIso),
            };
        }

        case "professor": {
            const previous = existing?.type === "professor" ? existing : null;
            const picked = sentAt ? dayjs(sentAt) : null;
            // Keep the saved date (and its exact text) unless the user picked a different one
            const keepPrevious = !!previous?.sentAt && (!picked || picked.isSame(previous.sentAt));
            const sent = isStart ? null : keepPrevious ? previous!.sentAt : (picked?.toISOString() ?? nowIso);
            const followUpAt = !sent
                ? null
                : keepPrevious && previous!.followUpAt
                  ? previous!.followUpAt
                  : dayjs(sent).add(FOLLOW_UP_DAYS, "day").toISOString();
            const repliedAt = stage === "replied" ? (previous?.repliedAt ?? nowIso) : null;

            const stamped = stage === "sent" ? sent : stage === "replied" ? repliedAt : null;
            return {
                type: "professor",
                stage: stage as ProfessorStage,
                sentAt: sent,
                followUpAt,
                repliedAt,
                timeline: stamped ? timeline(stamped, true) : timeline(nowIso),
            };
        }
    }
};
