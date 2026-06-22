// =============================================================
//  Zentrale Firebase-Konfiguration für ALLE Komponenten/Spiele.
// =============================================================
// Alle Spiele (Whiteboard, Schiffe, Memory, Vier gewinnt, Backgammon,
// Dame, Schach, Yatzy) laufen im selben Firebase-Projekt
// "whiteboard-32486" und teilen sich daher dieselben Config-Werte.
// Sie unterscheiden sich nur durch den genutzten Datenpfad bzw. die
// Datenbankart (Realtime DB vs. Firestore) und durch eine eigene,
// BENANNTE Firebase-App (siehe das jeweilige firebase.ts).
//
// Diese Werte sind KEINE Geheimnisse – sie dürfen öffentlich im
// Browser stehen. Der Schutz kommt über die Datenbank-Regeln
// (database.rules.json bzw. firestore.rules).
//
// Die Werte stammen aus der Firebase-Konsole:
//   Projekt-Einstellungen (Zahnrad) → "Meine Apps" → Web-App </> →
//   "Konfiguration".
// =============================================================
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
