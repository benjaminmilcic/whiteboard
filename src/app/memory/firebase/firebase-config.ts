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
export const firebaseConfig = {
  apiKey: 'AIzaSyCT93oZO54sR22X0Q55u4D0H1PF6l0EF3s',
  authDomain: 'memory-a3801.firebaseapp.com',
  databaseURL: 'https://memory-a3801-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'memory-a3801',
  storageBucket: 'memory-a3801.firebasestorage.app',
  messagingSenderId: '100081705117',
  appId: '1:100081705117:web:75ae1806a7879694ddb474',
  measurementId: 'G-HQZYD3CPEB',
};
