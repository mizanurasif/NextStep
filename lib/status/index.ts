import dayjs, { type Dayjs } from "dayjs";
import { jobStatus } from "@/lib/status/job";
import { professorStatus } from "@/lib/status/professor";
import type { ApplicationStatus } from "@/lib/status/shared";
import { universityStatus } from "@/lib/status/university";

// Where an application stands: its phase, the date that matters, its stepper and calendar dates.
// The one place every screen asks, so the list, home, calendar, detail screens and reminders
// can't give different answers. The rules for each type live in lib/status/<type>.ts.
//
//   getStatus(job at "interview", now)
//   → { phase: "waiting", sentAt: "Nov 15", keyDate: { kind: "interview", date: "Nov 25" },
//       actionDate: "Nov 25", steps: [Saved ✓, Applied ✓, Interview ●, Offer ○], ... }
//
// `now` only matters for whether a professor follow-up is due; it defaults to the current time
export const getStatus = (application: Application, now: Dayjs = dayjs()): ApplicationStatus => {
    switch (application.type) {
        case "job":
            return jobStatus(application);
        case "university":
            return universityStatus(application);
        case "professor":
            return professorStatus(application, now);
    }
};

export type { ApplicationStatus, KeyDate, Phase, Step, StepState, StatusEvent } from "@/lib/status/shared";
