import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import nodemailer from "nodemailer";
import crypto from "crypto";

setGlobalOptions({ region: "us-central1", maxInstances: 10 }); // <-- keep us-central1
initializeApp();
const db = getFirestore();
const adminAuth = getAdminAuth();

/* ---------- Config (set via `firebase functions:config:set ...`) ---------- */
const cfg: any = {
  smtp: {
    email: (global as any).functions?.config?.().smtp?.email,
    pass: (global as any).functions?.config?.().smtp?.pass,
    host: (global as any).functions?.config?.().smtp?.host || "smtp.gmail.com",
    port: Number((global as any).functions?.config?.().smtp?.port || 465),
    secure: ((global as any).functions?.config?.().smtp?.secure ?? "true") !== "false",
  },
  mail: {
    from: (global as any).functions?.config?.().mail?.from || "SASTRA AI Lab <no-reply@example.com>",
  },
  otp: {
    salt: (global as any).functions?.config?.().otp?.salt || "CHANGE_ME_SALT",
  },
};

/* ---------- Helpers ---------- */
const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

function newOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}
function hashOtp(otp: string): string {
  return crypto.createHmac("sha256", cfg.otp.salt).update(otp).digest("hex");
}
function maskEmail(email: string): string {
  const [n, d] = email.split("@");
  if (!n || !d) return email;
  const shown = n.length <= 2 ? n[0] : n.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(1, n.length - shown.length))}@${d}`;
}
const transporter = nodemailer.createTransport({
  host: cfg.smtp.host,
  port: cfg.smtp.port,
  secure: cfg.smtp.secure,
  auth: { user: cfg.smtp.email, pass: cfg.smtp.pass },
});

/* ---------- 1) Send OTP to email linked with Login ID ---------- */
export const sendPasswordOtp = onCall(async (req) => {
  const { loginId } = (req.data || {}) as { loginId?: string };
  if (!loginId || typeof loginId !== "string") {
    throw new HttpsError("invalid-argument", "loginId is required");
  }

  // Map loginId -> { email, uid } (this doc is created at signup)
  const mapSnap = await db.doc(`loginLookup/${loginId}`).get();
  if (!mapSnap.exists) throw new HttpsError("not-found", "No user found for this Login ID");
  const { email, uid } = mapSnap.data() as { email: string; uid: string };

  const otp = newOtp();
  const codeHash = hashOtp(otp);
  const sessionId = crypto.randomUUID();
  const now = Date.now();

  await db.doc(`passwordOtps/${sessionId}`).set({
    uid, email, codeHash,
    attempts: 0,
    createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + OTP_TTL_MS),
  });

  await transporter.sendMail({
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
  });

  return { sessionId, emailMasked: maskEmail(email), ttlSeconds: OTP_TTL_MS / 1000 };
});

/* ---------- 2) Verify OTP & set new password ---------- */
export const verifyPasswordOtp = onCall(async (req) => {
  const { sessionId, otp, newPassword } = (req.data || {}) as { sessionId?: string; otp?: string; newPassword?: string };
  if (!sessionId || !otp || !newPassword) {
    throw new HttpsError("invalid-argument", "sessionId, otp, newPassword are required");
  }
  if (newPassword.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters");
  }

  const ref = db.doc(`passwordOtps/${sessionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Session not found or expired");

  const data = snap.data() as any;
  if (data.expiresAt?.toMillis?.() < Date.now()) {
    await ref.delete();
    throw new HttpsError("deadline-exceeded", "OTP expired. Please request a new one.");
  }
  if ((data.attempts ?? 0) >= MAX_ATTEMPTS) {
    await ref.delete();
    throw new HttpsError("resource-exhausted", "Too many attempts. Request a new OTP.");
  }
  const ok = hashOtp(otp) === data.codeHash;
  if (!ok) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1, lastAttemptAt: FieldValue.serverTimestamp() });
    throw new HttpsError("permission-denied", "Invalid OTP");
  }

  await adminAuth.updateUser(data.uid as string, { password: newPassword });
  await ref.delete();
  return { ok: true };
});
