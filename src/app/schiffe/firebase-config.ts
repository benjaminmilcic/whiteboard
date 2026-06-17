// =============================================================
//  HIER deine Firebase-Werte eintragen!
// =============================================================
// Du findest diese Werte in der Firebase-Konsole unter:
//   Projekt-Einstellungen (Zahnrad)  ->  "Allgemein"  ->
//   ganz unten bei "Meine Apps"  ->  Web-App  ->  "SDK-Konfiguration"
//
// Diese Werte sind KEINE Geheimnisse - sie dürfen öffentlich im
// Browser stehen. Geschützt wird die Datenbank über die
// Firestore-Sicherheitsregeln (siehe firestore.rules).
// =============================================================

// Schiffe liegt jetzt im gemeinsamen Whiteboard-Firebase-Projekt
// (whiteboard-32486) und nutzt dessen Firestore-Datenbank (Sammlung
// "games") + anonyme Anmeldung – siehe firestore.rules.
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
