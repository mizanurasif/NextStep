// What Realtime Database holds under users/{uid}/applications/{id} (see type.d.ts); only what the agent reads
type StoredApplication = {
  type: "job" | "university" | "professor";
  title: string;
  organization: string;
  stage: string;
  deadline?: string | null;
  link?: string;
  notes?: string;
  circular?: { text: string };
  location?: string;
  employmentType?: string;
  workMode?: string;
  salary?: string;
  appliedAt?: string | null;
  interviewAt?: string | null;
  interviewMode?: string;
  country?: string;
  intake?: string;
  submittedAt?: string | null;
  applicationFee?: { amount: number; currency: string };
  documents?: { name: string; done: boolean }[];
  contactEmail?: string;
  researchArea?: string;
  sentAt?: string | null;
  followUpAt?: string | null;
  repliedAt?: string | null;
};

export type ApplicationRef = { id: string; title: string };

type ToolResult = { content: string; isError?: boolean; read: ApplicationRef[] };

// Enough for the circulars of a few applications in one call (each is at most 20,000 characters)
const MAX_READ = 5;

const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
// The default database's URL; databases outside us-central1 have a different one, so it can be set
const databaseUrl = Deno.env.get("FIREBASE_DATABASE_URL") ?? `https://${projectId}-default-rtdb.firebaseio.com`;

