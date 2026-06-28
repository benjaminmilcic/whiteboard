import { Injectable, computed, signal } from '@angular/core';
import { ref, set, get, update, onValue, type Unsubscribe } from 'firebase/database';
import { authReady, db, databaseConfigured } from '../firebase/firebase';
import {
  ADJACENCY,
  MILLS,
  PIECES,
  POINTS_COUNT,
  type MillGame,
  type MillPlayer,
} from './game.types';

const PLAYER_ID_KEY = 'mill_player_id';
const PLAYER_NAME_KEY = 'mill_player_name';
const PLAYER_EMOJI_KEY = 'mill_player_emoji';
const CODE_ALPHABET = '0123456789';

export const AVATARS = ['🦄', '🐙', '🦈', '🐱', '🦖', '🐬', '🦊', '🐸', '🐧', '🦁'];

@Injectable({ providedIn: 'root' })
export class GameService {
  readonly game = signal<MillGame | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly playerId = this.loadPlayerId();

  private gameUnsub: Unsubscribe | null = null;

  // ---- Abgeleitete Signale für die Oberfläche -----------------------------
  readonly me = computed<MillPlayer | null>(() => this.game()?.players[this.playerId] ?? null);

  readonly opponent = computed<MillPlayer | null>(() => {
    const g = this.game();
    if (!g) return null;
    return Object.values(g.players).find((p) => p.id !== this.playerId) ?? null;
  });

  readonly isMyTurn = computed<boolean>(() => {
    const g = this.game();
    return !!g && g.status === 'playing' && g.currentTurn === this.playerId;
  });

  readonly currentPlayer = computed<MillPlayer | null>(() => {
    const g = this.game();
    return g ? g.players[g.currentTurn] ?? null : null;
  });

  /** Mein Sitzplatz (0/1) bzw. -1. */
  readonly mySeat = computed<number>(() => {
    const g = this.game();
    return g ? g.order.indexOf(this.playerId) : -1;
  });

  /** Globale Phase: 'place' solange noch nicht beide alle 9 Steine gesetzt haben. */
  readonly phase = computed<'place' | 'move'>(() => {
    const g = this.game();
    if (!g) return 'place';
    return g.placed.some((n) => n < PIECES) ? 'place' : 'move';
  });

  /** Ich habe eine Mühle geschlossen und muss einen Stein wegnehmen. */
  readonly removing = computed<boolean>(() => !!this.game()?.removing && this.isMyTurn());

  /** Noch zu setzende Steine je Sitzplatz. */
  readonly toPlace = computed<number[]>(() => {
    const g = this.game();
    if (!g) return [0, 0];
    return [PIECES - (g.placed[0] ?? 0), PIECES - (g.placed[1] ?? 0)];
  });

  /** Wegnehmbare gegnerische Steine (nur während `removing`). */
  readonly removableSet = computed<Set<number>>(() => {
    const g = this.game();
    if (!g || !this.removing()) return new Set();
    return new Set(this.removable(g.board, 1 - this.mySeat()));
  });

  // ---- Spieler-Identität ---------------------------------------------------
  get savedName(): string {
    return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
  }
  get savedEmoji(): string {
    return localStorage.getItem(PLAYER_EMOJI_KEY) ?? '';
  }

  private rememberProfile(name: string, emoji: string): void {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(PLAYER_NAME_KEY, trimmed);
    if (emoji) localStorage.setItem(PLAYER_EMOJI_KEY, emoji);
  }

