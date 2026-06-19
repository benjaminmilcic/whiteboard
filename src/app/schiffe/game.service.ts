import { Injectable, computed, signal } from '@angular/core';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config';
import {
  EXTRA_TURN_ON_HIT,
  FLEET,
  type Game,
  type PlacedShip,
  type PlayerState,
} from './models';

const STORAGE_KEY = 'sv-game-id';
const NAME_KEY = 'sv-player-name'; // gemerkter Spielername (muss nicht neu eingetippt werden)
const EMOJI_KEY = 'sv-player-emoji'; // gemerktes Spieler-Emoji
const CODE_CHARS = '0123456789'; // vierstelliger Zahlencode

@Injectable({ providedIn: 'root' })
export class GameService {
  private app!: FirebaseApp;
  private auth!: Auth;
  private db!: Firestore;
  private unsub: Unsubscribe | null = null;

  readonly uid = signal<string | null>(null);
  readonly game = signal<Game | null>(null);
  readonly gameId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  /** Steuert den kindgerechten Bestätigungs-Dialog. Die *Key-Felder sind
   *  Übersetzungs-Schlüssel, die im Template per Transloco übersetzt werden. */
  readonly confirmDialog = signal<{
    emoji: string;
    titleKey: string;
    messageKey: string;
    yesKey: string;
    noKey: string;
    onYes: () => void;
  } | null>(null);

  // ---- Abgeleitete Zustände ------------------------------------------

  readonly opponentId = computed<string | null>(() => {
    const g = this.game();
    const me = this.uid();
    if (!g || !me) return null;
    return me === g.hostId ? g.guestId : g.hostId;
  });

  readonly me = computed<PlayerState | null>(() => {
    const g = this.game();
    const id = this.uid();
    return g && id ? g.players[id] ?? null : null;
  });

  readonly opponent = computed<PlayerState | null>(() => {
    const g = this.game();
    const id = this.opponentId();
    return g && id ? g.players[id] ?? null : null;
  });

  readonly isMyTurn = computed(
    () => !!this.game() && this.game()!.turn === this.uid(),
  );

  readonly amWinner = computed(
    () => !!this.game()?.winner && this.game()!.winner === this.uid(),
  );

  // ---- Spieler-Profil (gemerkt im localStorage) ----------------------

  /** Zuletzt verwendeter Name – damit man ihn nicht neu eintippen muss. */
  get savedName(): string {
    return localStorage.getItem(NAME_KEY) ?? '';
  }
  /** Zuletzt verwendetes Emoji (leer = Standard nehmen). */
  get savedEmoji(): string {
    return localStorage.getItem(EMOJI_KEY) ?? '';
  }

  private rememberProfile(name: string, emoji: string): void {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
    if (emoji) localStorage.setItem(EMOJI_KEY, emoji);
  }

  // ---- Initialisierung -----------------------------------------------

