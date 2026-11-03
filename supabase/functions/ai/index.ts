// One Edge Function for every AI feature; `action` picks which.
// Each request: verify the Firebase user → count it against their daily limit → do the work.
import { HttpError, corsHeaders, json } from "./http.ts";
import { verifyFirebaseUser } from "./firebase-auth.ts";
import { useQuota } from "./quota.ts";
import { extractCircular, parseExtractRequest } from "./extract.ts";
import { parseResearchRequest, researchResponse } from "./research.ts";

// A research chat sends its whole history back each time, so a long one is large;
// anything bigger is refused before it's read
const MAX_BODY_BYTES = 2_000_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST");
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
      throw new HttpError(413, "This request is too large. If it's a long chat, start a new one");
    }

    const { uid, idToken } = await verifyFirebaseUser(req);
    const body = await req.json().catch(() => {
      throw new HttpError(400, "Body must be JSON");
    });

    // Each request is checked before it uses quota, so a bad one doesn't cost anything
    switch (body?.action) {
      case "extract": {
        const { source, utcOffsetMinutes } = parseExtractRequest(body);
        await useQuota(uid);
        return json(await extractCircular(source, utcOffsetMinutes));
      }
      case "research": {
        const request = parseResearchRequest(body);
        await useQuota(uid);
        return researchResponse(request, { uid, idToken });
      }
      default:
        throw new HttpError(400, "Unknown action");
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    // Never log the request body: circulars and chats are personal data
    console.error("Unexpected error", error instanceof Error ? error.message : error);
    return json({ error: "Something went wrong" }, 500);
  }
});