// The model decides when to call these from the descriptions alone, so they say what each one is for.
// Each agent wraps them in its own API's tool format; `parameters` is a JSON schema, written so it
// also passes strict mode (every property required, no extra properties)
export const APPLICATION_TOOLS = [
  {
    name: "list_applications",
    description:
      "List the user's saved applications, one line each: id, type, stage, title, organization, deadline, and type-specific details (location, work mode, salary, interview date, country, intake, research area) plus the start of their notes. Returns every match, so use it for any question about the user's own applications, including counting, filtering and comparing.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["job", "university", "professor", "all"],
          description: "Which kind of application to list",
        },
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

// Dates are stored in UTC; the model sees them in the user's time zone, so a deadline of 23:59 in Dhaka
// isn't shown as the day before
type Clock = { day: (iso?: string | null) => string; time: (iso?: string | null) => string };

const clockFor = (utcOffsetMinutes: number): Clock => {
  const local = (iso?: string | null) => {
    const ms = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(ms) ? "" : new Date(ms + utcOffsetMinutes * 60_000).toISOString();
  };
  return {
    day: (iso) => local(iso).slice(0, 10),
    time: (iso) => local(iso).slice(0, 16).replace("T", " "),
  };
};

const oneLine = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

const label = (application: StoredApplication) => `${application.title} · ${application.organization}`;

// One line per application: enough to filter, count and compare without reading the circulars
const listLine = (id: string, application: StoredApplication, { day }: Clock) =>
  [
    id,
    application.type,
    application.stage,
    application.title,
    application.organization,
    application.deadline ? `deadline ${day(application.deadline)}` : "no deadline",
    application.location,
    application.workMode,
    application.employmentType,
    application.salary && `salary ${application.salary}`,
    application.interviewAt && `interview ${day(application.interviewAt)}`,
    application.country,
    application.intake,
    application.researchArea,
    application.circular && "has circular",
    application.notes && `notes: ${oneLine(application.notes, 300)}`,
  ]
    .filter(Boolean)
    .join(" | ");

// Everything saved for one application. The notes and circular are wrapped in tags because they're
// pasted from the web and may contain instructions, which the system prompt says to ignore
const applicationDetails = (id: string, application: StoredApplication, { day, time }: Clock) =>
  [
    `id: ${id}`,
    `${application.type}, stage ${application.stage}: ${label(application)}`,
    application.deadline && `Deadline: ${time(application.deadline)}`,
    application.link && `Link: ${application.link}`,
    application.location && `Location: ${application.location}`,
    application.workMode && `Work mode: ${application.workMode}`,
    application.employmentType && `Employment type: ${application.employmentType}`,
    application.salary && `Salary: ${application.salary}`,
    application.appliedAt && `Applied: ${day(application.appliedAt)}`,
    application.interviewAt &&
      `Interview: ${time(application.interviewAt)}${application.interviewMode ? ` (${application.interviewMode})` : ""}`,
    application.country && `Country: ${application.country}`,
    application.intake && `Intake: ${application.intake}`,
    application.submittedAt && `Submitted: ${day(application.submittedAt)}`,
    application.applicationFee &&
      `Application fee: ${application.applicationFee.amount} ${application.applicationFee.currency}`,
    application.documents?.length &&
      `Documents: ${application.documents.map((d) => `${d.name} (${d.done ? "done" : "to do"})`).join(", ")}`,
    application.researchArea && `Research area: ${application.researchArea}`,
    application.contactEmail && `Contact: ${application.contactEmail}`,
    application.sentAt && `Email sent: ${day(application.sentAt)}`,
    application.followUpAt && `Follow up: ${day(application.followUpAt)}`,
    application.repliedAt && `Replied: ${day(application.repliedAt)}`,
    application.notes && `<notes>\n${application.notes}\n</notes>`,
    application.circular?.text && `<circular>\n${application.circular.text}\n</circular>`,
  ]
    .filter(Boolean)
    .join("\n");

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

// The tools for one request. Applications are read once, on the first call, with the user's own
// ID token, so the database rules (auth.uid === $uid) still decide what can be read
export const createApplicationTools = (uid: string, idToken: string, utcOffsetMinutes: number) => {
  const clock = clockFor(utcOffsetMinutes);
  let loaded: Promise<Record<string, StoredApplication>> | null = null;
  const applications = () =>
    (loaded ??= fetch(`${databaseUrl}/users/${encodeURIComponent(uid)}/applications.json?auth=${encodeURIComponent(idToken)}`).then(
      async (response) => {
        if (!response.ok) throw new Error(`Realtime Database read failed (${response.status})`);
        return ((await response.json()) ?? {}) as Record<string, StoredApplication>;
      },
    ));

  const list = async (input: Record<string, unknown>): Promise<ToolResult> => {
    const type = input.type;
    if (type !== "all" && type !== "job" && type !== "university" && type !== "professor") {
      return { content: 'type must be "job", "university", "professor" or "all"', isError: true, read: [] };
    }
    const lines = Object.entries(await applications())
      .filter(([, application]) => type === "all" || application.type === type)
      // Soonest deadline first, then the ones without a deadline
      .sort(([, a], [, b]) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
      .map(([id, application]) => listLine(id, application, clock));
    if (lines.length === 0) return { content: `The user has no saved ${type === "all" ? "" : `${type} `}applications.`, read: [] };
    return { content: `${lines.length} applications:\n${lines.join("\n")}`, read: [] };
  };

  const read = async (input: Record<string, unknown>): Promise<ToolResult> => {
    if (!Array.isArray(input.ids) || input.ids.length === 0 || !input.ids.every((id) => typeof id === "string")) {
      return { content: "ids must be a non-empty list of application ids", isError: true, read: [] };
    }
    const saved = await applications();
    const ids = (input.ids as string[]).slice(0, MAX_READ);
    const found = ids.filter((id) => Object.hasOwn(saved, id));
    const parts = ids.map((id) => (Object.hasOwn(saved, id) ? applicationDetails(id, saved[id], clock) : `id: ${id}\nNot found.`));
    if (input.ids.length > MAX_READ) parts.push(`Only the first ${MAX_READ} were read. Call again for the rest.`);
    return {
      content: parts.join("\n\n---\n\n"),
      read: found.map((id) => ({ id, title: label(saved[id]) })),
    };
  };

  return {
    // Runs one tool call. Failures go back to the model as an error result, so it can tell the user
    run: async (name: string, input: unknown): Promise<ToolResult> => {
      if (!isRecord(input)) return { content: "The input must be an object", isError: true, read: [] };
      try {
        if (name === "list_applications") return await list(input);
        if (name === "read_applications") return await read(input);
        return { content: `Unknown tool ${name}`, isError: true, read: [] };
      } catch (error) {
        console.error("Application tool failed", name, error instanceof Error ? error.message : error);
        return { content: "Couldn't load the user's applications right now", isError: true, read: [] };
      }
    },

    // The application a chat was opened from, given to the model with the first question.
    // If it can't be read, the chat still works; the model can call the tools instead
    details: async (id: string) => {
      try {
        const saved = await applications();
        if (!Object.hasOwn(saved, id)) return null;
        return { ref: { id, title: label(saved[id]) }, text: applicationDetails(id, saved[id], clock) };
      } catch (error) {
        console.error("Application read failed", error instanceof Error ? error.message : error);
        return null;
      }
    },
  };
};
