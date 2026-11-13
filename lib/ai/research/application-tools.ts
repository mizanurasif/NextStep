import dayjs from "dayjs";
import type { ToolSpec } from "@/lib/ai/research/model-turn";

// The two tools that let the research agent read the user's saved applications. They read the list
// the app already holds in memory (from ApplicationsProvider), so they work instantly, include edits
// not yet synced, and can only ever see this user's data. Both are read-only.

// What a tool call gives back to the model, plus which applications it read (shown as sources)
export type ToolResult = { content: string; isError: boolean; read: { id: string; title: string }[] };

// Enough for the circulars of a few applications in one call (each is at most 20,000 characters)
const MAX_READ = 5;

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

// Runs one tool call. A bad input goes back to the model as an error result it can correct,
// instead of stopping the answer
export const runApplicationTool = (applications: Application[], name: string, input: unknown): ToolResult => {
    if (typeof input !== "object" || input === null) return failure("The input must be an object");
    const record = input as Record<string, unknown>;
    if (name === "list_applications") return listApplications(applications, record);
    if (name === "read_applications") return readApplications(applications, record);
    return failure(`Unknown tool ${name}`);
};
