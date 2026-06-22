// =============================================================
//  Gemeinsame anonyme Anmeldung für alle benannten Firebase-Apps.
// =============================================================
// Die Security Rules (database.rules.json / firestore.rules) verlangen
// `auth != null`. Damit kann niemand mehr ohne gültigen Token von DIESEM
// Firebase-Projekt direkt auf den REST-Endpunkt der Datenbank schreiben
// (z. B. per curl) – ein wirksamer Schutz, sobald das Repo öffentlich ist.
//
// Die Spiele identifizieren Spieler weiterhin über eine eigene playerId;
// die anonyme Anmeldung dient NUR dazu, überhaupt einen Auth-Token zu haben.
//
// Aufruf: `ensureAnonAuth(app)` liefert ein Promise, das erfüllt ist, sobald
// ein Token vorliegt. Erst danach dürfen DB-Zugriffe erfolgen. Das Promise
// wird pro App gecacht, mehrfaches Aufrufen ist also günstig.
//
// Voraussetzung: In der Firebase-Konsole muss die Anmeldeart "Anonym"
// aktiviert sein (Authentication → Sign-in method). Für "Schiffe versenken"
// ist das bereits der Fall.
// =============================================================
import type { FirebaseApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';

const pending = new Map<string, Promise<void>>();

export function ensureAnonAuth(app: FirebaseApp): Promise<void> {
  const cached = pending.get(app.name);
  if (cached) return cached;

  const auth = getAuth(app);
  const ready = new Promise<void>((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve();
      }
    });
    // Falls noch niemand angemeldet ist, anonyme Anmeldung anstoßen.
    if (!auth.currentUser) {
      signInAnonymously(auth).catch((err) => {
        unsub();
        pending.delete(app.name); // erlaubt einen erneuten Versuch
        reject(err);
      });
    }
  });

  pending.set(app.name, ready);
  return ready;
}
