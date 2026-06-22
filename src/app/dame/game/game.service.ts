import { Injectable, computed, signal } from '@angular/core';
import { ref, set, get, update, onValue, type Unsubscribe } from 'firebase/database';
import { authReady, db, databaseConfigured } from '../firebase/firebase';
import type { DameColor, DameGame, DameMove, DamePlayer } from './game.types';

const PLAYER_ID_KEY = 'dame_player_id';
const PLAYER_NAME_KEY = 'dame_player_name';
const PLAYER_EMOJI_KEY = 'dame_player_emoji';
const CODE_ALPHABET = '0123456789'; // vierstelliger Zahlencode

export const SIZE = 8;
export const AVATARS = ['🦄', '🐙', '🦈', '🐱', '🦖', '🐬', '🦊', '🐸', '🐧', '🦁'];

type Dir = [number, number];
const KING_DIRS: Dir[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

@Injectable({ providedIn: 'root' })
export class GameService {
  readonly game = signal<DameGame | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly playerId = this.loadPlayerId();

  private gameUnsub: Unsubscribe | null = null;

  // ---- Abgeleitete Signale -------------------------------------------------
  readonly me = computed<DamePlayer | null>(() => this.game()?.players[this.playerId] ?? null);

  readonly opponent = computed<DamePlayer | null>(() => {
    const g = this.game();
    if (!g) return null;
    return Object.values(g.players).find((p) => p.id !== this.playerId) ?? null;
  });

  readonly isMyTurn = computed<boolean>(() => {
    const g = this.game();
    return !!g && g.status === 'playing' && g.currentTurn === this.playerId;
  });

  readonly currentPlayer = computed<DamePlayer | null>(() => {
    const g = this.game();
    return g ? g.players[g.currentTurn] ?? null : null;
  });

  readonly myColor = computed<DameColor | null>(() => this.me()?.color ?? null);

  /** Muss der Spieler an diesem Gerät gerade schlagen? */
  readonly mustCapture = computed<boolean>(() => {
    const g = this.game();
    if (!g || !this.isMyTurn()) return false;
    if (g.continueFrom !== null) return true;
    const color = this.myColor();
    return !!color && this.allCaptures(g.board, color).length > 0;
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
      const player: DamePlayer = { id: this.playerId, name: name.trim() || 'Spieler', emoji, color: 'white' };
      const state: DameGame = {
        code,
        status: 'waiting',
        hostId: this.playerId,
        board: this.startBoard(),
        currentTurn: this.playerId,
        continueFrom: null,
        order: [this.playerId],
        players: { [this.playerId]: player },
        winnerId: null,
        lastMove: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.withTimeout(set(ref(db, `dame/games/${code}`), state));
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
      const snap = await this.withTimeout(get(ref(db, `dame/games/${code}`)));
      if (!snap.exists()) {
        throw new Error('Kein Spiel mit diesem Code gefunden.');
      }
      const state = this.normalize(snap.val() as DameGame);
      if (!state.players[this.playerId]) {
        if (Object.keys(state.players).length >= 2) {
          throw new Error('Dieses Spiel ist schon voll (2 Spieler).');
        }
        const taken = Object.values(state.players).map((p) => p.color);
        const color: DameColor = taken.includes('white') ? 'black' : 'white';
        state.players[this.playerId] = { id: this.playerId, name: name.trim() || 'Spieler', emoji, color };
        state.order = [...state.order, this.playerId];
        state.status = 'playing';
        state.currentTurn = state.order[0]; // Host (weiß) beginnt
        state.updatedAt = Date.now();
        await this.withTimeout(set(ref(db, `dame/games/${code}`), state));
      }
      this.subscribe(code);
    } catch (e) {
      this.error.set(this.toMessage(e));
      throw e;
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Spielzug ------------------------------------------------------------
  async move(from: number, to: number): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId) return;
    const color = this.colorOf(this.playerId, g);
    if (!color) return;

    const legal = this.legalMoves(g.board, color, g.continueFrom);
    const mv = legal.find((m) => m.from === from && m.to === to);
    if (!mv) return;

    const board = [...g.board];
    const piece = board[from];
    board[from] = '';
    if (mv.captured !== null) board[mv.captured] = '';
    board[to] = piece;

    // Umwandlung zur Dame, wenn die letzte Reihe erreicht ist.
    let promoted = false;
    const row = Math.floor(to / SIZE);
    if (piece === 'w' && row === 0) {
      board[to] = 'W';
      promoted = true;
    } else if (piece === 'b' && row === SIZE - 1) {
      board[to] = 'B';
      promoted = true;
    }

    // Weiterschlagen mit demselben Stein?
    let continueFrom: number | null = null;
    if (mv.captured !== null && !promoted && this.captureMovesFrom(board, to).length > 0) {
      continueFrom = to;
    }

    const patch: Partial<DameGame> = {
      board,
      lastMove: { from, to },
      updatedAt: Date.now(),
    };

    if (continueFrom !== null) {
      // Gleicher Spieler bleibt dran und muss weiterschlagen.
      patch.continueFrom = continueFrom;
    } else {
      const nextColor: DameColor = color === 'white' ? 'black' : 'white';
      const nextHasMoves = this.legalMoves(board, nextColor, null).length > 0;
      patch.continueFrom = null;
      if (!nextHasMoves) {
        patch.status = 'finished';
        patch.winnerId = this.playerId;
      } else {
        patch.currentTurn = this.nextPlayer(g);
      }
    }

    await update(ref(db, `dame/games/${g.code}`), patch);
  }

  async playAgain(): Promise<void> {
    const g = this.game();
    if (!g) return;
    const starter =
      g.winnerId && g.order.includes(g.winnerId)
        ? g.order.find((id) => id !== g.winnerId) ?? g.order[0]
        : g.order[0];
    await update(ref(db, `dame/games/${g.code}`), {
      board: this.startBoard(),
      status: 'playing',
      currentTurn: starter,
      continueFrom: null,
      winnerId: null,
      lastMove: null,
      updatedAt: Date.now(),
    });
  }

  leaveGame(): void {
    this.gameUnsub?.();
    this.gameUnsub = null;
    this.game.set(null);
  }

  // ---- Hilfen für die Oberfläche ------------------------------------------
  /** Felder, von denen aus aktuell gezogen werden darf. */
  legalSources(): number[] {
    const g = this.game();
    if (!g || !this.isMyTurn()) return [];
    const color = this.colorOf(this.playerId, g);
    if (!color) return [];
    const set = new Set<number>();
    for (const m of this.legalMoves(g.board, color, g.continueFrom)) set.add(m.from);
    return [...set];
  }

  /** Mögliche Ziele für einen Stein von „from": Zielfeld → Zug. */
  targetsFrom(from: number): DameMove[] {
    const g = this.game();
    if (!g) return [];
    const color = this.colorOf(this.playerId, g);
    if (!color) return [];
    return this.legalMoves(g.board, color, g.continueFrom).filter((m) => m.from === from);
  }

  // ---- Regel-Logik ---------------------------------------------------------
  private startBoard(): string[] {
    const b = new Array<string>(SIZE * SIZE).fill('');
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if ((r + c) % 2 !== 1) continue; // nur dunkle Felder
        if (r < 3) b[r * SIZE + c] = 'b'; // Schwarz oben
        else if (r > 4) b[r * SIZE + c] = 'w'; // Weiß unten
      }
    }
    return b;
  }

  private cellColor(c: string): DameColor | null {
    if (!c) return null;
    return c.toLowerCase() === 'w' ? 'white' : 'black';
  }

  private isKing(c: string): boolean {
    return c === 'W' || c === 'B';
  }

  /** Bewegungsrichtungen eines Steins (Dame: alle 4, Mann: vorwärts). */
  private moveDirs(cell: string, color: DameColor): Dir[] {
    if (this.isKing(cell)) return KING_DIRS;
    return color === 'white'
      ? [
          [-1, -1],
          [-1, 1],
        ]
      : [
          [1, -1],
          [1, 1],
        ];
  }

  private inBounds(r: number, c: number): boolean {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  private simpleMovesFrom(board: string[], i: number): DameMove[] {
    const cell = board[i];
    const color = this.cellColor(cell);
    if (!color) return [];
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const king = this.isKing(cell);
    const moves: DameMove[] = [];
    for (const [dr, dc] of this.moveDirs(cell, color)) {
      // Dame gleitet beliebig weit, ein gewöhnlicher Stein nur ein Feld.
      let nr = r + dr;
      let nc = c + dc;
      while (this.inBounds(nr, nc) && board[nr * SIZE + nc] === '') {
        moves.push({ from: i, to: nr * SIZE + nc, captured: null });
        if (!king) break;
        nr += dr;
        nc += dc;
      }
    }
    return moves;
  }

  private captureMovesFrom(board: string[], i: number): DameMove[] {
    const cell = board[i];
    const color = this.cellColor(cell);
    if (!color) return [];
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const king = this.isKing(cell);
    const moves: DameMove[] = [];
    for (const [dr, dc] of this.moveDirs(cell, color)) {
      if (king) {
        // Erstes Feld mit einem Stein in dieser Richtung suchen.
        let sr = r + dr;
        let sc = c + dc;
        while (this.inBounds(sr, sc) && board[sr * SIZE + sc] === '') {
          sr += dr;
          sc += dc;
        }
        if (!this.inBounds(sr, sc)) continue;
        const mid = board[sr * SIZE + sc];
        if (this.cellColor(mid) === color) continue; // eigener Stein blockiert
        // Hinter dem Gegner alle freien Landefelder sammeln.
        let lr = sr + dr;
        let lc = sc + dc;
        while (this.inBounds(lr, lc) && board[lr * SIZE + lc] === '') {
          moves.push({ from: i, to: lr * SIZE + lc, captured: sr * SIZE + sc });
          lr += dr;
          lc += dc;
        }
      } else {
        const mr = r + dr;
        const mc = c + dc; // übersprungenes Feld
        const jr = r + 2 * dr;
        const jc = c + 2 * dc; // Landefeld
        if (!this.inBounds(jr, jc)) continue;
        const mid = board[mr * SIZE + mc];
        const land = board[jr * SIZE + jc];
        if (mid && this.cellColor(mid) !== color && land === '') {
          moves.push({ from: i, to: jr * SIZE + jc, captured: mr * SIZE + mc });
        }
      }
    }
    return moves;
  }

  private allCaptures(board: string[], color: DameColor): DameMove[] {
    const moves: DameMove[] = [];
    for (let i = 0; i < board.length; i++) {
      if (this.cellColor(board[i]) === color) moves.push(...this.captureMovesFrom(board, i));
    }
    return moves;
  }

  /** Alle erlaubten Züge (Schlagzwang: gibt es Schläge, sind nur diese erlaubt). */
  private legalMoves(board: string[], color: DameColor, continueFrom: number | null): DameMove[] {
    if (continueFrom !== null) return this.captureMovesFrom(board, continueFrom);
    const caps = this.allCaptures(board, color);
    if (caps.length > 0) return caps;
    const moves: DameMove[] = [];
    for (let i = 0; i < board.length; i++) {
      if (this.cellColor(board[i]) === color) moves.push(...this.simpleMovesFrom(board, i));
    }
    return moves;
  }

  private colorOf(id: string, g: DameGame): DameColor | null {
    return g.players[id]?.color ?? null;
  }

  private nextPlayer(g: DameGame): string {
    const i = g.order.indexOf(g.currentTurn);
    return g.order[(i + 1) % g.order.length];
  }

  // ---- Intern --------------------------------------------------------------
  private subscribe(code: string): void {
    this.gameUnsub?.();
    const gameRef = ref(db, `dame/games/${code}`);
    this.gameUnsub = onValue(
      gameRef,
      (snap) => {
        const raw = snap.val() as DameGame | null;
        this.game.set(raw ? this.normalize(raw) : null);
      },
      (err) => this.error.set(this.toMessage(err)),
    );
  }

  private normalize(g: DameGame): DameGame {
    return {
      ...g,
      order: g.order ?? [],
      players: g.players ?? {},
      board: Array.from({ length: SIZE * SIZE }, (_, i) => g.board?.[i] ?? ''),
      continueFrom: g.continueFrom ?? null,
      winnerId: g.winnerId ?? null,
      lastMove: g.lastMove ?? null,
    };
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = this.randomCode();
      const snap = await this.withTimeout(get(ref(db, `dame/games/${code}`)));
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
          'src/app/dame/firebase/firebase-config.ts fehlt die gültige "databaseURL".',
      );
    }
  }

  private withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Zeitüberschreitung: Die Datenbank antwortet nicht.')), ms),
      ),
    ]);
  }

  private toMessage(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes('PERMISSION_DENIED')) {
      return 'Keine Verbindung zur Datenbank. Sind die Datenbank-Regeln für "dame" gesetzt?';
    }
    return raw;
  }
}
