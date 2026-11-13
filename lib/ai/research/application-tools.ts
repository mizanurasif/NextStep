import dayjs from "dayjs";
import { STAGE_META, matchesSearch } from "@/lib/applications";
import { MAX_NOTE_CHARS, newApplication, withNote, withReminder } from "@/lib/ai/research/application-writes";
import type { ToolSpec } from "@/lib/ai/research/model-turn";
import { listReminders } from "@/lib/reminder-plan";
import { getStatus } from "@/lib/status";

// The tools the research agent uses on the user's saved applications. They work on the list the app
// already holds in memory (from ApplicationsProvider), so they're instant, include edits not yet
// synced, and can only ever see this user's data.
//
//   Read:  list_applications   every application, one line each
//          search_applications the ones matching some words
//          read_applications   everything saved for a few of them
//          get_agenda          what's coming up in the next few days
//   Add:   create_application  a new application, built like the form builds one
//          add_note            text appended to an application's notes
//          add_notification    a reminder, saved like one picked in the form; lib/reminder-sync
//          add_alarm           then schedules it on the phone
//
// The add tools never delete or overwrite anything; the changes they make are worked out in
// application-writes.ts and saved through the app's own store.

// What a tool call gives back to the model, plus which applications it used (shown as sources)
export type ToolResult = { content: string; isError: boolean; read: { id: string; title: string }[] };

// Enough for the circulars of a few applications in one call (each is at most 20,000 characters)
const MAX_READ = 5;

// The input both reminder tools take
const REMINDER_PARAMETERS = {
    type: "object",
    properties: {
        id: { type: "string", description: "The application's id from list_applications" },
        at: {
            type: "string",
            description:
                "When it should go off: ISO 8601 with the user's UTC offset, e.g. 2026-11-20T21:00:00+06:00. At least a minute from now, and before the application's deadline when it has one",
        },
    },
    required: ["id", "at"],
    additionalProperties: false,
};

// The model decides when to call these from the descriptions alone, so they say what each one is for.
// Each adapter wraps them in its own AI's tool format. `parameters` is a JSON schema written to pass
// strict mode (every property required, no extra properties)
export const APPLICATION_TOOLS: ToolSpec[] = [
    {
        name: "list_applications",
        description:
            "List the user's saved applications, one line each: id, type, stage, title, organization, deadline, and type-specific details (location, work mode, salary, interview date, country, intake, research area) plus the start of their notes. Returns every match, so use it for any question about the user's own applications, including counting, filtering and comparing.",
        parameters: {
            type: "object",
            properties: {
                type: { type: "string", enum: ["job", "university", "professor", "all"], description: "Which kind of application to list" },
            },
            required: ["type"],
            additionalProperties: false,
        },
    },
    {
        name: "read_applications",
        description: `Read everything saved for up to ${MAX_READ} applications by id: all dates, notes, documents, and the full circular. Use it when the list lines don't answer the question, e.g. a specific requirement, benefit or duty.`,
        parameters: {
            type: "object",
            properties: {
                ids: { type: "array", items: { type: "string" }, description: "Ids from list_applications" },
            },
            required: ["ids"],
            additionalProperties: false,
        },
    },
    {
        name: "search_applications",
        description:
            "Find the user's saved applications that mention some words: in the name, organization, place, research area, stage, notes or circular. Returns one line each, like list_applications. Use it when the user names a company, university, professor or topic.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "A few words to look for, e.g. 'Google' or 'machine learning'" },
            },
            required: ["query"],
            additionalProperties: false,
        },
    },
    {
        name: "get_agenda",
        description:
            "What's coming up for the user in the next few days, soonest first, with exact times in their time zone: deadlines that still matter, interviews, professor follow-ups (including overdue ones), and their own notifications and alarms. Use it for questions like 'what's due this week' instead of working the dates out yourself.",
        parameters: {
            type: "object",
            properties: {
                days: { type: "integer", description: "How many days ahead to look, from 1 to 90" },
            },
            required: ["days"],
            additionalProperties: false,
        },
    },
    {
        name: "create_application",
        description:
            "Save a new job, university program or professor to the user's tracker. Only use it when the user asks to add or save one. Check with search_applications first that it isn't saved already. Use only facts the user gave or that you read on the source page, and null for anything you didn't find; never guess. It starts at the first stage (saved, preparing or draft), and the user can edit it in the app.",
        parameters: {
            type: "object",
            properties: {
                type: { type: "string", enum: ["job", "university", "professor"], description: "job = a job post; university = a degree program; professor = a professor or lab" },
                title: { type: "string", description: "The job role, the program name, or the professor's name" },
                organization: { type: "string", description: "The company; the university; or for a professor, 'Lab · University'" },
                link: { type: ["string", "null"], description: "The page to apply at or read more, a full https:// address" },
                deadline: { type: ["string", "null"], description: "The application deadline as ISO 8601 with the user's UTC offset. Use 23:59 when no time is given" },
                location: { type: ["string", "null"], description: "Job only: city, or 'Remote'" },
                country: { type: ["string", "null"], description: "University only: the country" },
                intake: { type: ["string", "null"], description: "University only: the intake, e.g. 'Fall 2027'" },
                contactEmail: { type: ["string", "null"], description: "Professor only (required for them): their email address" },
                researchArea: { type: ["string", "null"], description: "Professor only: their research area" },
                notes: { type: ["string", "null"], description: "A few short '- ' lines worth keeping: key requirements, funding, how to apply" },
            },
            required: ["type", "title", "organization", "link", "deadline", "location", "country", "intake", "contactEmail", "researchArea", "notes"],
            additionalProperties: false,
        },
    },
    {
        name: "add_note",
        description: `Add text to the end of one saved application's notes, e.g. findings the user wants to keep (interview questions, requirements, a professor's recent papers). Only use it when the user asks to save or note something. The existing notes are kept. At most ${MAX_NOTE_CHARS} characters.`,
        parameters: {
            type: "object",
            properties: {
                id: { type: "string", description: "The application's id from list_applications or search_applications" },
                text: { type: "string", description: "The note, in plain text" },
            },
            required: ["id", "text"],
            additionalProperties: false,
        },
    },
    {
        name: "add_notification",
        description:
            "Schedule a notification on the user's phone for one saved application, at an exact time. Only use it when the user asks for a reminder or notification. It's saved with the application, so the user sees it and can remove it in the app.",
        parameters: REMINDER_PARAMETERS,
    },
    {
        name: "add_alarm",
        description:
            "Schedule an alarm (rings like a clock alarm) on the user's phone for one saved application, at an exact time. Only use it when the user asks for an alarm. It's saved with the application, so the user sees it and can remove it in the app.",
        parameters: REMINDER_PARAMETERS,
    },
];

