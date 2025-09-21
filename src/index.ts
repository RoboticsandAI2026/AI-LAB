import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { beforeUserCreated } from "firebase-functions/v2/identity";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

initializeApp();
const db = getFirestore();

/**
 * Hard-block any signups that aren't @sastra.ac.in
 * Runs BEFORE Firebase Auth user is created (client-side signups).
 * Admin SDK-created users (e.g., your seeding script) are not blocked.
 */
export const enforceSastraDomain = beforeUserCreated((event) => {
  const email = (event?.data?.email || "").toLowerCase();
  const ok = /@sastra\.ac\.in$/.test(email);
  if (!ok) {
    throw new HttpsError("permission-denied", "Only @sastra.ac.in accounts are allowed.");
  }
  return;
});

/**
 * Optional helper: resolve email by loginId (if you want to call from client).
 * Not strictly needed since the client reads loginLookup/{loginId}.
 */
export const resolveLoginEmail = onCall(async (request) => {
  const { loginId } = (request?.data || {}) as { loginId?: string };
  if (!loginId || typeof loginId !== "string") {
    throw new HttpsError("invalid-argument", "loginId is required");
  }
  const lookupSnap = await db.doc(`loginLookup/${loginId}`).get();
  if (lookupSnap.exists) {
    const { email, uid } = lookupSnap.data() as { email: string; uid?: string };
    return { loginId, email, uid: uid || null };
  }
  throw new HttpsError("not-found", "No user found for the given loginId");
});
