// =============================================================
//  Robuste Spiel-Synchronisation ueber die Realtime Database.
// =============================================================
// Alle Rundenspiele (Vier gewinnt, Uno, Mensch aergere dich nicht, Dame,
// Schach, Backgammon, Muehle, Yatzy, Memory) haengen an derselben Mechanik:
// ein onValue-Listener auf dem Spielknoten + Schreibvorgaenge fuer die Zuege.
//
// Diese Klasse buendelt das und behebt die Faelle, in denen ein Spiel vorher
// still stehen blieb (beide Seiten warteten auf den Zug des anderen):
//
//  1. KEIN PHANTOM-ZUG. Firebase wendet Schreibvorgaenge sofort lokal an
//     ("latency compensation") – der eigene Zug sah also auch dann erledigt
//     aus, wenn er das Geraet nie verlassen hat. Deshalb schreiben wir mit
//     `applyLocally: false`: der Zug erscheint erst, wenn der Server ihn
//     bestaetigt hat.
//  2. KEIN UEBERSCHREIBEN DURCH ALTE ZUEGE. Jeder Zug laeuft als Transaktion
//     und greift nur, wenn der Server noch auf der Revision (`rev`) steht, aus
//     der der Zug berechnet wurde. Ein spaeter nachgereichter Zug wird
//     verworfen statt einen neueren Stand zu zerstoeren.
//  3. LISTENER WIEDER AUFBAUEN. Firebase haengt einen abgebrochenen Listener
//     NIE von allein wieder an (z. B. wenn der Auth-Token nicht erneuert
//     werden konnte). Ohne eigenes Zutun bleibt so ein Client dauerhaft blind.
//  4. ABGLEICH BEI RUECKKEHR. Handys kappen die Verbindung, sobald der
//     Bildschirm ausgeht oder das Netz wechselt. Kommt der Tab zurueck oder
//     meldet sich die Verbindung, holen wir den Stand direkt vom Server.
//  5. SICHTBARKEIT. Verbindungsstatus und Fehler landen in Signalen, die die
//     Oberflaeche anzeigt – und zusaetzlich als console.warn, damit im
//     Fehlerfall ueberhaupt etwas in der Browserkonsole steht.
// =============================================================
import { computed, signal } from '@angular/core';
import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  type Database,
  type Unsubscribe,
} from 'firebase/database';

/** Zeitgrenze fuer einen Zug – danach gilt er als nicht gespeichert. */
const WRITE_TIMEOUT = 10_000;
/** Zeitgrenze fuer einen einzelnen Lesevorgang. */
const READ_TIMEOUT = 10_000;
/** Wartezeit vor dem ersten Neuaufbau eines abgebrochenen Listeners. */
const RETRY_MIN = 1_000;
/** Obergrenze der Wartezeit zwischen zwei Versuchen. */
const RETRY_MAX = 30_000;
/** Erst nach dieser Zeit ohne Verbindung wird der Hinweis eingeblendet. */
const OFFLINE_GRACE = 2_500;
/** Erst nach dieser Zeit wird "Zug wird gesendet" eingeblendet. */
const PENDING_HINT_AFTER = 800;
/** Mehrere Abgleiche dicht hintereinander (Focus + Visibility) zusammenfassen. */
const RESYNC_THROTTLE = 1_500;
/** Aelter als das wird ein gemerktes Spiel nicht mehr fortgesetzt. */
const RESUME_MAX_AGE = 12 * 60 * 60 * 1000;
/** Takt fuer die Abwesenheits-Anzeige (nur lokal, kein Datenbankzugriff). */
const TICK_MS = 1_000;

/** Standardmeldung, wenn die Datenbank nicht antwortet. */
export const TIMEOUT_MESSAGE = 'Zeitüberschreitung: Die Datenbank antwortet nicht.';

