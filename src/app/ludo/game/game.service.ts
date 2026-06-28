import { Injectable, computed, signal } from '@angular/core';
import { ref, set, get, update, onValue, type Unsubscribe } from 'firebase/database';
import { authReady, db, databaseConfigured } from '../firebase/firebase';
import {
  GOAL_BASE,
  GOAL_LEN,
  HOME,
  PIECES,
  SEAT_START,
  TRACK_LEN,
  type LudoGame,
  type LudoMove,
  type LudoPlayer,
  type LudoPos,
} from './game.types';

const PLAYER_ID_KEY = 'ludo_player_id';
const PLAYER_NAME_KEY = 'ludo_player_name';
const PLAYER_EMOJI_KEY = 'ludo_player_emoji';
const CODE_ALPHABET = '0123456789';

export const AVATARS = ['🦄', '🐙', '🦈', '🐱', '🦖', '🐬', '🦊', '🐸', '🐧', '🦁'];

@Injectable({ providedIn: 'root' })
export class GameService {
  /** Aktueller Spielzustand aus der Realtime Database. */
  readonly game = signal<LudoGame | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly playerId = this.loadPlayerId();

  private gameUnsub: Unsubscribe | null = null;

  // ---- Abgeleitete Signale für die Oberfläche -----------------------------
  readonly me = computed<LudoPlayer | null>(() => this.game()?.players[this.playerId] ?? null);

  readonly opponent = computed<LudoPlayer | null>(() => {
    const g = this.game();
    if (!g) return null;
    return Object.values(g.players).find((p) => p.id !== this.playerId) ?? null;
  });

  readonly isMyTurn = computed<boolean>(() => {
    const g = this.game();
    return !!g && g.status === 'playing' && g.currentTurn === this.playerId;
  });

  /** Es wurde schon gewürfelt und ich darf jetzt eine Figur ziehen. */
  readonly mustMove = computed<boolean>(() => {
    return this.isMyTurn() && this.legalMoves().length > 0;
  });

  /** Gewürfelt, aber kein Zug möglich – die Zahl wird angezeigt, dann ausgesetzt. */
  readonly noMove = computed<boolean>(() => {
    const g = this.game();
    return this.isMyTurn() && !!g && g.dice !== null && this.legalMoves().length === 0;
  });

  /** Führt das Bestätigen einer nicht setzbaren Zahl zu einem erneuten Wurf? */
  readonly passRerolls = computed<boolean>(() => {
    const g = this.game();
    if (!g || g.dice === null) return false;
    if (g.dice === 6) return true; // eine 6 bringt immer einen neuen Wurf
    return g.rollsLeft > 1 && this.onlySixHelps(g, this.playerId);
  });

  readonly currentPlayer = computed<LudoPlayer | null>(() => {
    const g = this.game();
    return g ? g.players[g.currentTurn] ?? null : null;
  });

  /** Sitzplatz (0 = rot, 1 = blau) eines Spielers, oder -1. */
  seatOf(g: LudoGame, id: string): number {
    return g.order.indexOf(id);
  }

  /** Brettfeld (0..39) einer Figur auf der Laufbahn, sonst -1. */
  trackCell(g: LudoGame, id: string, pos: LudoPos): number {
    if (pos < 0 || pos >= TRACK_LEN) return -1;
    const start = SEAT_START[this.seatOf(g, id)] ?? 0;
    return (start + pos) % TRACK_LEN;
  }

