import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ---- ENV (set with firebase functions:config:set ... shown below) ----
const MAIL_FROM = functions.config().mail?.from || "no-reply@example.com";
const SMTP_HOST = functions.config().smtp?.host;
const SMTP_PORT = Number(functions.config().smtp?.port || 587);
const SMTP_USER = functions.config().smtp?.user;
const SMTP_PASS = functions.config().smtp?.pass;

// JWT secret for reset tokens
const RESET_JWT_SECRET = functions.config().reset?.jwt_secret || "CHANGE_ME_DEV_ONLY";

// 10 minutes for OTP, 15 minutes for reset token
const OTP_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 15 * 60 * 1000;

function transporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "SMTP not configured. Set functions config."
    );
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function getUserByLoginId(loginId: string) {
  const snap = await db.collection("users").where("loginId", "==", loginId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  return { uid: doc.id, ...data } as { uid: string; email: string; loginId: string; name?: string };
}

function generateOTP(): string {
  return (Math.floor(100000 + Math.random() * 900000)).toString(); // 6-digit
}

export const requestPasswordResetOTP = functions.https.onCall(async (data, context) => {
  const loginId = (data?.loginId || "").trim();
  if (!loginId) {
    throw new functions.https.HttpsError("invalid-argument", "loginId required");
  }

  const user = await getUserByLoginId(loginId);
  if (!user?.email) {
    // Avoid user enumeration: respond success anyway, but do nothing.
    return { success: true };
  }

  const otp = generateOTP();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = Date.now() + OTP_TTL_MS;

  await db.collection("password_resets").doc(loginId).set({
    otpHash,
    expiresAt,
    attempts: 0,
    resetToken: null,
    resetTokenExpiresAt: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // send email
  const t = transporter();
  await t.sendMail({
    from: MAIL_FROM,
    to: user.email,
    subject: "AI-LAB Password Reset OTP",
    text:
`Hello${user.name ? " " + user.name : ""},

Your OTP for resetting the AI-LAB password is: ${otp}

This OTP will expire in 10 minutes. If you did not request this, you can ignore this email.

— AI-LAB`,
  });

  return { success: true };
});

export const verifyPasswordResetOTP = functions.https.onCall(async (data, context) => {
  const loginId = (data?.loginId || "").trim();
  const otp = (data?.otp || "").trim();

  if (!loginId || !otp) {
    throw new functions.https.HttpsError("invalid-argument", "loginId and otp required");
  }

  const docRef = db.collection("password_resets").doc(loginId);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError("not-found", "OTP not found or expired");
  }

  const r = doc.data() as any;
  if (!r?.otpHash || !r?.expiresAt) {
    throw new functions.https.HttpsError("not-found", "OTP not found or expired");
  }

  if (Date.now() > r.expiresAt) {
    await docRef.delete();
    throw new functions.https.HttpsError("deadline-exceeded", "OTP expired");
  }

  if (!(await bcrypt.compare(otp, r.otpHash))) {
    const tries = (r.attempts || 0) + 1;
    if (tries >= 5) {
      await docRef.delete(); // lockout after 5 wrong attempts
      throw new functions.https.HttpsError("permission-denied", "Too many attempts");
    }
    await docRef.update({ attempts: tries, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    throw new functions.https.HttpsError("unauthenticated", "Incorrect OTP");
  }

  // Successful OTP → issue short-lived reset token
  const resetToken = jwt.sign({ loginId }, RESET_JWT_SECRET, { expiresIn: Math.floor(TOKEN_TTL_MS / 1000) });
  const resetTokenExpiresAt = Date.now() + TOKEN_TTL_MS;
  await docRef.update({
    resetToken,
    resetTokenExpiresAt,
    // OTP one-and-done: remove it
    otpHash: admin.firestore.FieldValue.delete(),
    expiresAt: admin.firestore.FieldValue.delete(),
    attempts: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, resetToken };
});

export const setNewPassword = functions.https.onCall(async (data, context) => {
  const loginId = (data?.loginId || "").trim();
  const resetToken = (data?.resetToken || "").trim();
  const newPassword = (data?.newPassword || "").trim();

  if (!loginId || !resetToken || !newPassword) {
    throw new functions.https.HttpsError("invalid-argument", "loginId, resetToken, newPassword required");
  }
  if (newPassword.length < 8) {
    throw new functions.https.HttpsError("invalid-argument", "Password must be at least 8 characters");
  }

  // verify token
  let payload: any;
  try {
    payload = jwt.verify(resetToken, RESET_JWT_SECRET);
  } catch {
    throw new functions.https.HttpsError("unauthenticated", "Invalid or expired token");
  }
  if (payload?.loginId !== loginId) {
    throw new functions.https.HttpsError("unauthenticated", "Token/login mismatch");
  }

  // ensure token is the latest
  const docRef = db.collection("password_resets").doc(loginId);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError("not-found", "Reset session expired");
  }
  const r = doc.data() as any;
  if (r.resetToken !== resetToken || Date.now() > (r.resetTokenExpiresAt || 0)) {
    await docRef.delete();
    throw new functions.https.HttpsError("unauthenticated", "Reset token expired");
  }

  const user = await getUserByLoginId(loginId);
  if (!user) {
    await docRef.delete();
    throw new functions.https.HttpsError("not-found", "User not found");
  }

  // Update password in Firebase Auth
  await admin.auth().updateUser(user.uid, { password: newPassword });

  // Cleanup reset doc
  await docRef.delete();

  return { success: true };
});
