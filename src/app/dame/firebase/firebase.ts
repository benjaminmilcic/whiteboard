import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { firebaseConfig } from '../../shared/firebase-config';
import { ensureAnonAuth } from '../../shared/firebase-auth';

// Eigene, BENANNTE Firebase-App nur für "Dame", damit sie nicht mit den
// anderen Spielen (schiffe, memory, connect4, backgammon) kollidiert.
const APP_NAME = 'dame';
export const firebaseApp: FirebaseApp = getApps().some((a) => a.name === APP_NAME)
  ? getApp(APP_NAME)
  : initializeApp(firebaseConfig, APP_NAME);

export const databaseConfigured =
  !!firebaseConfig.databaseURL &&
  !firebaseConfig.databaseURL.includes('HIER_') &&
  !firebaseConfig.databaseURL.includes('DEIN_PROJEKT') &&
  firebaseConfig.databaseURL.startsWith('https://');

let database: Database | null = null;
if (databaseConfigured) {
  try {
    database = getDatabase(firebaseApp);
  } catch {
    database = null;
  }
}

export const db = database as Database;

// Anonyme Anmeldung – die Security Rules verlangen `auth != null`. Erst wenn
// dieses Promise erfüllt ist, dürfen DB-Zugriffe erfolgen (Services: `await authReady`).
export const authReady: Promise<void> = databaseConfigured
  ? ensureAnonAuth(firebaseApp)
  : Promise.resolve();
