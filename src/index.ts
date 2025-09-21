import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { beforeUserCreated } from "firebase-functions/v2/identity";

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

import nodemailer from "nodemailer";
import crypto from "crypto";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

initializeApp();
const db = getFirestore();
const adminAuth = getAdminAuth();

/** ---------- Helpers ---------- **/

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

const cfg: any = {
  smtp: {
    email: process.env.SMTP_EMAIL || (global as any).process?.env?.SMTP_EMAIL || (process as any).env?.SMTP_EMAIL || (typeof (global as any).functions !== "undefined" ? (global as any).functions.config()?.smtp?.email : undefined) || (global as any).config?.smtp?.email,
    pass: (typeof (global as any).functions !== "undefined" ? (global as any).functions.config()?.smtp?.pass : undefined),
    host: (typeof (global as any).functions !== "undefined" ? (global as any).functions.config()?.smtp?.host : undefined) || "smtp.gmail.com",
    port: Number((typeof (global as any).functions !== "undefined" ? (global as any).functions.config()?.smtp?.port : undefined) || 465),
    secure: ((typeof (global as any).functions !== "undefined" ? (global as any).functions.config()?.smtp?.secure : undefined) ?? "true") !== "false",
  },
  mail: {
    from: (typeof (global as any).functions !== "undefined" ? (global as any).functions.config()?.mail?.from : undefined) || "SASTRA AI Lab <no-reply@example.com>",
  },
  otp: {
    salt: (typeof (global as any).functions !== "undefined" ? (global as any).functions.config()?.otp?.salt : undefined) || "CHANGE_ME_SALT",
  }
};

function newOtp(): string {
  // cryptographically strong 6-digit string
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashOtp(otp: string): string {
  return crypto.createHmac("sha256", cfg.otp.salt).update(otp).digest("hex");
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const shown = name.length <= 2 ? name[0] : name.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(1, name.length - shown.length))}@${domain}`;
}

const transporter = nodemailer.createTransport({
  host: cfg.smtp.host,
  port: cfg.smtp.port,
  secure: cfg.smtp.secure,
  auth: { user: cfg.smtp.email, pass: cfg.smtp.pass },
});

/** ---------- Optional: block non-@sastra.ac.in signups ---------- **/
export const enforceSastraDomain = beforeUserCreated((event) => {
  const email = (event?.data?.email || "").toLowerCase();
  const ok = /@sastra\.ac\.in$/.test(email);
  if (!ok) throw new HttpsError("permission-denied", "Only @sastra.ac.in accounts are allowed.");
  return;
});

/** ---------- 1) Send OTP ---------- **/
export const sendPasswordOtp = onCall(async (req) => {
  const { loginId } = (req.data || {}) as { loginId?: string };
  if (!loginId || typeof loginId !== "string") {
    throw new HttpsError("invalid-argument", "loginId is required");
  }

  // lookup loginId -> { email, uid }
  const mapRef = db.doc(`loginLookup/${loginId}`);
  const mapSnap = await mapRef.get();
  if (!mapSnap.exists) throw new HttpsError("not-found", "No user found for this Login ID");
  const { email, uid } = mapSnap.data() as { email: string; uid: string };

  // throttle: delete any previous OTPs for this uid older than TTL
  const now = Date.now();

  // create session
  const otp = newOtp();
  const codeHash = hashOtp(otp);
  const sessionId = crypto.randomUUID();

  await db.doc(`passwordOtps/${sessionId}`).set({
    uid,
    email,
    codeHash,
    attempts: 0,
    createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + OTP_TTL_MS),
  });

  // email the OTP
  const mail = {
    from: cfg.mail.from,
    to: email,
    subject: "Your OTP to reset your SASTRA AI Lab password",
    text:
`Hi,
Use this One-Time Password to reset your password:

OTP: ${otp}

This code expires in 10 minutes.
If you didn’t request this, you can ignore this email.

— SASTRA AI Lab`,
  };

  await transporter.sendMail(mail);

  return { sessionId, emailMasked: maskEmail(email), ttlSeconds: OTP_TTL_MS / 1000 };
});

/** ---------- 2) Verify OTP + Set new password ---------- **/
export const verifyPasswordOtp = onCall(async (req) => {
  const { sessionId, otp, newPassword } = (req.data || {}) as { sessionId?: string; otp?: string; newPassword?: string };
  if (!sessionId || !otp || !newPassword) throw new HttpsError("invalid-argument", "sessionId, otp, newPassword are required");
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters");
  }

  const ref = db.doc(`passwordOtps/${sessionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Session not found or expired");

  const data = snap.data() as any;
  const nowMs = Date.now();

  if (data.expiresAt?.toMillis?.() < nowMs) {
    await ref.delete();
    throw new HttpsError("deadline-exceeded", "OTP expired. Please request a new one.");
  }

  if ((data.attempts ?? 0) >= MAX_ATTEMPTS) {
    await ref.delete();
    throw new HttpsError("resource-exhausted", "Too many attempts. Please request a new OTP.");
  }

  const ok = hashOtp(otp) === data.codeHash;
  if (!ok) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1, lastAttemptAt: FieldValue.serverTimestamp() });
    throw new HttpsError("permission-denied", "Invalid OTP");
  }

  // OTP valid → update password for this user and delete session
  const uid = data.uid as string;
  await adminAuth.updateUser(uid, { password: newPassword });
  await ref.delete();

  return { ok: true };
});