  /** Die mit dem aktuellen Würfel legalen Züge des Spielers am Zug. */
  readonly legalMoves = computed<LudoMove[]>(() => {
    const g = this.game();
    if (!g || g.dice === null || g.currentTurn !== this.playerId) return [];
    return this.computeMoves(g, this.playerId, g.dice);
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
      const player: LudoPlayer = { id: this.playerId, name: name.trim() || 'Igrač', emoji };
      const state: LudoGame = {
        code,
        status: 'waiting',
        hostId: this.playerId,
        players: { [this.playerId]: player },
        order: [this.playerId],
        pieces: { [this.playerId]: this.freshPieces() },
        currentTurn: this.playerId,
        dice: null,
        rollsLeft: 3,
        winnerId: null,
        lastAction: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.withTimeout(set(ref(db, `ludo/games/${code}`), state));
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
      const snap = await this.withTimeout(get(ref(db, `ludo/games/${code}`)));
      if (!snap.exists()) {
        throw new Error('Nema igre s ovim kodom.');
      }
      const state = this.normalize(snap.val() as LudoGame);
      if (!state.players[this.playerId]) {
        if (Object.keys(state.players).length >= 2) {
          throw new Error('Igra je već puna (2 igrača).');
        }
        state.players[this.playerId] = { id: this.playerId, name: name.trim() || 'Igrač', emoji };
        state.order = [...state.order, this.playerId];
        state.pieces[this.playerId] = this.freshPieces();
        // Beim Beitritt geht es los – der Host (Sitz 0) beginnt.
        state.status = 'playing';
        this.setTurn(state, state.order[0]);
        state.winnerId = null;
        state.lastAction = null;
        state.updatedAt = Date.now();
        await this.withTimeout(set(ref(db, `ludo/games/${code}`), state));
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
  /**
   * Würfeln. Die Augenzahl wird immer gespeichert und angezeigt – auch wenn
   * kein Zug möglich ist. Dann setzt der Spieler über `pass()` bewusst aus.
   */
  async roll(): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId) return;
    if (g.dice !== null) return; // es wurde schon gewürfelt

    const dice = 1 + Math.floor(Math.random() * 6);
    await update(ref(db, `ludo/games/${g.code}`), {
      dice,
      lastAction: { by: this.playerId, dice, at: Date.now() },
      updatedAt: Date.now(),
    });
  }

  /**
   * Bestätigt eine nicht setzbare Augenzahl. Eine 6 (oder ein weiterer Versuch
   * mit allen Figuren in der Garage) bringt einen neuen Wurf, sonst ist der
   * Gegner dran.
   */
  async pass(): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId || g.dice === null) return;
    // Nur erlaubt, wenn es wirklich keinen Zug gibt.
    if (this.computeMoves(g, this.playerId, g.dice).length > 0) return;

    const dice = g.dice;
    const next: LudoGame = { ...g };
    if (dice === 6) {
      // Eine 6 bringt immer einen neuen Wurf – auch wenn sie nicht setzbar war.
      next.dice = null;
      next.rollsLeft = 1;
    } else if (g.rollsLeft > 1 && this.onlySixHelps(g, this.playerId)) {
      // Nur eine 6 könnte helfen → bis zu drei Versuche, eine 6 zu würfeln.
      next.dice = null;
      next.rollsLeft = g.rollsLeft - 1;
    } else {
      // Weitergeben an den Gegner.
      this.setTurn(next, this.otherId(g, this.playerId) ?? this.playerId);
    }

    await update(ref(db, `ludo/games/${g.code}`), {
      currentTurn: next.currentTurn,
      dice: next.dice,
      rollsLeft: next.rollsLeft,
      updatedAt: Date.now(),
    });
  }

