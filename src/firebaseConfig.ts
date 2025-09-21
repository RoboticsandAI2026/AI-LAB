// src/firebaseConfig.ts
// Exports: app, auth, db, functions

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta?.env?.VITE_FIREBASE_API_KEY ?? "AIzaSyB40WwzLUSir4X80MouW5Q8HiQWGSXEZGM",
  authDomain: import.meta?.env?.VITE_FIREBASE_AUTH_DOMAIN ?? "lab-access-d86aa.firebaseapp.com",
  projectId: import.meta?.env?.VITE_FIREBASE_PROJECT_ID ?? "lab-access-d86aa",
  storageBucket: import.meta?.env?.VITE_FIREBASE_STORAGE_BUCKET ?? "lab-access-d86aa.firebasestorage.app",
  messagingSenderId: import.meta?.env?.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "723555284521",
  appId: import.meta?.env?.VITE_FIREBASE_APP_ID ?? "1:723555284521:web:819e8003d7fbc7dd5b8e38",
  measurementId: import.meta?.env?.VITE_FIREBASE_MEASUREMENT_ID ?? "G-JXQ7XTCZW2",
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// IMPORTANT: this region must match your Functions deploy
export const functions = getFunctions(app, "us-central1");

// (Optional) Emulators
try {
  if (import.meta?.env?.VITE_USE_FIRESTORE_EMULATOR === "true") {
    connectFirestoreEmulator(db, "127.0.0.1", Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080));
  }
  if (import.meta?.env?.VITE_USE_FUNCTIONS_EMULATOR === "true") {
    connectFunctionsEmulator(functions, "127.0.0.1", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
  }
} catch {}

isSupported().then((ok) => { if (ok) getAnalytics(app); }).catch(() => {});
