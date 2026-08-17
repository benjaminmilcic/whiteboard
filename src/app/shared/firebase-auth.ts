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
// Zusätzlich läuft danach eine Überwachung weiter: fällt die Anmeldung im
// laufenden Betrieb weg (z. B. weil der Token nicht erneuert werden konnte),
// wird sie automatisch erneuert. Ohne das verlieren offene Listener ihre
// Leseberechtigung – Firebase bricht sie ab und hängt sie nie wieder an, das
// Spiel bleibt dann stumm stehen.
//
// Voraussetzung: In der Firebase-Konsole muss die Anmeldeart "Anonym"
// aktiviert sein (Authentication → Sign-in method). Für "Schiffe versenken"
// ist das bereits der Fall.
// =============================================================
import type { FirebaseApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth } from 'firebase/auth';

const pending = new Map<string, Promise<void>>();
/** Apps, für die die Überwachung schon läuft. */
const watched = new Set<string>();
/** Obergrenze für erneute Anmeldeversuche, damit nichts endlos rotiert. */
const MAX_RETRIES = 5;

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
  void ready.then(() => watchAuth(app.name, auth)).catch(() => {
    /* Fehler meldet der Aufrufer – hier nur keine unbehandelte Rejection */
  });
  return ready;
}

/**
 * Hält die anonyme Anmeldung aufrecht. Verschwindet der Benutzer, wird sofort
 * neu angemeldet, damit laufende Datenbank-Listener ihre Berechtigung behalten.
 */
function watchAuth(name: string, auth: Auth): void {
  if (watched.has(name)) return;
  watched.add(name);

  let retries = 0;
  let signingIn = false;

  onAuthStateChanged(auth, (user) => {
    if (user) {
      retries = 0;
      return;
    }
    if (signingIn || retries >= MAX_RETRIES) return;
    signingIn = true;
    retries++;
    console.warn(`[sync] Anmeldung für "${name}" verloren – melde neu an (Versuch ${retries}).`);
    signInAnonymously(auth)
      .catch((err) => console.warn(`[sync] Erneute Anmeldung für "${name}" fehlgeschlagen:`, err))
      .finally(() => {
        signingIn = false;
      });
  });
}
