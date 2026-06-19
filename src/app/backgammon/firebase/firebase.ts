import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { firebaseConfig } from './firebase-config';

// Eigene, BENANNTE Firebase-App nur für "Backgammon".
// In dieser zusammengelegten App laufen mehrere Firebase-Apps parallel
// (Whiteboard über @angular/fire als [DEFAULT], Schiffe als 'schiffe',
// Memory als 'memory', Vier gewinnt als 'connect4'). Der Name 'backgammon'
// verhindert eine Kollision.
const APP_NAME = 'backgammon';
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