/** Verhindert ewiges Haengen, falls die Datenbank nicht antwortet. */
export function withTimeout<T>(p: Promise<T>, ms = 12_000, message = TIMEOUT_MESSAGE): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([p, guard]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** Das Minimum, das ein Spielzustand fuer diesen Kanal mitbringen muss. */
export interface SyncedGame {
  code: string;
  /** Fortlaufende Revision – schuetzt vor dem Ueberschreiben durch alte Zuege. */
  rev?: number;
  updatedAt?: number;
  /** Fuer die Abwesenheits-Anzeige – jedes Spiel hier hat eine Spielerliste. */
  players?: Record<string, { name?: string }>;
}

/**
 * Ist dieses Geraet gerade mit der Datenbank verbunden?
 *
 * `at` ist eine SERVER-Zeit (serverTimestamp). Nie direkt mit Date.now()
 * vergleichen – die Uhr eines Handys kann daneben liegen. Dafuer gibt es
 * `awayMs()`, das den Versatz aus `.info/serverTimeOffset` einrechnet.
 */
export interface PlayerPresence {
  online: boolean;
  at: number;
}

/** Ein Mitspieler, der gerade nicht verbunden ist. */
export interface AwayPlayer {
  id: string;
  name: string;
  /** Sekunden seit dem Verschwinden. */
  seconds: number;
}

export interface GameChannelOptions<T extends SyncedGame> {
  /** Datenbank der jeweiligen (benannten) Firebase-App. */
  db: Database;
  /** false, wenn in der firebase-config keine gueltige databaseURL steht. */
  configured: boolean;
  /** Anonyme Anmeldung – wird vor jedem Zugriff abgewartet. */
  authReady: Promise<void>;
  /** Pfad zu den Spielen, z. B. 'connect4/games'. */
  basePath: string;
  /** Eigene Spieler-Id – fuer den Praesenz-Eintrag. Als Funktion, damit die
   *  Reihenfolge der Felder im Service keine Rolle spielt. */
  playerId: () => string;
  /** localStorage-Schluessel fuer das zuletzt geoeffnete Spiel. */
  activeKey: string;
  /** Rohdaten aus Firebase auffuellen – die normalize() des jeweiligen Spiels. */
  normalize: (raw: any) => T;
  /** Darf dieses Spiel nach einem Neuladen fortgesetzt werden? */
  canResume: (game: T) => boolean;
  /** Uebersetzt einen sync.*-Schluessel in die aktuelle Sprache. */
  t: (key: string) => string;
  /** Optional: laeuft nach jedem neuen Stand (z. B. Bestenliste schreiben). */
  onState?: (game: T | null) => void;
}

export class GameChannel<T extends SyncedGame> {
  /** Aktueller Spielzustand (null = kein Spiel offen). */
  readonly state = signal<T | null>(null);
  /** Meldung fuer die Oberflaeche – Zug nicht gespeichert, Verbindung verloren, … */
  readonly error = signal<string | null>(null);
  /** Verbindung zur Datenbank steht (aus `.info/connected`). */
  readonly online = signal(true);
  /** Verbindung ist laenger als OFFLINE_GRACE weg – erst dann Hinweis zeigen. */
  readonly offline = signal(false);
  /** Ein Zug ist unterwegs und dauert auffaellig lange. */
  readonly pending = signal(false);
  /**
   * Wer von den Mitspielern gerade verbunden ist. Liegt im Spielknoten selbst
   * (`<code>/presence/<spielerId>`), kommt also mit jedem Snapshot mit – kein
   * zweiter Listener und keine Aenderung an den Datenbank-Regeln noetig.
   */
  readonly presence = signal<Record<string, PlayerPresence>>({});
  /** Tickt sekuendlich, solange ein Spiel offen ist – treibt die Abwesenheitsanzeige. */
  readonly tick = signal(0);

  private code: string | null = null;
  private dataUnsub: Unsubscribe | null = null;
  private connUnsub: Unsubscribe | null = null;
  private reattachTimer: ReturnType<typeof setTimeout> | null = null;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private offsetUnsub: Unsubscribe | null = null;
  /** Versatz zwischen lokaler Uhr und Server-Uhr in Millisekunden. */
  private serverOffset = 0;
  private retryDelay = RETRY_MIN;
  private lastResync = 0;
  /** true, solange ein Zug auf die Bestaetigung des Servers wartet. */
  private writing = false;
  /** true, solange wir uns von einem Verbindungsproblem erholen. */
  private recovering = false;
  private wakeupsBound = false;

  constructor(private readonly opts: GameChannelOptions<T>) {}

  // ---- Oeffnen / Schliessen ------------------------------------------------
  /** Auf ein Spiel aufschalten und dauerhaft synchron halten. */
  open(code: string): void {
    if (!this.opts.configured) return;
    this.code = code;
    this.remember(code);
    this.error.set(null);
    this.recovering = false;
    this.retryDelay = RETRY_MIN;
    // Der Listener unten liefert den Stand sofort – der Abgleich, den die
    // Verbindungsueberwachung beim ersten `connected` anstossen wuerde, waere
    // doppelt. Deshalb die Sperre gleich setzen.
    this.lastResync = Date.now();
    this.watchConnection();
    this.bindWakeups();
    this.startTicking();
    this.attach();
  }

  /** Spiel verlassen: alle Listener loesen und den Zustand leeren. */
  close(): void {
    const code = this.code;
    this.code = null;
    this.forget();
    // Praesenz-Eintrag mitnehmen, damit der Gegner nicht "ist weg" sieht,
    // obwohl das Spiel bewusst beendet wurde.
    if (code) void this.dropPresence(code);
    this.clearTimers();
    this.dataUnsub?.();
    this.dataUnsub = null;
    this.connUnsub?.();
    this.connUnsub = null;
    this.offsetUnsub?.();
    this.offsetUnsub = null;
    this.unbindWakeups();
    this.recovering = false;
    this.state.set(null);
    this.error.set(null);
    this.pending.set(false);
    this.offline.set(false);
    this.presence.set({});
  }

  // ---- Praesenz -----------------------------------------------------------
  /**
   * Wie lange ist dieser Spieler schon nicht mehr verbunden? 0 = verbunden oder
   * unbekannt (z. B. eine aeltere Partie ohne Praesenz-Eintraege).
   *
   * Liest `tick`, aktualisiert sich also sekuendlich von selbst.
   */
  awayMs(playerId: string): number {
    this.tick();
    const p = this.presence()[playerId];
    if (!p || p.online !== false || !p.at) return 0;
    return Math.max(0, Date.now() + this.serverOffset - p.at);
  }

  /**
   * Alle Mitspieler (ohne einen selbst), die gerade nicht verbunden sind.
   * Aktualisiert sich sekuendlich.
   */
  readonly awayPlayers = computed<AwayPlayer[]>(() => {
    const players = this.state()?.players;
    if (!players) return [];
    const me = this.opts.playerId();
    const out: AwayPlayer[] = [];
    for (const [id, p] of Object.entries(players)) {
      if (id === me) continue;
      const seconds = Math.floor(this.awayMs(id) / 1000);
      if (seconds > 0) out.push({ id, name: p?.name ?? '', seconds });
    }
    return out;
  });

  private presenceRef(code: string) {
    return ref(this.opts.db, `${this.opts.basePath}/${code}/presence/${this.opts.playerId()}`);
  }

  /**
   * Meldet dieses Geraet als verbunden und hinterlegt beim Server, was passieren
   * soll, wenn die Verbindung stirbt.
   *
   * `onDisconnect` ist der einzige Weg, der auch Tab-Schliessen, Absturz,
   * Flugmodus und leeren Akku abdeckt: die Datenbank fuehrt den Schreibvorgang
   * SERVERSEITIG aus. Muss nach jedem Neuverbinden erneut hinterlegt werden.
   */
  private async announcePresence(code: string): Promise<void> {
    try {
      const p = this.presenceRef(code);
      await onDisconnect(p).set({ online: false, at: serverTimestamp() });
      await set(p, { online: true, at: serverTimestamp() });
    } catch (e) {
      console.warn('[sync] Präsenz konnte nicht gemeldet werden:', e);
    }
  }

  private async dropPresence(code: string): Promise<void> {
    try {
      await remove(this.presenceRef(code));
    } catch (e) {
      console.warn('[sync] Präsenz konnte nicht entfernt werden:', e);
    }
  }

  private startTicking(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick.update((n) => n + 1), TICK_MS);
  }

  /** Hinweis wegklicken. */
  dismissError(): void {
    this.error.set(null);
  }

  /**
   * Nach einem Neuladen zurueck ins laufende Spiel. Liefert true, wenn ein
   * fortsetzbares Spiel gefunden und geoeffnet wurde.
   */
  async resume(): Promise<boolean> {
    if (!this.opts.configured || this.state()) return false;
    const code = this.recall();
    if (!code) return false;
    try {
      await this.opts.authReady;
      const snap = await withTimeout(get(this.gameRef(code)), READ_TIMEOUT);
      const raw = snap.val();
      const game = raw ? this.opts.normalize(raw) : null;
      const fresh = !!game && Date.now() - (game.updatedAt ?? 0) < RESUME_MAX_AGE;
      if (!game || !fresh || !this.opts.canResume(game)) {
        this.forget();
        return false;
      }
      this.state.set(game);
      this.opts.onState?.(game);
      this.open(code);
      return true;
    } catch (e) {
      console.warn('[sync] Fortsetzen fehlgeschlagen:', e);
      return false;
    }
  }

  // ---- Schreiben ----------------------------------------------------------
  /**
   * Schreibt einen Zug. Der Patch enthaelt die zu aendernden Felder auf oberster
   * Ebene des Spielknotens – genau wie vorher bei `update()`.
   *
   * Angewendet wird er nur, wenn der Server noch auf der Revision steht, aus der
   * der Zug berechnet wurde. Damit kann ein verzoegert zugestellter Zug keinen
   * neueren Stand ueberschreiben. Liefert false, wenn der Zug nicht durchkam;
   * die Oberflaeche zeigt dann den Grund an.
   */
  async commit(patch: Record<string, unknown>): Promise<boolean> {
    const current = this.state();
    const code = this.code;
    if (!this.opts.configured || !code || !current) return false;

    // Doppeltippen: der erste Zug ist noch unterwegs und die Oberflaeche hat
    // sich noch nicht bewegt (applyLocally: false). Der zweite Aufruf waere auf
    // demselben Stand berechnet und wuerde ohnehin verworfen – also gleich hier
    // abbrechen, still und ohne Fehlermeldung.
    if (this.writing) return false;
    this.writing = true;
    const expected = current.rev ?? 0;

    this.markPending(true);
    try {
      await this.opts.authReady;
      const result = await withTimeout(
        runTransaction(
          this.gameRef(code),
          (raw: any) => {
            if (!raw) return undefined; // Spiel existiert nicht mehr → abbrechen
            if ((raw.rev ?? 0) !== expected) return undefined; // veraltet → verwerfen
            return { ...raw, ...patch, rev: expected + 1, updatedAt: Date.now() };
          },
          // Entscheidend: ohne Server-Bestaetigung darf der eigene Zug NICHT
          // angezeigt werden. Sonst sieht der Spieler ihn ausgefuehrt, waehrend
          // der Gegner nie etwas erhaelt – und beide warten aufeinander.
          { applyLocally: false },
        ),
        WRITE_TIMEOUT,
        this.opts.t('sync.timeout'),
      );

      if (!result.committed) {
        console.warn('[sync] Zug verworfen – der Stand war nicht mehr aktuell.');
        this.error.set(this.opts.t('sync.changed'));
        void this.forceResync();
        return false;
      }
      this.error.set(null);
      return true;
    } catch (e) {
      console.warn('[sync] Zug konnte nicht gespeichert werden:', e);
      this.error.set(this.opts.t('sync.notSaved'));
      void this.forceResync();
      return false;
    } finally {
      this.writing = false;
      this.markPending(false);
    }
  }

  // ---- Lesen / Abgleich ---------------------------------------------------
  /** Holt den Stand vom Server und setzt den Listener frisch auf. */
  async resync(): Promise<void> {
    if (!this.opts.configured || !this.code) return;
    const now = Date.now();
    if (now - this.lastResync < RESYNC_THROTTLE) return;
    this.lastResync = now;

    const code = this.code;
    try {
      await this.opts.authReady;
      const snap = await withTimeout(get(this.gameRef(code)), READ_TIMEOUT);
      if (this.code !== code) return; // zwischenzeitlich verlassen
      this.apply(snap.val());
    } catch (e) {
      console.warn('[sync] Abgleich fehlgeschlagen:', e);
    }
    // Den Listener in jedem Fall neu aufsetzen: ein still verstummter Listener
    // wuerde von allein nie wieder Daten liefern.
    if (this.code === code) this.attach();
  }

  /** Abgleich ohne Drosselung – nach einem fehlgeschlagenen Zug. */
  private forceResync(): Promise<void> {
    this.lastResync = 0;
    return this.resync();
  }

  // ---- Intern -------------------------------------------------------------
  private gameRef(code: string) {
    return ref(this.opts.db, `${this.opts.basePath}/${code}`);
  }

  /** Rohdaten uebernehmen: auffuellen, veroeffentlichen, Nachlauf ausloesen. */
  private apply(raw: unknown): void {
    // Die Praesenz haengt im Spielknoten und kommt mit jedem Snapshot mit.
    // Sie wird VOR normalize() gelesen, das sie nicht kennt.
    const presence = (raw as { presence?: Record<string, PlayerPresence> } | null)?.presence;
    this.presence.set(presence ?? {});
    const game = raw ? this.opts.normalize(raw) : null;
    this.state.set(game);
    this.opts.onState?.(game);
    this.recovered();
  }

  private attach(): void {
    const code = this.code;
    if (!code) return;
    if (this.reattachTimer) {
      clearTimeout(this.reattachTimer);
      this.reattachTimer = null;
    }
    this.dataUnsub?.();
    this.dataUnsub = onValue(
      this.gameRef(code),
      (snap) => {
        this.retryDelay = RETRY_MIN;
        this.apply(snap.val());
      },
      (err) => {
        // Firebase bricht den Listener ab (z. B. PERMISSION_DENIED, wenn der
        // Auth-Token nicht erneuert werden konnte) und haengt ihn NIE wieder an.
        console.warn('[sync] Listener abgebrochen – Neuaufbau folgt:', err);
        this.dataUnsub = null;
        this.recovering = true;
        this.error.set(this.opts.t('sync.lost'));
        this.scheduleReattach();
      },
    );
  }

  private scheduleReattach(): void {
    if (this.reattachTimer || !this.code) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(delay * 2, RETRY_MAX);
    this.reattachTimer = setTimeout(() => {
      this.reattachTimer = null;
      this.attach();
    }, delay);
  }

  /** Nach einem Verbindungsproblem: Hinweis wieder entfernen. */
  private recovered(): void {
    if (!this.recovering) return;
    this.recovering = false;
    this.error.set(null);
  }

  private watchConnection(): void {
    if (!this.offsetUnsub) {
      // Praesenz-Zeitstempel kommen vom Server; die Uhr des Geraets kann daneben
      // liegen. Ohne diesen Versatz waere "seit wann weg" schlicht falsch.
      this.offsetUnsub = onValue(ref(this.opts.db, '.info/serverTimeOffset'), (snap) => {
        const v = snap.val();
        if (typeof v === 'number') this.serverOffset = v;
      });
    }
    if (this.connUnsub) return;
    this.connUnsub = onValue(ref(this.opts.db, '.info/connected'), (snap) => {
      const up = snap.val() === true;
      this.online.set(up);
      if (this.offlineTimer) {
        clearTimeout(this.offlineTimer);
        this.offlineTimer = null;
      }
      if (up) {
        this.offline.set(false);
        // onDisconnect muss nach JEDEM Neuverbinden erneut hinterlegt werden.
        const code = this.code;
        if (code) void this.announcePresence(code);
        // Waehrend der Trennung verpasste Aenderungen nachholen.
        void this.resync();
      } else {
        // Kurze Aussetzer nicht anzeigen – das SDK verbindet meist selbst neu.
        this.offlineTimer = setTimeout(() => this.offline.set(true), OFFLINE_GRACE);
      }
    });
  }

  private readonly onWake = (): void => {
    if (document.visibilityState === 'hidden') return;
    void this.resync();
  };

  private bindWakeups(): void {
    if (this.wakeupsBound) return;
    this.wakeupsBound = true;
    document.addEventListener('visibilitychange', this.onWake);
    window.addEventListener('online', this.onWake);
    window.addEventListener('focus', this.onWake);
  }

  private unbindWakeups(): void {
    if (!this.wakeupsBound) return;
    this.wakeupsBound = false;
    document.removeEventListener('visibilitychange', this.onWake);
    window.removeEventListener('online', this.onWake);
    window.removeEventListener('focus', this.onWake);
  }

  private markPending(on: boolean): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (!on) {
      this.pending.set(false);
      return;
    }
    this.pendingTimer = setTimeout(() => this.pending.set(true), PENDING_HINT_AFTER);
  }

  private clearTimers(): void {
    for (const t of [this.reattachTimer, this.offlineTimer, this.pendingTimer]) {
      if (t) clearTimeout(t);
    }
    this.reattachTimer = null;
    this.offlineTimer = null;
    this.pendingTimer = null;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private remember(code: string): void {
    try {
      localStorage.setItem(this.opts.activeKey, code);
    } catch {
      /* privater Modus o. Ae. – Fortsetzen ist dann eben nicht moeglich */
    }
  }

  private recall(): string | null {
    try {
      return localStorage.getItem(this.opts.activeKey);
    } catch {
      return null;
    }
  }

  private forget(): void {
    try {
      localStorage.removeItem(this.opts.activeKey);
    } catch {
      /* ignorieren */
    }
  }
}
