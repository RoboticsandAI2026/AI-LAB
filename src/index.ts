import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { beforeUserCreated } from "firebase-functions/v2/identity";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 10
});

initializeApp();
const auth = getAuth();
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
  return; // allow create
});

/**
 * Optional: resolve an email by loginId for password logins.
 * Your UI already reads from loginLookup directly, so this is optional.
 *
 * data: { loginId: string }
 * returns: { loginId, email, uid? }
 */
export const resolveLoginEmail = onCall(async (request) => {
  const { loginId } = (request?.data || {}) as { loginId?: string };
  if (!loginId || typeof loginId !== "string") {
    throw new HttpsError("invalid-argument", "loginId is required");
  }

  // 1) Preferred mapping
  const lookupRef = db.doc(`loginLookup/${loginId}`);
  const lookupSnap = await lookupRef.get();
  if (lookupSnap.exists) {
    const { email, uid } = lookupSnap.data() as { email: string; uid?: string };
    return { loginId, email, uid: uid || null };
  }

  // 2) Fallback: find by users where loginId == given (legacy path)
  const q = await db.collection("users").where("loginId", "==", loginId).limit(1).get();
  if (!q.empty) {
    const docSnap = q.docs[0];
    const data = docSnap.data() as any;
    return { loginId, email: data.email || null, uid: data.uid || docSnap.id };
  }

  throw new HttpsError("not-found", "No user found for the given loginId");
});
