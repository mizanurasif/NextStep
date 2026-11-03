import { createRemoteJWKSet, jwtVerify } from "jose";
import { HttpError } from "./http.ts";

const projectId = Deno.env.get("FIREBASE_PROJECT_ID");

// Google's public keys for Firebase ID tokens. jose caches them and fetches again when Google rotates them
const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

// Checks the Firebase ID token in `Authorization: Bearer …` the way Firebase documents it:
// RS256 signed by Google, issued for this project, not expired, with a user id.
// Returns that uid, and the token for reading the user's own data from Realtime Database;
// the request body is never trusted for who the user is
export const verifyFirebaseUser = async (req: Request): Promise<{ uid: string; idToken: string }> => {
  if (!projectId) throw new HttpError(500, "Server is missing FIREBASE_PROJECT_ID");

  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Sign in to use AI features");

  try {
    const { payload } = await jwtVerify(token, firebaseKeys, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    const authTime = payload.auth_time;
    if (typeof payload.sub !== "string" || !payload.sub) throw new Error("No user id");
    if (typeof authTime !== "number" || authTime * 1000 > Date.now()) throw new Error("Bad auth_time");
    return { uid: payload.sub, idToken: token };
  } catch {
    // Same message for every failure, so callers learn nothing about why a forged token failed
    throw new HttpError(401, "Your session has expired. Sign in again");
  }
};
