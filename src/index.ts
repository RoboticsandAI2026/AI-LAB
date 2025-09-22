import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as functions from "firebase-functions"; // for functions.config()
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import nodemailer from "nodemailer";
import crypto from "crypto";

// 👇 Keep region in sync with your client getFunctions(app, "<region>")
setGlobalOptions({ region: "us-central1", maxInstances: 10 });
initializeApp();

const db = getFirestore();
const adminAuth = getAdminAuth();

// Runtime config (set via: firebase functions:config:set ...)
const cfg = functions.config() as any;

const SMTP_EMAIL  = cfg.smtp?.email;
const SMTP_PASS   = cfg.smtp?.pass;
const SMTP_HOST   = cfg.smtp?.host || "smtp.gmail.com";
const SMTP_PORT   = Number(cfg.smtp?.port || 465);
const SMTP_SECURE = (cfg.smtp?.secure ?? "true") !== "false";
const MAIL_FROM   = cfg.mail?.from || "SASTRA AI Lab <no-reply@example.com>";
const OTP_SALT    = cfg.otp?.salt || "CHANGE_ME_SALT";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_EMAIL, pass: SMTP_PASS },
});

const OTP_TTL_MS = 10 * 60 * 1000;      // 10 min for OTP
const TICKET_TTL_MS = 10 * 60 * 1000;   // 10 min to set password after OTP
const MAX_ATTEMPTS = 5;

function newOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}
function hashOtp(otp: string): string {
  return crypto.createHmac("sha256", OTP_SALT).update(otp).digest("hex");
}
function maskEmail(email: string): string {
  const [n, d] = email.split("@"); if (!n || !d) return email;
  const shown = n.length <= 2 ? n[0] : n.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(1, n.length - shown.length))}@${d}`;
}

/** STEP 1: sendPasswordOtp({ loginId }) -> { sessionId, emailMasked, ttlSeconds } */
export const sendPasswordOtp = onCall(async (req) => {
  const { loginId } = (req.data || {}) as { loginId?: string };
  if (!loginId || typeof loginId !== "string") {
    throw new HttpsError("invalid-argument", "loginId is required");
  }

  // loginId -> { email, uid }
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
    from: MAIL_FROM,
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

/** STEP 2: validatePasswordOtp({ sessionId, otp }) -> { ticketId } */
export const validatePasswordOtp = onCall(async (req) => {
  const { sessionId, otp } = (req.data || {}) as { sessionId?: string; otp?: string };
  if (!sessionId || !otp) {
    throw new HttpsError("invalid-argument", "sessionId and otp are required");
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

  // Valid OTP → issue a one-time reset ticket and delete OTP session
  const ticketId = crypto.randomUUID();
  const now = Date.now();
  await db.doc(`resetTickets/${ticketId}`).set({
    uid: data.uid,
    createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + TICKET_TTL_MS),
    used: false,
  });

  await ref.delete();
  return { ticketId };
});

/** STEP 3: setPasswordWithTicket({ ticketId, newPassword }) -> { ok: true } */
export const setPasswordWithTicket = onCall(async (req) => {
  const { ticketId, newPassword } = (req.data || {}) as { ticketId?: string; newPassword?: string };
  if (!ticketId || !newPassword) {
    throw new HttpsError("invalid-argument", "ticketId and newPassword are required");
  }
  if (newPassword.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters");
  }

  const tRef = db.doc(`resetTickets/${ticketId}`);
  const tSnap = await tRef.get();
  if (!tSnap.exists) throw new HttpsError("not-found", "Reset ticket not found");

  const t = tSnap.data() as any;
  if (t.used) throw new HttpsError("failed-precondition", "This reset ticket was already used.");
  if (t.expiresAt?.toMillis?.() < Date.now()) {
    await tRef.delete();
    throw new HttpsError("deadline-exceeded", "Reset ticket expired. Start over.");
  }

  await adminAuth.updateUser(t.uid as string, { password: newPassword });
  await tRef.update({ used: true, usedAt: FieldValue.serverTimestamp() });

  return { ok: true };
});