// Dates are stored in UTC; the model sees them in the phone's time zone, so a deadline of 23:59 in
// Dhaka isn't shown as the day before
const day = (iso?: string | null) => (iso ? dayjs(iso).format("YYYY-MM-DD") : "");
const time = (iso?: string | null) => (iso ? dayjs(iso).format("YYYY-MM-DD HH:mm") : "");

const oneLine = (text: string, max: number) => {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

const label = (application: Application) => `${application.title} · ${application.organization}`;

const joinLines = (parts: (string | null | undefined | false | 0)[], separator: string) => parts.filter(Boolean).join(separator);

// One line per application: enough to filter, count and compare without reading the circulars
const listLine = (application: Application) => {
    const details =
        application.type === "job"
            ? [
                  application.location,
                  application.workMode,
                  application.employmentType,
                  application.salary && `salary ${application.salary}`,
                  application.interviewAt && `interview ${day(application.interviewAt)}`,
              ]
            : application.type === "university"
              ? [application.country, application.intake]
              : [application.researchArea];
    return joinLines(
        [
            application.id,
            application.type,
            application.stage,
            application.title,
            application.organization,
            application.deadline ? `deadline ${day(application.deadline)}` : "no deadline",
            ...details,
            application.circular && "has circular",
            application.notes && `notes: ${oneLine(application.notes, 300)}`,
        ],
        " | ",
    );
};

const typeDetails = (application: Application) => {
    switch (application.type) {
        case "job":
            return [
                application.location && `Location: ${application.location}`,
                application.workMode && `Work mode: ${application.workMode}`,
                application.employmentType && `Employment type: ${application.employmentType}`,
                application.salary && `Salary: ${application.salary}`,
                application.appliedAt && `Applied: ${day(application.appliedAt)}`,
                application.interviewAt &&
                    `Interview: ${time(application.interviewAt)}${application.interviewMode ? ` (${application.interviewMode})` : ""}`,
            ];
        case "university":
            return [
                application.country && `Country: ${application.country}`,
                application.intake && `Intake: ${application.intake}`,
                application.submittedAt && `Submitted: ${day(application.submittedAt)}`,
                application.applicationFee && `Application fee: ${application.applicationFee.amount} ${application.applicationFee.currency}`,
                application.documents.length > 0 &&
                    `Documents: ${application.documents.map((d) => `${d.name} (${d.done ? "done" : "to do"})`).join(", ")}`,
            ];
        case "professor":
            return [
                application.researchArea && `Research area: ${application.researchArea}`,
                application.contactEmail && `Contact: ${application.contactEmail}`,
                application.sentAt && `Email sent: ${day(application.sentAt)}`,
                application.followUpAt && `Follow up: ${day(application.followUpAt)}`,
                application.repliedAt && `Replied: ${day(application.repliedAt)}`,
            ];
    }
};

// Everything saved for one application. The notes and circular are wrapped in tags because they're
// pasted from the web and may contain instructions, which the system prompt says to ignore
export const applicationDetails = (application: Application) =>
    joinLines(
        [
            `id: ${application.id}`,
            `${application.type}, stage ${application.stage}: ${label(application)}`,
            application.deadline && `Deadline: ${time(application.deadline)}`,
            application.link && `Link: ${application.link}`,
            ...typeDetails(application),
            application.notes && `<notes>\n${application.notes}\n</notes>`,
            application.circular?.text && `<circular>\n${application.circular.text}\n</circular>`,
        ],
        "\n",
    );

const failure = (content: string): ToolResult => ({ content, isError: true, read: [] });

const listApplications = (applications: Application[], input: Record<string, unknown>): ToolResult => {
    const { type } = input;
    if (type !== "all" && type !== "job" && type !== "university" && type !== "professor") {
        return failure('type must be "job", "university", "professor" or "all"');
    }
    const lines = applications
        .filter((application) => type === "all" || application.type === type)
        // Soonest deadline first, then the ones without a deadline
        .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
        .map(listLine);
    if (lines.length === 0) return { content: `The user has no saved ${type === "all" ? "" : `${type} `}applications.`, isError: false, read: [] };
    return { content: `${lines.length} applications:\n${lines.join("\n")}`, isError: false, read: [] };
};

const readApplications = (applications: Application[], input: Record<string, unknown>): ToolResult => {
    const { ids } = input;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
        return failure("ids must be a non-empty list of application ids");
    }
    const wanted = (ids as string[]).slice(0, MAX_READ);
    const found = wanted.map((id) => applications.find((application) => application.id === id));
    const parts = found.map((application, index) => (application ? applicationDetails(application) : `id: ${wanted[index]}\nNot found.`));
    if (ids.length > MAX_READ) parts.push(`Only the first ${MAX_READ} were read. Call again for the rest.`);
    return {
        content: parts.join("\n\n---\n\n"),
        isError: false,
        read: found.flatMap((application) => (application ? [{ id: application.id, title: label(application) }] : [])),
    };
};