  async init(): Promise<void> {
    if (this.app) return;
    try {
      // Eigene, benannte Firebase-App, damit sie nicht mit der
      // @angular/fire-Standard-App des Whiteboards kollidiert.
      this.app = getApps().some((a) => a.name === 'schiffe')
        ? getApp('schiffe')
        : initializeApp(firebaseConfig, 'schiffe');
      this.auth = getAuth(this.app);
      this.db = getFirestore(this.app);

      await new Promise<void>((resolve) => {
        onAuthStateChanged(this.auth, (user) => {
          if (user) {
            this.uid.set(user.uid);
            resolve();
          }
        });
        signInAnonymously(this.auth).catch((e) => {
          this.error.set('Anmeldung fehlgeschlagen: ' + e.message);
          resolve();
        });
      });

      // Falls die Seite neu geladen wurde: altes Spiel wieder verbinden
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && this.uid()) {
        const snap = await getDoc(doc(this.db, 'games', saved));
        if (snap.exists() && (snap.data() as Game).players[this.uid()!]) {
          this.subscribe(saved);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e: any) {
      this.error.set('Firebase-Fehler: ' + (e?.message ?? e));
    }
  }

  // ---- Spiel erstellen / beitreten -----------------------------------

  async createGame(name: string, emoji: string): Promise<void> {
    const me = this.uid();
    if (!me) return;
    this.rememberProfile(name, emoji);
    this.busy.set(true);
    this.error.set(null);
    try {
      const code = this.makeCode();
      const game: Game = {
        code,
        status: 'waiting',
        hostId: me,
        guestId: null,
        players: { [me]: { name: name.trim() || 'Kapitän', emoji, ready: false } },
        fleets: {},
        shots: {},
        turn: null,
        winner: null,
        createdAt: Date.now(),
      };
      await setDoc(doc(this.db, 'games', code), game);
      this.subscribe(code);
    } catch (e: any) {
      this.error.set('Konnte Spiel nicht erstellen: ' + (e?.message ?? e));
    } finally {
      this.busy.set(false);
    }
  }

  async joinGame(rawCode: string, name: string, emoji: string): Promise<void> {
    const me = this.uid();
    if (!me) return;
    const code = rawCode.trim();
    if (code.length !== 4) {
      this.error.set('Der Code hat 4 Zahlen.');
      return;
    }
    this.rememberProfile(name, emoji);
    this.busy.set(true);
    this.error.set(null);
    try {
      const ref = doc(this.db, 'games', code);
      await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Dieses Spiel gibt es nicht.');
        const g = snap.data() as Game;

        // Schon Teil des Spiels? Dann einfach wieder verbinden.
        if (g.players[me]) return;

        if (g.guestId || g.status !== 'waiting') {
          throw new Error('Dieses Spiel ist schon voll.');
        }
        tx.update(ref, {
          guestId: me,
          status: 'setup',
          [`players.${me}`]: {
            name: name.trim() || 'Kapitän',
            emoji,
            ready: false,
          } as PlayerState,
        });
      });
      this.subscribe(code);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Beitreten fehlgeschlagen.');
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Schiffe platzieren --------------------------------------------

  async submitFleet(ships: PlacedShip[]): Promise<void> {
    const me = this.uid();
    const id = this.gameId();
    if (!me || !id) return;
    const ref = doc(this.db, 'games', id);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const g = snap.data() as Game;

      const ready = { ...g.players };
      ready[me] = { ...ready[me], ready: true };
      const bothReady =
        g.guestId &&
        ready[g.hostId]?.ready &&
        ready[g.guestId]?.ready;

      tx.update(ref, {
        [`fleets.${me}`]: ships,
        [`players.${me}.ready`]: true,
        ...(bothReady ? { status: 'battle', turn: g.hostId } : {}),
      });
    });
  }

  // ---- Schießen -------------------------------------------------------

  async shoot(x: number, y: number): Promise<void> {
    const me = this.uid();
    const id = this.gameId();
    if (!me || !id) return;
    const key = `${x},${y}`;
    const ref = doc(this.db, 'games', id);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const g = snap.data() as Game;

      if (g.status !== 'battle' || g.turn !== me) return;
      const oppId = me === g.hostId ? g.guestId : g.hostId;
      if (!oppId) return;

      const myShots = { ...(g.shots[me] ?? {}) };
      if (myShots[key]) return; // schon beschossen

      const oppFleet = g.fleets[oppId] ?? [];
      const isHit = oppFleet.some((ship) => ship.cells.includes(key));
      myShots[key] = isHit ? 'hit' : 'miss';

      // Sind ALLE gegnerischen Schiffsfelder getroffen?
      const allCells = oppFleet.flatMap((s) => s.cells);
      const allSunk =
        allCells.length > 0 && allCells.every((c) => myShots[c] === 'hit');

      const update: Record<string, any> = { [`shots.${me}`]: myShots };
      if (allSunk) {
        update['status'] = 'finished';
        update['winner'] = me;
        update['turn'] = null;
      } else if (isHit && EXTRA_TURN_ON_HIT) {
        update['turn'] = me; // Treffer -> nochmal
      } else {
        update['turn'] = oppId;
      }
      tx.update(ref, update);
    });
  }

  // ---- Nochmal spielen ------------------------------------------------

  async rematch(): Promise<void> {
    const id = this.gameId();
    if (!id) return;
    const ref = doc(this.db, 'games', id);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const g = snap.data() as Game;
      const players = { ...g.players };
      for (const k of Object.keys(players)) {
        players[k] = { ...players[k], ready: false };
      }
      tx.update(ref, {
        status: 'setup',
        players,
        fleets: {},
        shots: {},
        turn: null,
        winner: null,
      });
    });
  }

  /** Öffnet den Abbrechen-Dialog (statt window.confirm). */
  askLeave(): void {
    this.confirmDialog.set({
      emoji: '🚪',
      titleKey: 'confirm.leaveTitle',
      messageKey: 'confirm.leaveMessage',
      yesKey: 'confirm.leaveYes',
      noKey: 'confirm.leaveNo',
      onYes: () => this.leaveGame(),
    });
  }

  confirmYes(): void {
    const dialog = this.confirmDialog();
    this.confirmDialog.set(null);
    dialog?.onYes();
  }

  confirmNo(): void {
    this.confirmDialog.set(null);
  }

  leaveGame(): void {
    this.unsub?.();
    this.unsub = null;
    this.game.set(null);
    this.gameId.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  // ---- intern ---------------------------------------------------------

  private subscribe(id: string): void {
    this.unsub?.();
    this.gameId.set(id);
    localStorage.setItem(STORAGE_KEY, id);
    this.unsub = onSnapshot(doc(this.db, 'games', id), (snap) => {
      this.game.set(snap.exists() ? (snap.data() as Game) : null);
    });
  }

  private makeCode(): string {
    let c = '';
    for (let i = 0; i < 4; i++) {
      c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return c;
  }
}

// Kleine Hilfsfunktion (auch in Komponenten genutzt)
export function fleetTotalCells(): number {
  return FLEET.reduce((n, s) => n + s.size, 0);
}
