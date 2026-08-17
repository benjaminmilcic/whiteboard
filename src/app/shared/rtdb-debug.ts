// =============================================================
//  Schaltbares Firebase-Protokoll fuer die Fehlersuche.
// =============================================================
// Auf einem fremden Geraet (z. B. dem Handy der Mitspielerin) laesst sich die
// Browserkonsole nicht so leicht einsehen. Damit man das Verbindungsverhalten
// der Realtime Database trotzdem nachvollziehen kann:
//
//   ...?fbdebug=1   Protokoll einschalten (bleibt ueber Neuladen erhalten)
//   ...?fbdebug=0   Protokoll wieder ausschalten
//
// Das Protokoll landet in der Browserkonsole. Am Handy laesst es sich per USB
// von einem Rechner aus mitlesen: Chrome oeffnen → chrome://inspect.
// =============================================================
import { enableLogging } from 'firebase/database';

const FLAG_KEY = 'rtdb_debug';

/** Liest den Schalter aus URL/localStorage und aktiviert ggf. das Protokoll. */
export function enableRtdbDebugFromUrl(): void {
  try {
    const param = new URLSearchParams(location.search).get('fbdebug');
    if (param === '0' || param === 'false') {
      localStorage.removeItem(FLAG_KEY);
      return;
    }
    if (param !== null) localStorage.setItem(FLAG_KEY, '1');
    if (localStorage.getItem(FLAG_KEY) === '1') {
      enableLogging(true);
      console.info('[sync] Firebase-Protokoll aktiv (mit ?fbdebug=0 abschalten).');
    }
  } catch {
    /* kein localStorage (privater Modus) – dann eben kein Protokoll */
  }
}