  private loadPlayerId(): string {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = 'p_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  }

  // ---- Spiel erstellen / beitreten ----------------------------------------
  async createGame(name: string, emoji: string): Promise<string> {
    this.rememberProfile(name, emoji);
    this.busy.set(true);
    this.error.set(null);
    try {
      this.assertConfig();
      await authReady;
      const code = await this.uniqueCode();
      const player: MillPlayer = { id: this.playerId, name: name.trim() || 'Igrač', emoji };
      const state: MillGame = {
        code,
        status: 'waiting',
        hostId: this.playerId,
        players: { [this.playerId]: player },
        order: [this.playerId],
        board: Array.from({ length: POINTS_COUNT }, () => -1),
        placed: [0, 0],
        currentTurn: this.playerId,
        removing: false,
        winnerId: null,
        lastAction: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.withTimeout(set(ref(db, `mill/games/${code}`), state));
      this.subscribe(code);
      return code;
    } catch (e) {
      this.error.set(this.toMessage(e));
      throw e;
    } finally {
      this.busy.set(false);
    }
  }

  async joinGame(rawCode: string, name: string, emoji: string): Promise<void> {
    const code = rawCode.trim();
    this.rememberProfile(name, emoji);
    this.busy.set(true);
    this.error.set(null);
    try {
      this.assertConfig();
      await authReady;
      const snap = await this.withTimeout(get(ref(db, `mill/games/${code}`)));
      if (!snap.exists()) {
        throw new Error('Nema igre s ovim kodom.');
      }
      const state = this.normalize(snap.val() as MillGame);
      if (!state.players[this.playerId]) {
        if (Object.keys(state.players).length >= 2) {
          throw new Error('Igra je već puna (2 igrača).');
        }
        state.players[this.playerId] = { id: this.playerId, name: name.trim() || 'Igrač', emoji };
        state.order = [...state.order, this.playerId];
        // Beim Beitritt geht es los – der Host (Sitz 0) beginnt.
        state.status = 'playing';
        state.currentTurn = state.order[0];
        state.board = Array.from({ length: POINTS_COUNT }, () => -1);
        state.placed = [0, 0];
        state.removing = false;
        state.winnerId = null;
        state.lastAction = null;
        state.updatedAt = Date.now();
        await this.withTimeout(set(ref(db, `mill/games/${code}`), state));
      }
      this.subscribe(code);
    } catch (e) {
      this.error.set(this.toMessage(e));
      throw e;
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Spielzüge -----------------------------------------------------------
  /** Setzt in der Setzphase einen Stein auf ein leeres Feld. */
  async place(index: number): Promise<void> {
    const g = this.game();
    const seat = this.mySeat();
    if (!g || !this.isMyTurn() || g.removing) return;
    if (this.phase() !== 'place' || (g.placed[seat] ?? 0) >= PIECES) return;
    if (g.board[index] !== -1) return;

    const board = [...g.board];
    board[index] = seat;
    const placed = [...g.placed];
    placed[seat] = (placed[seat] ?? 0) + 1;

    await this.finishAction(g, board, placed, index, 'place', seat);
  }

  /** Zieht in der Zugphase einen eigenen Stein auf ein gültiges Zielfeld. */
  async move(from: number, to: number): Promise<void> {
    const g = this.game();
    const seat = this.mySeat();
    if (!g || !this.isMyTurn() || g.removing) return;
    if (this.phase() !== 'move') return;
    if (g.board[from] !== seat || g.board[to] !== -1) return;
    if (!this.targetsFor(g, from).includes(to)) return;

    const board = [...g.board];
    board[from] = -1;
    board[to] = seat;

    await this.finishAction(g, board, [...g.placed], to, 'move', seat);
  }

  /** Nimmt – nach geschlossener Mühle – einen gegnerischen Stein weg. */
  async removePiece(index: number): Promise<void> {
    const g = this.game();
    const seat = this.mySeat();
    if (!g || !this.isMyTurn() || !g.removing) return;
    if (!this.removableSet().has(index)) return;

    const board = [...g.board];
    board[index] = -1;

    const next: MillGame = {
      ...g,
      board,
      removing: false,
      currentTurn: this.otherId(g, this.playerId) ?? this.playerId,
      lastAction: { by: this.playerId, type: 'remove', at_field: index, at: Date.now() },
      updatedAt: Date.now(),
    };
    this.applyWinCheck(next);
    await this.writeState(g.code, next);
  }

  async playAgain(): Promise<void> {
    const g = this.game();
    if (!g) return;
    // Verlierer beginnt die neue Partie.
    const starter =
      g.winnerId && g.order.includes(g.winnerId)
        ? g.order.find((id) => id !== g.winnerId) ?? g.order[0]
        : g.order[0];
    const next: MillGame = {
      ...g,
      board: Array.from({ length: POINTS_COUNT }, () => -1),
      placed: [0, 0],
      currentTurn: starter,
      removing: false,
      status: 'playing',
      winnerId: null,
      lastAction: null,
      updatedAt: Date.now(),
    };
    await this.writeState(g.code, next);
  }

  leaveGame(): void {
    this.gameUnsub?.();
    this.gameUnsub = null;
    this.game.set(null);
  }

  // ---- Regel-Hilfen (öffentlich für die Oberfläche) -----------------------
  /** Gültige Zielfelder eines eigenen Steins in der Zugphase. */
  targetsFor(g: MillGame, from: number): number[] {
    const seat = g.board[from];
    if (seat < 0) return [];
    // „Fliegen": mit nur noch 3 Steinen darf man auf jedes freie Feld springen.
    if (this.count(g.board, seat) === 3) {
      const free: number[] = [];
      for (let i = 0; i < POINTS_COUNT; i++) if (g.board[i] === -1) free.push(i);
      return free;
    }
    return ADJACENCY[from].filter((n) => g.board[n] === -1);
  }

  /** Kann der eigene Stein auf `index` (in der Zugphase) überhaupt ziehen? */
  canSelect(index: number): boolean {
    const g = this.game();
    if (!g || !this.isMyTurn() || g.removing || this.phase() !== 'move') return false;
    if (g.board[index] !== this.mySeat()) return false;
    return this.targetsFor(g, index).length > 0;
  }

  // ---- Intern --------------------------------------------------------------
  /** Gemeinsamer Abschluss von Setzen/Ziehen: Mühle prüfen, sonst Zug abgeben. */
  private async finishAction(
    g: MillGame,
    board: number[],
    placed: number[],
    field: number,
    type: 'place' | 'move',
    seat: number,
  ): Promise<void> {
    const oppSeat = 1 - seat;
    const mill = this.formsMill(board, field, seat);
    const canRemove = mill && this.removable(board, oppSeat).length > 0;

    const next: MillGame = {
      ...g,
      board,
      placed,
      lastAction: { by: this.playerId, type, at_field: field, mill, at: Date.now() },
      updatedAt: Date.now(),
    };

    if (canRemove) {
      // Mühle geschlossen → derselbe Spieler nimmt einen Stein weg.
      next.removing = true;
    } else {
      next.removing = false;
      next.currentTurn = this.otherId(g, this.playerId) ?? this.playerId;
      this.applyWinCheck(next);
    }
    await this.writeState(g.code, next);
  }

  /** Prüft, ob der Spieler am Zug (currentTurn) verloren hat. */
  private applyWinCheck(next: MillGame): void {
    const loserSeat = next.order.indexOf(next.currentTurn);
    if (loserSeat < 0) return;
    // Verluste gelten erst in der Zugphase: zu wenige Steine oder kein Zug.
    const stillPlacing = (next.placed[loserSeat] ?? 0) < PIECES;
    if (stillPlacing) return;
    const cnt = this.count(next.board, loserSeat);
    const blocked = cnt < 3 || !this.hasAnyMove(next, loserSeat);
    if (blocked) {
      next.status = 'finished';
      next.winnerId = next.order[1 - loserSeat] ?? this.playerId;
      next.removing = false;
    }
  }

  private hasAnyMove(g: MillGame, seat: number): boolean {
    const cnt = this.count(g.board, seat);
    if (cnt < 3) return false;
    if (cnt === 3) return g.board.some((c) => c === -1); // Fliegen
    for (let i = 0; i < POINTS_COUNT; i++) {
      if (g.board[i] === seat && ADJACENCY[i].some((n) => g.board[n] === -1)) return true;
    }
    return false;
  }

  private formsMill(board: number[], field: number, seat: number): boolean {
    return MILLS.some((m) => m.includes(field) && m.every((x) => board[x] === seat));
  }

  private isInMill(board: number[], field: number, seat: number): boolean {
    return MILLS.some((m) => m.includes(field) && m.every((x) => board[x] === seat));
  }

  /** Wegnehmbare Steine des Gegners: solche außerhalb einer Mühle – sind alle
   * in Mühlen, darf jeder genommen werden. */
  private removable(board: number[], oppSeat: number): number[] {
    const opp: number[] = [];
    for (let i = 0; i < POINTS_COUNT; i++) if (board[i] === oppSeat) opp.push(i);
    const free = opp.filter((i) => !this.isInMill(board, i, oppSeat));
    return free.length > 0 ? free : opp;
  }

  private count(board: number[], seat: number): number {
    let n = 0;
    for (const c of board) if (c === seat) n++;
    return n;
  }

  private async writeState(code: string, next: MillGame): Promise<void> {
    await update(ref(db, `mill/games/${code}`), {
      board: next.board,
      placed: next.placed,
      currentTurn: next.currentTurn,
      removing: next.removing,
      status: next.status,
      winnerId: next.winnerId,
      lastAction: next.lastAction,
      updatedAt: next.updatedAt,
    });
  }

  private subscribe(code: string): void {
    this.gameUnsub?.();
    const gameRef = ref(db, `mill/games/${code}`);
    this.gameUnsub = onValue(
      gameRef,
      (snap) => {
        const raw = snap.val() as MillGame | null;
        this.game.set(raw ? this.normalize(raw) : null);
      },
      (err) => this.error.set(this.toMessage(err)),
    );
  }

  /** Firebase liefert Arrays/Defaults nicht immer sauber – beim Lesen ergänzen. */
  private normalize(g: MillGame): MillGame {
    const board = Array.from({ length: POINTS_COUNT }, (_, i) =>
      typeof g.board?.[i] === 'number' ? g.board[i] : -1,
    );
    const placed = [Number(g.placed?.[0] ?? 0), Number(g.placed?.[1] ?? 0)];
    return {
      ...g,
      order: g.order ?? [],
      players: g.players ?? {},
      board,
      placed,
      removing: !!g.removing,
      winnerId: g.winnerId ?? null,
      lastAction: g.lastAction ?? null,
    };
  }

  private otherId(g: MillGame, id: string): string | null {
    return g.order.find((x) => x !== id) ?? null;
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = this.randomCode();
      const snap = await this.withTimeout(get(ref(db, `mill/games/${code}`)));
      if (!snap.exists()) return code;
    }
    return this.randomCode();
  }

  private randomCode(): string {
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return s;
  }

  private assertConfig(): void {
    if (!databaseConfigured) {
      throw new Error(
        'Firebase ist noch nicht fertig eingerichtet: In ' +
          'src/app/shared/firebase-config.ts fehlt die gültige "databaseURL".',
      );
    }
  }

  private withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error('Zeitüberschreitung: Die Datenbank antwortet nicht.')),
          ms,
        ),
      ),
    ]);
  }

  private toMessage(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes('PERMISSION_DENIED')) {
      return 'Keine Verbindung zur Datenbank. Sind die Datenbank-Regeln für "mill" gesetzt?';
    }
    return raw;
  }
}
