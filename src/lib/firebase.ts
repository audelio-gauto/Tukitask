/**
 * Firebase client-side initialization.
 * Only runs in the browser — all config values are NEXT_PUBLIC_ (safe to expose).
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getMessaging, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            || '',
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        || '',
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         || '',
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             || '',
};

let firebaseApp: FirebaseApp | null = null;
let messagingInstance: Messaging | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return firebaseApp;
}

export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (!messagingInstance) {
    try {
      messagingInstance = getMessaging(getFirebaseApp());
    } catch {
      return null;
    }
  }
  return messagingInstance;
}

export const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