const searchApplications = (applications: Application[], input: Record<string, unknown>): ToolResult => {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!query) return failure("query is required");
    const lower = query.toLowerCase();
    const lines = applications
        // The app's own search (name, organization, place, research area, stage), plus the notes,
        // circular and link, where the details of a job or program usually are
        .filter((a) => matchesSearch(a, query) || [a.notes, a.circular?.text, a.link].some((field) => field?.toLowerCase().includes(lower)))
        .map(listLine);
    if (lines.length === 0) return { content: `No saved application mentions "${query}".`, isError: false, read: [] };
    return { content: `${lines.length} matching:\n${lines.join("\n")}`, isError: false, read: [] };
};

const MAX_AGENDA_DAYS = 90;

// One entry on the agenda: when, what, and for which application
type AgendaItem = { date: string; what: string; application: Application };

const getAgenda = (applications: Application[], input: Record<string, unknown>): ToolResult => {
    const { days } = input;
    if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > MAX_AGENDA_DAYS) {
        return failure(`days must be a whole number from 1 to ${MAX_AGENDA_DAYS}`);
    }
    const now = dayjs();
    const end = now.add(days, "day");
    const isAhead = (date: string) => !dayjs(date).isBefore(now) && !dayjs(date).isAfter(end);
    const byId = new Map(applications.map((application) => [application.id, application]));
    const items: AgendaItem[] = [];
    const overdue: string[] = [];

    // Deadlines that still matter, interviews and follow-ups: lib/status decides which dates count,
    // so a deadline for a job already applied to doesn't show
    const WHAT: Record<string, string> = { deadline: "Deadline", interview: "Interview", follow_up: "Follow up with the professor" };
    for (const application of applications) {
        const status = getStatus(application, now);
        if (status.followUpDue) overdue.push(`Follow-up is due now · ${label(application)} · id ${application.id}`);
        for (const event of status.events) {
            const what = WHAT[event.kind];
            if (what && isAhead(event.date)) items.push({ date: event.date, what, application });
        }
    }

    // The user's own notifications and alarms. The reminder plan also lists the automatic "time is over"
    // and follow-up nudges, which are already covered above, so only the user's reminders are taken
    for (const planned of listReminders(applications, now.toDate())) {
        const application = byId.get(planned.applicationId);
        const isOwn = !planned.id.endsWith(":deadline") && !planned.id.endsWith(":follow-up");
        if (application && isOwn && isAhead(planned.date.toISOString())) {
            items.push({ date: planned.date.toISOString(), what: planned.alarm ? "Alarm" : "Notification", application });
        }
    }

    items.sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());
    const lines = items.map((item) => `${time(item.date)} · ${item.what} · ${label(item.application)} (${STAGE_META[item.application.stage].label}) · id ${item.application.id}`);
    const header = `Agenda from ${time(now.toISOString())} to ${time(end.toISOString())} (the user's time):`;
    const body = [...overdue, ...lines].join("\n") || "Nothing is coming up.";
    return { content: `${header}\n${body}`, isError: false, read: [] };
};