  /** Bewegt die gewählte Figur gemäß dem aktuellen Würfel. */
  async move(pieceIndex: number): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId || g.dice === null) return;

    const dice = g.dice;
    const moves = this.computeMoves(g, this.playerId, dice);
    const chosen = moves.find((m) => m.pieceIndex === pieceIndex);
    if (!chosen) return;

    const pieces: Record<string, LudoPos[]> = {};
    for (const id of Object.keys(g.pieces)) pieces[id] = [...g.pieces[id]];

    // Schlagen: liegt eine gegnerische Figur auf dem Zielfeld der Laufbahn?
    let captured = false;
    if (chosen.to < TRACK_LEN) {
      const targetCell = this.trackCell(g, this.playerId, chosen.to);
      const oppId = this.otherId(g, this.playerId);
      if (oppId) {
        const oppPieces = pieces[oppId];
        for (let i = 0; i < oppPieces.length; i++) {
          if (this.trackCell(g, oppId, oppPieces[i]) === targetCell) {
            oppPieces[i] = HOME; // zurück in die Garage
            captured = true;
          }
        }
      }
    }

    pieces[this.playerId][pieceIndex] = chosen.to;

    const next: LudoGame = { ...g, pieces };

    // Sieg: alle vier Figuren im Ziel.
    if (pieces[this.playerId].every((p) => p >= GOAL_BASE)) {
      await update(ref(db, `ludo/games/${g.code}`), {
        pieces,
        status: 'finished',
        winnerId: this.playerId,
        dice: null,
        lastAction: { by: this.playerId, dice, captured, at: Date.now() },
        updatedAt: Date.now(),
      });
      return;
    }

    // Eine 6 (oder ein erfolgreiches Schlagen mit 6) → nochmal derselbe Spieler.
    if (dice === 6) {
      this.setTurn(next, this.playerId);
    } else {
      this.setTurn(next, this.otherId(g, this.playerId) ?? this.playerId);
    }

    await update(ref(db, `ludo/games/${g.code}`), {
      pieces,
      currentTurn: next.currentTurn,
      dice: next.dice,
      rollsLeft: next.rollsLeft,
      lastAction: { by: this.playerId, dice, captured, at: Date.now() },
      updatedAt: Date.now(),
    });
  }

  /** Neue Runde – der Verlierer beginnt. */
  async playAgain(): Promise<void> {
    const g = this.game();
    if (!g) return;
    const pieces: Record<string, LudoPos[]> = {};
    for (const id of g.order) pieces[id] = this.freshPieces();
    const starter =
      g.winnerId && g.order.includes(g.winnerId)
        ? g.order.find((id) => id !== g.winnerId) ?? g.order[0]
        : g.order[0];
    const next: LudoGame = { ...g, pieces };
    this.setTurn(next, starter);
    await update(ref(db, `ludo/games/${g.code}`), {
      pieces,
      status: 'playing',
      winnerId: null,
      currentTurn: next.currentTurn,
      dice: next.dice,
      rollsLeft: next.rollsLeft,
      lastAction: null,
      updatedAt: Date.now(),
    });
  }

  leaveGame(): void {
    this.gameUnsub?.();
    this.gameUnsub = null;
    this.game.set(null);
  }

  // ---- Regel-Hilfen --------------------------------------------------------
  /** Alle legalen Züge des Spielers `id` mit Augenzahl `dice`. */
  computeMoves(g: LudoGame, id: string, dice: number): LudoMove[] {
    const moves: LudoMove[] = [];
    const mine = g.pieces[id] ?? [];

    for (let i = 0; i < mine.length; i++) {
      const pos = mine[i];

      if (pos === HOME) {
        // Aus der Garage nur mit einer 6 und auf das eigene Startfeld (pos 0).
        if (dice !== 6) continue;
        if (this.hasOwnPieceAt(g, id, 0)) continue; // eigenes Startfeld belegt
        moves.push({ pieceIndex: i, to: 0, captures: this.capturesAt(g, id, 0) });
        continue;
      }

      const to = pos + dice;
      if (to > GOAL_BASE + GOAL_LEN - 1) continue; // über das Ziel hinaus → ungültig
      if (this.hasOwnPieceAt(g, id, to)) continue; // eigene Figur blockiert

      moves.push({ pieceIndex: i, to, captures: this.capturesAt(g, id, to) });
    }
    return moves;
  }

  /** Liegt eine eigene Figur auf der Zielposition `to`? */
  private hasOwnPieceAt(g: LudoGame, id: string, to: LudoPos): boolean {
    const mine = g.pieces[id] ?? [];
    if (to < TRACK_LEN) {
      const cell = this.trackCell(g, id, to);
      return mine.some((p) => p < TRACK_LEN && this.trackCell(g, id, p) === cell);
    }
    // Zielhaus: exakt dieselbe Zielposition.
    return mine.some((p) => p === to);
  }

  /** Würde ein Zug auf `to` eine gegnerische Figur schlagen? (nur Laufbahn) */
  private capturesAt(g: LudoGame, id: string, to: LudoPos): boolean {
    if (to >= TRACK_LEN) return false;
    const cell = this.trackCell(g, id, to);
    const oppId = this.otherId(g, id);
    if (!oppId) return false;
    return (g.pieces[oppId] ?? []).some(
      (p) => p < TRACK_LEN && this.trackCell(g, oppId, p) === cell,
    );
  }

  /**
   * Darf der Spieler bis zu drei Mal würfeln? Das gilt, wenn er nur noch mit
   * einer 6 ziehen könnte: mindestens eine Figur steht in der Garage und mit
   * keiner Augenzahl 1–5 ist ein Zug möglich (z. B. die übrigen Figuren sitzen
   * fest im Ziel). Wie zu Spielbeginn, wenn alle Figuren in der Garage stehen.
   */
  private onlySixHelps(g: LudoGame, id: string): boolean {
    const hasGaragePiece = (g.pieces[id] ?? []).some((p) => p === HOME);
    if (!hasGaragePiece) return false;
    for (let v = 1; v <= 5; v++) {
      if (this.computeMoves(g, id, v).length > 0) return false;
    }
    return true;
  }

  // ---- Intern --------------------------------------------------------------
  private subscribe(code: string): void {
    this.gameUnsub?.();
    const gameRef = ref(db, `ludo/games/${code}`);
    this.gameUnsub = onValue(
      gameRef,
      (snap) => {
        const raw = snap.val() as LudoGame | null;
        this.game.set(raw ? this.normalize(raw) : null);
      },
      (err) => this.error.set(this.toMessage(err)),
    );
  }

  /** Setzt den Spieler am Zug, Würfel zurück, Wurfanzahl je nach Garage. */
  private setTurn(state: LudoGame, playerId: string): void {
    state.currentTurn = playerId;
    state.dice = null;
    state.rollsLeft = this.onlySixHelps(state, playerId) ? 3 : 1;
  }

  private freshPieces(): LudoPos[] {
    return Array.from({ length: PIECES }, () => HOME);
  }

  /**
   * Firebase speichert keine leeren/teils gesetzten Arrays sauber – beim
   * Einlesen auffüllen, damit die Oberfläche nie auf "undefined" zugreift.
   */
  private normalize(g: LudoGame): LudoGame {
    const order = g.order ?? [];
    const players = g.players ?? {};
    const pieces: Record<string, LudoPos[]> = {};
    for (const id of Object.keys(players)) {
      const arr = g.pieces?.[id] ?? [];
      pieces[id] = Array.from({ length: PIECES }, (_, i) =>
        typeof arr[i] === 'number' ? arr[i] : HOME,
      );
    }
    return {
      ...g,
      order,
      players,
      pieces,
      dice: g.dice ?? null,
      rollsLeft: g.rollsLeft ?? 1,
      winnerId: g.winnerId ?? null,
      lastAction: g.lastAction ?? null,
    };
  }

  private otherId(g: LudoGame, id: string): string | null {
    return g.order.find((x) => x !== id) ?? null;
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = this.randomCode();
      const snap = await this.withTimeout(get(ref(db, `ludo/games/${code}`)));
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
      return 'Keine Verbindung zur Datenbank. Sind die Datenbank-Regeln für "ludo" gesetzt?';
    }
    return raw;
  }
}
