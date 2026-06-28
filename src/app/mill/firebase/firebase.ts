import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { firebaseConfig } from '../../shared/firebase-config';
import { ensureAnonAuth } from '../../shared/firebase-auth';

// Eigene, BENANNTE Firebase-App nur für "Mlin" (Mühle).
// In dieser zusammengelegten App laufen mehrere Firebase-Apps parallel
// (Whiteboard als [DEFAULT], Schiffe als 'schiffe', Memory als 'memory',
// Vier gewinnt als 'connect4', UNO als 'uno', Ludo als 'ludo' …).
// Der Name 'mill' verhindert eine Kollision.
const APP_NAME = 'mill';
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
