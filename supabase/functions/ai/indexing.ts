import { HttpError } from "./http.ts";
import { admin } from "./quota.ts";
import { buildChunks, type IndexInput } from "./chunking.ts";
import { EMBEDDING, contentHash, embedDocuments } from "./embeddings.ts";

// Per request, so one call can't run up a huge embedding bill
const MAX_APPLICATIONS_PER_REQUEST = 10;
const MAX_CHUNKS_PER_APPLICATION = 40;
const MAX_CIRCULAR_CHARS = 20_000;
const MAX_NOTES_CHARS = 10_000;

// Realtime Database push keys, e.g. "-NabcDEF123"
const APPLICATION_ID = /^[-\w]{1,64}$/;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const parseApplication = (value: unknown): IndexInput => {
  const item = (value ?? {}) as Record<string, unknown>;
  const applicationId = text(item.applicationId, 64);
  if (!APPLICATION_ID.test(applicationId)) throw new HttpError(400, "Invalid application id");
  const type = (["job", "university", "professor"] as const).find((t) => t === item.type);
  if (!type) throw new HttpError(400, "Invalid application type");

  const circular = item.circular as { text?: unknown; headings?: unknown } | null | undefined;
  const circularText = text(circular?.text, MAX_CIRCULAR_CHARS);
  return {
    applicationId,
    type,
    title: text(item.title, 200),
    organization: text(item.organization, 200),
    notes: text(item.notes, MAX_NOTES_CHARS) || null,
    circular: circularText
      ? {
        text: circularText,
        headings: Array.isArray(circular?.headings)
          ? circular.headings.filter((h): h is string => typeof h === "string").slice(0, 30)
          : [],
      }
      : null,
  };
};

export const parseApplicationIds = (body: Record<string, unknown>) => {
  const ids = Array.isArray(body.applicationIds) ? body.applicationIds : [];
  if (ids.length > 100 || !ids.every((id) => typeof id === "string" && APPLICATION_ID.test(id))) {
    throw new HttpError(400, "Invalid application ids");
  }
  return ids as string[];
};

export const parseIndexRequest = (body: Record<string, unknown>) => {
  const applications = Array.isArray(body.applications) ? body.applications : [];
  if (applications.length === 0 || applications.length > MAX_APPLICATIONS_PER_REQUEST) {
    throw new HttpError(400, `Send 1 to ${MAX_APPLICATIONS_PER_REQUEST} applications`);
  }
  return applications.map(parseApplication);
};

// Brings one application's chunks up to date. Only new or changed text is embedded; new rows go in
// before stale ones come out, so a search during the update never finds the application missing
const indexOne = async (uid: string, input: IndexInput) => {
  const chunks = buildChunks(input).slice(0, MAX_CHUNKS_PER_APPLICATION);
  const hashed = await Promise.all(chunks.map(async (chunk) => ({ ...chunk, hash: await contentHash(chunk.content) })));
  // Two identical chunks would only be found twice
  const unique = [...new Map(hashed.map((chunk) => [chunk.hash, chunk])).values()];

  const { data: existing, error } = await admin
    .from("chunks")
    .select("id, content_hash")
    .eq("uid", uid)
    .eq("application_id", input.applicationId);
  if (error) throw new HttpError(500, "Could not read the search index");

  const stored = new Set(existing.map((row) => row.content_hash));
  const wanted = new Set(unique.map((chunk) => chunk.hash));
  const fresh = unique.filter((chunk) => !stored.has(chunk.hash));
  const stale = existing.filter((row) => !wanted.has(row.content_hash)).map((row) => row.id);

  if (fresh.length > 0) {
    const vectors = await embedDocuments(fresh.map((chunk) => chunk.content));
    const { error: insertError } = await admin.from("chunks").insert(
      fresh.map((chunk, i) => ({
        uid,
        application_id: input.applicationId,
        source: chunk.source,
        section: chunk.section,
        content: chunk.content,
        content_hash: chunk.hash,
        embedding: JSON.stringify(vectors[i]),
        model: EMBEDDING.model,
      })),
    );
    if (insertError) throw new HttpError(500, "Could not save to the search index");
  }
  if (stale.length > 0) {
    const { error: deleteError } = await admin.from("chunks").delete().eq("uid", uid).in("id", stale);
    if (deleteError) throw new HttpError(500, "Could not clean the search index");
  }
  return { applicationId: input.applicationId, chunks: unique.length, embedded: fresh.length, removed: stale.length };
};

// One at a time, so a big sync doesn't burst past Gemini's per-minute limit
export const indexApplications = async (uid: string, inputs: IndexInput[]) => {
  const results = [];
  for (const input of inputs) results.push(await indexOne(uid, input));
  return { results };
};

export const removeApplications = async (uid: string, applicationIds: string[]) => {
  if (applicationIds.length === 0) return { removed: 0 };
  const { error, count } = await admin
    .from("chunks")
    .delete({ count: "exact" })
    .eq("uid", uid)
    .in("application_id", applicationIds);
  if (error) throw new HttpError(500, "Could not clean the search index");
  return { removed: count ?? 0 };
};

// Which applications have chunks, so the app can remove ones deleted on another phone
export const listIndexed = async (uid: string) => {
  const { data, error } = await admin.from("chunks").select("application_id").eq("uid", uid).not("application_id", "is", null);
  if (error) throw new HttpError(500, "Could not read the search index");
  return { applicationIds: [...new Set(data.map((row) => row.application_id as string))] };
};
