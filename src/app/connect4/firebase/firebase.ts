import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { firebaseConfig } from '../../shared/firebase-config';
import { ensureAnonAuth } from '../../shared/firebase-auth';

// Eigene, BENANNTE Firebase-App nur für "Vier gewinnt".
// In dieser zusammengelegten App laufen mehrere Firebase-Apps parallel
// (Whiteboard über @angular/fire als [DEFAULT], Schiffe als 'schiffe',
// Memory als 'memory'). Der Name 'connect4' verhindert eine Kollision.
const APP_NAME = 'connect4';
export const firebaseApp: FirebaseApp = getApps().some((a) => a.name === APP_NAME)
  ? getApp(APP_NAME)
  : initializeApp(firebaseConfig, APP_NAME);

// Ohne gültige databaseURL kann das SDK nicht verbinden und Anfragen hängen.
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

// db ist nur gültig, wenn databaseConfigured === true (vorher prüfen!).
export const db = database as Database;

// Anonyme Anmeldung – die Security Rules verlangen `auth != null`. Erst wenn
// dieses Promise erfüllt ist, dürfen DB-Zugriffe erfolgen (Services: `await authReady`).
export const authReady: Promise<void> = databaseConfigured
  ? ensureAnonAuth(firebaseApp)
  : Promise.resolve();