// ── The tools for one question ───────────────────────────────────────────────────────────────────

// The app's own writes (from ApplicationsProvider). Both are fire and forget: a write reaches the
// local cache at once, even offline, and the listener then updates every screen
export type ApplicationWrites = {
    // Returns the new application's id right away
    addApplication: (input: ApplicationInput) => string;
    updateApplication: (id: string, changes: Partial<ApplicationInput>) => void;
};

export type ApplicationToolsOptions = {
    // The user's saved applications, as the app holds them right now
    applications: Application[];
    writes: ApplicationWrites;
    // Whether this phone can ring real alarms (Android); elsewhere an alarm is a loud notification
    alarmsSupported: boolean;
};

// The tools for one question. They keep their own up-to-date copy of the applications, so the
// changes made in one answer build on each other: a note can go on an application just created,
// two reminders both stay, and a list read afterwards shows them
export const createApplicationTools = ({ applications, writes, alarmsSupported }: ApplicationToolsOptions) => {
    const latest = new Map(applications.map((application) => [application.id, application]));
    const current = () => [...latest.values()];

    // The application an add tool is about, or a failure telling the model to look the id up
    const target = (input: Record<string, unknown>) => {
        const application = typeof input.id === "string" ? latest.get(input.id) : undefined;
        return application ?? failure("No saved application has that id. Use an id from list_applications or search_applications");
    };
    const done = (content: string, application: Application): ToolResult => ({
        content,
        isError: false,
        read: [{ id: application.id, title: label(application) }],
    });

    const createApplication = (input: Record<string, unknown>): ToolResult => {
        const fields = newApplication(input, current());
        if (typeof fields === "string") return failure(fields);
        const id = writes.addApplication(fields);
        const nowIso = new Date().toISOString();
        const created = { ...fields, id, createdAt: nowIso, updatedAt: nowIso } as Application;
        latest.set(id, created);
        return done(`Saved ${label(created)} as a new ${created.type} application (id ${id}).`, created);
    };

    const addNote = (input: Record<string, unknown>): ToolResult => {
        const application = target(input);
        if ("isError" in application) return application;
        const updated = withNote(application, input.text);
        if (typeof updated === "string") return failure(updated);
        writes.updateApplication(updated.id, { notes: updated.notes });
        latest.set(updated.id, updated);
        return done(`Note added to ${label(updated)}.`, updated);
    };

    const addReminder = (input: Record<string, unknown>, alarm: boolean): ToolResult => {
        const application = target(input);
        if ("isError" in application) return application;
        const updated = withReminder(application, input.at, alarm);
        if (typeof updated === "string") return failure(updated);
        writes.updateApplication(updated.id, { reminders: updated.reminders });
        latest.set(updated.id, updated);
        const added = updated.reminders[updated.reminders.length - 1];
        const fallback = alarm && !alarmsSupported ? " This phone can't ring alarms, so it will be a loud notification instead." : "";
        const when = dayjs(added.at).format("ddd D MMM YYYY, h:mm A");
        return done(`${alarm ? "Alarm" : "Notification"} set for ${when} (the user's time) for ${label(updated)}.${fallback}`, updated);
    };

    const TOOLS: Record<string, (input: Record<string, unknown>) => ToolResult> = {
        list_applications: (input) => listApplications(current(), input),
        search_applications: (input) => searchApplications(current(), input),
        read_applications: (input) => readApplications(current(), input),
        get_agenda: (input) => getAgenda(current(), input),
        create_application: createApplication,
        add_note: addNote,
        add_notification: (input) => addReminder(input, false),
        add_alarm: (input) => addReminder(input, true),
    };

    return {
        // Runs one tool call. A bad input goes back to the model as an error result it can correct,
        // instead of stopping the answer
        run: (name: string, input: unknown): ToolResult => {
            if (typeof input !== "object" || input === null) return failure("The input must be an object");
            const tool = TOOLS[name];
            return tool ? tool(input as Record<string, unknown>) : failure(`Unknown tool ${name}`);
        },
    };
};
