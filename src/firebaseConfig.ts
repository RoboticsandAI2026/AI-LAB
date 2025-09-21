// src/firebaseConfig.ts
// Initializes Firebase for the app and exports: app, auth, db, functions.
// Works with your hard-coded config AND supports Vite env vars if you add them later.

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics, isSupported } from "firebase/analytics";

// Prefer Vite env vars if present; fall back to your current hard-coded values.
const firebaseConfig = {
  apiKey: import.meta?.env?.VITE_FIREBASE_API_KEY ?? "AIzaSyB40WwzLUSir4X80MouW5Q8HiQWGSXEZGM",
  authDomain: import.meta?.env?.VITE_FIREBASE_AUTH_DOMAIN ?? "lab-access-d86aa.firebaseapp.com",
  projectId: import.meta?.env?.VITE_FIREBASE_PROJECT_ID ?? "lab-access-d86aa",
  storageBucket: import.meta?.env?.VITE_FIREBASE_STORAGE_BUCKET ?? "lab-access-d86aa.firebasestorage.app",
  messagingSenderId: import.meta?.env?.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "723555284521",
  appId: import.meta?.env?.VITE_FIREBASE_APP_ID ?? "1:723555284521:web:819e8003d7fbc7dd5b8e38",
  measurementId: import.meta?.env?.VITE_FIREBASE_MEASUREMENT_ID ?? "G-JXQ7XTCZW2", // optional
};

// Reuse existing app instance (prevents duplicate init during Vite HMR)
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Named exports used across your app
export const auth = getAuth(app);
export const db = getFirestore(app);

// Cloud Functions (region must match your deploy; we use us-central1)
export const functions = getFunctions(app, "us-central1");

// ----- Optional: local emulator support -----
// Firestore emulator
try {
  const useFsEmu = import.meta?.env?.VITE_USE_FIRESTORE_EMULATOR === "true";
  if (useFsEmu) {
    const host = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || "127.0.0.1";
    const port = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080);
    connectFirestoreEmulator(db, host, port);
    console.info(`[firestore] emulator: ${host}:${port}`);
  }
} catch { /* ignore */ }

// Functions emulator
try {
  const useFnEmu = import.meta?.env?.VITE_USE_FUNCTIONS_EMULATOR === "true";
  if (useFnEmu) {
    const host = import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1";
    const port = Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001);
    connectFunctionsEmulator(functions, host, port);
    console.info(`[functions] emulator: ${host}:${port}`);
  }
} catch { /* ignore */ }

// Optional Analytics (only works on https or localhost)
isSupported()
  .then((ok) => {
    if (ok) getAnalytics(app);
  })
  .catch(() => {});
