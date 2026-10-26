import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { HttpError } from "./http.ts";

// Requests per user per day; keeps one account from using up the free Gemini quota.
// Indexing runs in the background on every edit, so it has its own, larger allowance
const LIMITS = {
  ai: { key: "", daily: Number(Deno.env.get("AI_DAILY_LIMIT") ?? 30), message: "AI requests" },
  index: { key: "#index", daily: Number(Deno.env.get("INDEX_DAILY_LIMIT") ?? 300), message: "search updates" },
} as const;

// Edge Functions get the project's secret keys as a JSON dictionary; older projects only have the legacy one
const secretKey = () => {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const first = Object.values(JSON.parse(keys) as Record<string, string>)[0];
    if (first) return first;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new HttpError(500, "Server is missing its Supabase secret key");
};

// The secret key bypasses Row Level Security, so every query must filter by the verified uid
export const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey(), {
  auth: { persistSession: false },
});

export const useQuota = async (uid: string, kind: keyof typeof LIMITS = "ai") => {
  const limit = LIMITS[kind];
  // Each kind is counted under its own key in ai_usage, e.g. "<uid>" and "<uid>#index"
  const { data, error } = await admin.rpc("use_ai_quota", { p_uid: uid + limit.key, p_limit: limit.daily });
  if (error) {
    // The database error says what's wrong (e.g. PGRST202 = the use_ai_quota migration hasn't been run)
    console.error("use_ai_quota failed", error.code, error.message);
    // Only the code is shown to the user; it names the problem without exposing anything
    throw new HttpError(500, `Could not check your AI usage (${error.code || "unknown"})`);
  }
  if (!data) throw new HttpError(429, `You've used today's ${limit.daily} ${limit.message}. Try again tomorrow`);
};
