import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { ensureAnonAuth } from '../shared/firebase-auth';
import { firebaseConfig } from '../shared/firebase-config';

/**
 * Backend of the kids' chat (backend/ in this repo), running on Benjamin's server behind Apache.
 * During development `ng serve` talks to the local backend (`npm --prefix backend run start:dev`).
 */
export const KIDS_CHAT_API =
  location.hostname === 'localhost' ? 'http://localhost:3200/api' : 'https://chat-api.benjamin-milcic.dev/api';

// Own, NAMED Firebase app like the games (see memory/firebase/firebase.ts) – only used for the login.
const APP_NAME = 'kids-chat';
const firebaseApp: FirebaseApp = getApps().some((a) => a.name === APP_NAME)
  ? getApp(APP_NAME)
  : initializeApp(firebaseConfig, APP_NAME);

/**
 * The backend only answers users of this Firebase project: every request carries the ID token of the
 * anonymous login. The SDK caches the token and renews it when it expires.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  await ensureAnonAuth(firebaseApp);
  const token = await getAuth(firebaseApp).currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** The languages the backend knows. The whiteboard also has Chinese – the chat then falls back to English. */
export type ChatLanguage = 'hr' | 'de' | 'en';

export function chatLanguage(appLanguage: string): ChatLanguage {
  return appLanguage === 'hr' || appLanguage === 'de' || appLanguage === 'en' ? appLanguage : 'en';
}
