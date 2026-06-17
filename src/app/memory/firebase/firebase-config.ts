/**
 * ▼▼▼  HIER DEINE FIREBASE-DATEN EINTRAGEN  ▼▼▼
 *
 * Diese Werte bekommst du in der Firebase-Konsole:
 *   Projekt-Einstellungen (Zahnrad) → "Meine Apps" → Web-App </> → "Konfiguration".
 *
 * Wichtig: Wir nutzen die Realtime Database, deshalb MUSS "databaseURL" gesetzt sein.
 * Die Werte hier sind keine Geheimnisse – sie dürfen öffentlich im Browser stehen.
 * Der Schutz kommt über die Datenbank-Regeln (siehe database.rules.json).
 */
// Memory liegt jetzt im gemeinsamen Whiteboard-Firebase-Projekt
// (whiteboard-32486) und nutzt dessen Realtime Database unter dem
// Pfad "memory/..." – siehe database.rules.json.
export const firebaseConfig = {
  apiKey: 'AIzaSyBY_UOdWb45qbnm8QWyoGqryVJhccGw3Hs',
  authDomain: 'whiteboard-32486.firebaseapp.com',
  databaseURL: 'https://whiteboard-32486-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'whiteboard-32486',
  storageBucket: 'whiteboard-32486.firebasestorage.app',
  messagingSenderId: '542282633974',
  appId: '1:542282633974:web:b1362d9803caac8ae292d7',
  measurementId: 'G-F8D4WSG0XS',
};
