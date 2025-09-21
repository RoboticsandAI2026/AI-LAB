import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { beforeUserCreated } from "firebase-functions/v2/identity";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// IMPORTANT: use us-central1 for Auth blocking functions
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

initializeApp();
const db = getFirestore();

/**
 * Hard-block any signups that aren't @sastra.ac.in
 * Runs BEFORE Firebase Auth user is created (client-side signups).
 */
export const enforceSastraDomain = beforeUserCreated((event) => {
  const email = (event?.data?.email || "").toLowerCase();
  const ok = /@sastra\.ac\.in$/.test(email);
  if (!ok) {
    throw new HttpsError("permission-denied", "Only @sastra.ac.in accounts are allowed.");
  }
  return; // allow
});

// Optional helper (unchanged)
export const resolveLoginEmail = onCall(async (request) => {
  const { loginId } = (request?.data || {}) as { loginId?: string };
  if (!loginId || typeof loginId !== "string") {
    throw new HttpsError("invalid-argument", "loginId is required");
  }
  const snap = await db.doc(`loginLookup/${loginId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "No user found for the given loginId");
  const { email, uid } = snap.data() as { email: string; uid?: string };
  return { loginId, email, uid: uid || null };
});
