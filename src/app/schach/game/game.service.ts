import { Injectable, computed, signal } from '@angular/core';
import { ref, set, get, update, onValue, type Unsubscribe } from 'firebase/database';
import { db, databaseConfigured } from '../firebase/firebase';
import type { ChessColor, ChessGame, ChessMove, ChessPlayer } from './game.types';

const PLAYER_ID_KEY = 'schach_player_id';
const PLAYER_NAME_KEY = 'schach_player_name';
const PLAYER_EMOJI_KEY = 'schach_player_emoji';
const CODE_ALPHABET = '0123456789';

export const SIZE = 8;
export const AVATARS = ['🦄', '🐙', '🦈', '🐱', '🦖', '🐬', '🦊', '🐸', '🐧', '🦁'];

type Dir = [number, number];
const KNIGHT: Dir[] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
];
const DIAG: Dir[] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO: Dir[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const AROUND: Dir[] = [...DIAG, ...ORTHO];

@Injectable({ providedIn: 'root' })
export class GameService {
  readonly game = signal<ChessGame | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly playerId = this.loadPlayerId();
  private gameUnsub: Unsubscribe | null = null;

  // ---- Abgeleitete Signale -------------------------------------------------
  readonly me = computed<ChessPlayer | null>(() => this.game()?.players[this.playerId] ?? null);

  readonly opponent = computed<ChessPlayer | null>(() => {
    const g = this.game();
    if (!g) return null;
    return Object.values(g.players).find((p) => p.id !== this.playerId) ?? null;
  });

  readonly isMyTurn = computed<boolean>(() => {
    const g = this.game();
    return !!g && g.status === 'playing' && g.currentTurn === this.playerId;
  });

  readonly currentPlayer = computed<ChessPlayer | null>(() => {
    const g = this.game();
    return g ? g.players[g.currentTurn] ?? null : null;
  });

  readonly myColor = computed<ChessColor | null>(() => this.me()?.color ?? null);

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
      const code = await this.uniqueCode();
      const player: ChessPlayer = { id: this.playerId, name: name.trim() || 'Spieler', emoji, color: 'white' };
      const state: ChessGame = {
        code,
        status: 'waiting',
        hostId: this.playerId,
        board: this.startBoard(),
        currentTurn: this.playerId,
        order: [this.playerId],
        players: { [this.playerId]: player },
        castling: 'KQkq',
        enPassant: null,
        check: false,
        winnerId: null,
        lastMove: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.withTimeout(set(ref(db, `schach/games/${code}`), state));
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
      const snap = await this.withTimeout(get(ref(db, `schach/games/${code}`)));
      if (!snap.exists()) throw new Error('Kein Spiel mit diesem Code gefunden.');
      const state = this.normalize(snap.val() as ChessGame);
      if (!state.players[this.playerId]) {
        if (Object.keys(state.players).length >= 2) {
          throw new Error('Dieses Spiel ist schon voll (2 Spieler).');
        }
        const taken = Object.values(state.players).map((p) => p.color);
        const color: ChessColor = taken.includes('white') ? 'black' : 'white';
        state.players[this.playerId] = { id: this.playerId, name: name.trim() || 'Spieler', emoji, color };
        state.order = [...state.order, this.playerId];
        state.status = 'playing';
        state.currentTurn = state.order[0]; // Weiß beginnt
        state.updatedAt = Date.now();
        await this.withTimeout(set(ref(db, `schach/games/${code}`), state));
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

    const legal = this.legalMoves(g.board, color, g.castling, g.enPassant);
    const mv = legal.find((m) => m.from === from && m.to === to);
    if (!mv) return;

    const board = this.applyToBoard(g.board, mv, color);
    const castling = this.updateCastling(g.castling, g.board, mv);
    const enPassant = this.newEnPassant(g.board, mv);

    const nextColor: ChessColor = color === 'white' ? 'black' : 'white';
    const nextLegal = this.legalMoves(board, nextColor, castling, enPassant);
    const nextInCheck = this.inCheck(board, nextColor);

    const patch: Partial<ChessGame> = {
      board,
      castling,
      enPassant,
      lastMove: { from, to },
      updatedAt: Date.now(),
    };

    if (nextLegal.length === 0) {
      patch.status = 'finished';
      patch.check = nextInCheck;
      patch.winnerId = nextInCheck ? this.playerId : 'draw'; // Matt bzw. Patt
    } else {
      patch.currentTurn = this.nextPlayer(g);
      patch.check = nextInCheck;
    }

    await update(ref(db, `schach/games/${g.code}`), patch);
  }

  async playAgain(): Promise<void> {
    const g = this.game();
    if (!g) return;
    const starter = g.order[0]; // Weiß beginnt erneut
    await update(ref(db, `schach/games/${g.code}`), {
      board: this.startBoard(),
      status: 'playing',
      currentTurn: starter,
      castling: 'KQkq',
      enPassant: null,
      check: false,
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
  legalSources(): number[] {
    const g = this.game();
    if (!g || !this.isMyTurn()) return [];
    const color = this.colorOf(this.playerId, g);
    if (!color) return [];
    const set = new Set<number>();
    for (const m of this.legalMoves(g.board, color, g.castling, g.enPassant)) set.add(m.from);
    return [...set];
  }

  targetsFrom(from: number): number[] {
    const g = this.game();
    if (!g) return [];
    const color = this.colorOf(this.playerId, g);
    if (!color) return [];
    return this.legalMoves(g.board, color, g.castling, g.enPassant)
      .filter((m) => m.from === from)
      .map((m) => m.to);
  }

  /** Feld des Königs einer Farbe (für die Schach-Markierung). */
  kingSquare(color: ChessColor): number {
    const g = this.game();
    if (!g) return -1;
    const k = color === 'white' ? 'K' : 'k';
    return g.board.indexOf(k);
  }

  // ---- Schach-Logik --------------------------------------------------------
  private startBoard(): string[] {
    const b = new Array<string>(64).fill('');
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let c = 0; c < 8; c++) {
      b[c] = back[c]; // Zeile 0: Schwarz
      b[8 + c] = 'p'; // Zeile 1: schwarze Bauern
      b[48 + c] = 'P'; // Zeile 6: weiße Bauern
      b[56 + c] = back[c].toUpperCase(); // Zeile 7: Weiß
    }
    return b;
  }

  private colorOfPiece(p: string): ChessColor | null {
    if (!p) return null;
    return p === p.toUpperCase() ? 'white' : 'black';
  }

  private inBounds(r: number, c: number): boolean {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  /** Pseudolegale Züge (ohne Schach-Prüfung) für eine Farbe. */
  private pseudoMoves(board: string[], color: ChessColor, castling: string, enPassant: number | null): ChessMove[] {
    const moves: ChessMove[] = [];
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (this.colorOfPiece(p) !== color) continue;
      const type = p.toLowerCase();
      const r = Math.floor(i / 8);
      const c = i % 8;
      if (type === 'p') this.pawnMoves(board, i, r, c, color, enPassant, moves);
      else if (type === 'n') this.stepMoves(board, i, r, c, color, KNIGHT, moves);
      else if (type === 'k') this.stepMoves(board, i, r, c, color, AROUND, moves);
      else if (type === 'b') this.slideMoves(board, i, r, c, color, DIAG, moves);
      else if (type === 'r') this.slideMoves(board, i, r, c, color, ORTHO, moves);
      else if (type === 'q') this.slideMoves(board, i, r, c, color, AROUND, moves);
    }
    this.castleMoves(board, color, castling, moves);
    return moves;
  }

  private pawnMoves(
    board: string[], i: number, r: number, c: number, color: ChessColor,
    enPassant: number | null, out: ChessMove[],
  ): void {
    const dir = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;
    const promoRow = color === 'white' ? 0 : 7;

    // ein Feld vor
    const r1 = r + dir;
    if (this.inBounds(r1, c) && board[r1 * 8 + c] === '') {
      out.push({ from: i, to: r1 * 8 + c, promo: r1 === promoRow });
      // zwei Felder vom Startfeld
      const r2 = r + 2 * dir;
      if (r === startRow && board[r2 * 8 + c] === '') {
        out.push({ from: i, to: r2 * 8 + c });
      }
    }
    // schlagen (inkl. En-passant)
    for (const dc of [-1, 1]) {
      const nr = r + dir;
      const nc = c + dc;
      if (!this.inBounds(nr, nc)) continue;
      const j = nr * 8 + nc;
      const target = board[j];
      if (target && this.colorOfPiece(target) !== color) {
        out.push({ from: i, to: j, promo: nr === promoRow });
      } else if (enPassant !== null && j === enPassant) {
        out.push({ from: i, to: j, enPassant: true });
      }
    }
  }

  private stepMoves(board: string[], i: number, r: number, c: number, color: ChessColor, dirs: Dir[], out: ChessMove[]): void {
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (!this.inBounds(nr, nc)) continue;
      const j = nr * 8 + nc;
      if (this.colorOfPiece(board[j]) !== color) out.push({ from: i, to: j });
    }
  }

  private slideMoves(board: string[], i: number, r: number, c: number, color: ChessColor, dirs: Dir[], out: ChessMove[]): void {
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (this.inBounds(nr, nc)) {
        const j = nr * 8 + nc;
        const occ = board[j];
        if (!occ) {
          out.push({ from: i, to: j });
        } else {
          if (this.colorOfPiece(occ) !== color) out.push({ from: i, to: j });
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }

  private castleMoves(board: string[], color: ChessColor, castling: string, out: ChessMove[]): void {
    const row = color === 'white' ? 7 : 0;
    const kingIdx = row * 8 + 4;
    const king = color === 'white' ? 'K' : 'k';
    if (board[kingIdx] !== king) return;
    const enemy: ChessColor = color === 'white' ? 'black' : 'white';
    if (this.isAttacked(board, kingIdx, enemy)) return; // nicht aus dem Schach rochieren

    const kRight = color === 'white' ? 'K' : 'k';
    const qRight = color === 'white' ? 'Q' : 'q';

    // kurze Rochade
    if (castling.includes(kRight)) {
      const f = row * 8 + 5;
      const gsq = row * 8 + 6;
      const rook = color === 'white' ? 'R' : 'r';
      if (board[f] === '' && board[gsq] === '' && board[row * 8 + 7] === rook &&
          !this.isAttacked(board, f, enemy) && !this.isAttacked(board, gsq, enemy)) {
        out.push({ from: kingIdx, to: gsq, castle: 'K' });
      }
    }
    // lange Rochade
    if (castling.includes(qRight)) {
      const d = row * 8 + 3;
      const cs = row * 8 + 2;
      const b = row * 8 + 1;
      const rook = color === 'white' ? 'R' : 'r';
      if (board[d] === '' && board[cs] === '' && board[b] === '' && board[row * 8 + 0] === rook &&
          !this.isAttacked(board, d, enemy) && !this.isAttacked(board, cs, enemy)) {
        out.push({ from: kingIdx, to: cs, castle: 'Q' });
      }
    }
  }

  /** Wird das Feld sq von Figuren der Farbe byColor angegriffen? */
  private isAttacked(board: string[], sq: number, byColor: ChessColor): boolean {
    const r = Math.floor(sq / 8);
    const c = sq % 8;
    const up = byColor === 'white'; // weiße Bauern stehen unterhalb und schlagen nach oben
    // Bauern
    const pawnRow = up ? r + 1 : r - 1;
    for (const dc of [-1, 1]) {
      if (this.inBounds(pawnRow, c + dc)) {
        const p = board[pawnRow * 8 + (c + dc)];
        if (p === (byColor === 'white' ? 'P' : 'p')) return true;
      }
    }
    // Springer
    for (const [dr, dc] of KNIGHT) {
      if (this.inBounds(r + dr, c + dc)) {
        const p = board[(r + dr) * 8 + (c + dc)];
        if (p === (byColor === 'white' ? 'N' : 'n')) return true;
      }
    }
    // König
    for (const [dr, dc] of AROUND) {
      if (this.inBounds(r + dr, c + dc)) {
        const p = board[(r + dr) * 8 + (c + dc)];
        if (p === (byColor === 'white' ? 'K' : 'k')) return true;
      }
    }
    // Läufer/Dame (diagonal) und Turm/Dame (gerade)
    const bishop = byColor === 'white' ? 'B' : 'b';
    const rook = byColor === 'white' ? 'R' : 'r';
    const queen = byColor === 'white' ? 'Q' : 'q';
    for (const [dr, dc] of DIAG) {
      if (this.scanHit(board, r, c, dr, dc, bishop, queen)) return true;
    }
    for (const [dr, dc] of ORTHO) {
      if (this.scanHit(board, r, c, dr, dc, rook, queen)) return true;
    }
    return false;
  }

  private scanHit(board: string[], r: number, c: number, dr: number, dc: number, a: string, b: string): boolean {
    let nr = r + dr;
    let nc = c + dc;
    while (this.inBounds(nr, nc)) {
      const p = board[nr * 8 + nc];
      if (p) return p === a || p === b;
      nr += dr;
      nc += dc;
    }
    return false;
  }

  private inCheck(board: string[], color: ChessColor): boolean {
    const king = color === 'white' ? 'K' : 'k';
    const sq = board.indexOf(king);
    if (sq < 0) return false;
    return this.isAttacked(board, sq, color === 'white' ? 'black' : 'white');
  }

  /** Wendet einen Zug auf eine Kopie des Bretts an (für Test & Ausführung). */
  private applyToBoard(board: string[], mv: ChessMove, color: ChessColor): string[] {
    const b = [...board];
    const p = b[mv.from];
    b[mv.from] = '';
    if (mv.enPassant) {
      const capRow = Math.floor(mv.from / 8);
      const capCol = mv.to % 8;
      b[capRow * 8 + capCol] = '';
    }
    b[mv.to] = mv.promo ? (color === 'white' ? 'Q' : 'q') : p;
    if (mv.castle) {
      const row = color === 'white' ? 7 : 0;
      if (mv.castle === 'K') {
        b[row * 8 + 5] = b[row * 8 + 7];
        b[row * 8 + 7] = '';
      } else {
        b[row * 8 + 3] = b[row * 8 + 0];
        b[row * 8 + 0] = '';
      }
    }
    return b;
  }

  private legalMoves(board: string[], color: ChessColor, castling: string, enPassant: number | null): ChessMove[] {
    const pseudo = this.pseudoMoves(board, color, castling, enPassant);
    return pseudo.filter((mv) => {
      const after = this.applyToBoard(board, mv, color);
      return !this.inCheck(after, color);
    });
  }

  private updateCastling(castling: string, board: string[], mv: ChessMove): string {
    let rights = castling.replace('-', '');
    const piece = board[mv.from];
    if (piece === 'K') rights = rights.replace('K', '').replace('Q', '');
    if (piece === 'k') rights = rights.replace('k', '').replace('q', '');
    const drop = (idx: number) => {
      if (idx === 63) rights = rights.replace('K', '');
      if (idx === 56) rights = rights.replace('Q', '');
      if (idx === 7) rights = rights.replace('k', '');
      if (idx === 0) rights = rights.replace('q', '');
    };
    drop(mv.from); // Turm zieht aus seiner Ecke
    drop(mv.to); // Turm in seiner Ecke geschlagen
    return rights || '-';
  }

  private newEnPassant(board: string[], mv: ChessMove): number | null {
    const piece = board[mv.from];
    if (piece !== 'P' && piece !== 'p') return null;
    if (Math.abs(mv.to - mv.from) === 16) return (mv.from + mv.to) / 2;
    return null;
  }

  private colorOf(id: string, g: ChessGame): ChessColor | null {
    return g.players[id]?.color ?? null;
  }

  private nextPlayer(g: ChessGame): string {
    const i = g.order.indexOf(g.currentTurn);
    return g.order[(i + 1) % g.order.length];
  }

  // ---- Intern --------------------------------------------------------------
  private subscribe(code: string): void {
    this.gameUnsub?.();
    const gameRef = ref(db, `schach/games/${code}`);
    this.gameUnsub = onValue(
      gameRef,
      (snap) => {
        const raw = snap.val() as ChessGame | null;
        this.game.set(raw ? this.normalize(raw) : null);
      },
      (err) => this.error.set(this.toMessage(err)),
    );
  }

  private normalize(g: ChessGame): ChessGame {
    return {
      ...g,
      order: g.order ?? [],
      players: g.players ?? {},
      board: Array.from({ length: 64 }, (_, i) => g.board?.[i] ?? ''),
      castling: g.castling ?? '-',
      enPassant: g.enPassant ?? null,
      check: g.check ?? false,
      winnerId: g.winnerId ?? null,
      lastMove: g.lastMove ?? null,
    };
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = this.randomCode();
      const snap = await this.withTimeout(get(ref(db, `schach/games/${code}`)));
      if (!snap.exists()) return code;
    }
    return this.randomCode();
  }

  private randomCode(): string {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return s;
  }

  private assertConfig(): void {
    if (!databaseConfigured) {
      throw new Error(
        'Firebase ist noch nicht fertig eingerichtet: In ' +
          'src/app/schach/firebase/firebase-config.ts fehlt die gültige "databaseURL".',
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
      return 'Keine Verbindung zur Datenbank. Sind die Datenbank-Regeln für "schach" gesetzt?';
    }
    return raw;
  }
}
