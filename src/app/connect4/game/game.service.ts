import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ref, set, get } from 'firebase/database';
import { authReady, db, databaseConfigured } from '../firebase/firebase';
import { GameChannel, withTimeout } from '../../shared/game-channel';
import type { C4Color, C4Game, C4Player } from './game.types';

const PLAYER_ID_KEY = 'c4_player_id';
const PLAYER_NAME_KEY = 'c4_player_name';
const PLAYER_EMOJI_KEY = 'c4_player_emoji';
/** Zuletzt geöffnetes Spiel – für die Rückkehr nach einem Neuladen. */
const ACTIVE_CODE_KEY = 'c4_active_code';
// Zeichen ohne leicht verwechselbare (kein I/O/0/1) – kindgerecht vorlesbar.
const CODE_ALPHABET = '0123456789';

export const COLS = 7;
export const ROWS = 6;
export const AVATARS = ['🦄', '🐙', '🦈', '🐱', '🦖', '🐬', '🦊', '🐸', '🐧', '🦁'];

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly i18n = inject(TranslocoService);

  readonly playerId = this.loadPlayerId();
  readonly busy = signal(false);

  /**
   * Verbindung zum Spielknoten: hält den Zustand aktuell, baut abgebrochene
   * Listener neu auf und schreibt Züge nur mit Server-Bestätigung.
   */
  private readonly channel = new GameChannel<C4Game>({
    db,
    configured: databaseConfigured,
    authReady,
    basePath: 'connect4/games',
    activeKey: ACTIVE_CODE_KEY,
    normalize: (raw) => this.normalize(raw as C4Game),
    canResume: (g) => !!g.players[this.playerId] && g.status !== 'finished',
    t: (key) => this.i18n.translate(key),
  });

  /** Aktueller Spielzustand aus der Realtime Database. */
  readonly game = this.channel.state;
  /** Meldung für die Oberfläche (Konfiguration, Verbindung, nicht gespeicherter Zug). */
  readonly error = this.channel.error;
  /** Verbindung ist länger weg – die Oberfläche zeigt einen Hinweis. */
  readonly offline = this.channel.offline;
  /** Ein Zug ist unterwegs und dauert auffällig lange. */
  readonly pending = this.channel.pending;

  /** Nach einem Neuladen zurück ins laufende Spiel. */
  resume(): Promise<boolean> {
    return this.channel.resume();
  }

  /** Stand von Hand neu vom Server holen (Knopf im Hinweisbalken). */
  resync(): Promise<void> {
    return this.channel.resync();
  }

  dismissError(): void {
    this.channel.dismissError();
  }

  // ---- Abgeleitete Signale für die Oberfläche -----------------------------
  readonly me = computed<C4Player | null>(() => this.game()?.players[this.playerId] ?? null);

  readonly opponent = computed<C4Player | null>(() => {
    const g = this.game();
    if (!g) return null;
    return Object.values(g.players).find((p) => p.id !== this.playerId) ?? null;
  });

  readonly isMyTurn = computed<boolean>(() => {
    const g = this.game();
    return !!g && g.status === 'playing' && g.currentTurn === this.playerId;
  });

  readonly currentPlayer = computed<C4Player | null>(() => {
    const g = this.game();
    return g ? g.players[g.currentTurn] ?? null : null;
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
      const player: C4Player = { id: this.playerId, name: name.trim() || 'Spieler', emoji, color: 'red' };
      const state: C4Game = {
        code,
        status: 'waiting',
        hostId: this.playerId,
        cols: COLS,
        rows: ROWS,
        board: this.emptyBoard(),
        currentTurn: this.playerId,
        order: [this.playerId],
        players: { [this.playerId]: player },
        winnerId: null,
        winningCells: null,
        lastMove: null,
        rev: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await withTimeout(set(ref(db, `connect4/games/${code}`), state));
      this.channel.open(code);
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
      const snap = await withTimeout(get(ref(db, `connect4/games/${code}`)));
      if (!snap.exists()) {
        throw new Error('Kein Spiel mit diesem Code gefunden.');
      }
      const state = this.normalize(snap.val() as C4Game);
      if (!state.players[this.playerId]) {
        if (Object.keys(state.players).length >= 2) {
          throw new Error('Dieses Spiel ist schon voll (2 Spieler).');
        }
        // freie Farbe wählen (Host ist rot → Gast ist gelb)
        const taken = Object.values(state.players).map((p) => p.color);
        const color: C4Color = taken.includes('red') ? 'yellow' : 'red';
        state.players[this.playerId] = { id: this.playerId, name: name.trim() || 'Spieler', emoji, color };
        state.order = [...state.order, this.playerId];
        state.status = 'playing';
        state.currentTurn = state.order[0]; // Host beginnt
        state.rev = (state.rev ?? 0) + 1;
        state.updatedAt = Date.now();
        await withTimeout(set(ref(db, `connect4/games/${code}`), state));
      }
      this.channel.open(code);
    } catch (e) {
      this.error.set(this.toMessage(e));
      throw e;
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Spielzug ------------------------------------------------------------
  /** Wirft einen Stein in die angegebene Spalte (0 … cols-1). */
  async drop(col: number): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing') return;
    if (g.currentTurn !== this.playerId) return;

    // Tiefste freie Zeile in dieser Spalte suchen (von unten nach oben).
    let target = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const i = r * COLS + col;
      if (!g.board[i]) {
        target = i;
        break;
      }
    }
    if (target < 0) return; // Spalte ist voll

    const board = [...g.board];
    board[target] = this.playerId;
    const winningCells = this.findWin(board, target, this.playerId);
    const full = board.every((c) => !!c);
    const next = this.nextPlayer(g);

    await this.channel.commit({
      board,
      lastMove: target,
      ...(winningCells
        ? { status: 'finished', winnerId: this.playerId, winningCells }
        : full
          ? { status: 'finished', winnerId: 'tie', winningCells: null }
          : { currentTurn: next }),
    });
  }

  /** Neue Runde – der Verlierer der letzten Runde beginnt (bei Gleichstand der Host). */
  async playAgain(): Promise<void> {
    const g = this.game();
    if (!g) return;
    const starter =
      g.winnerId && g.winnerId !== 'tie'
        ? g.order.find((id) => id !== g.winnerId) ?? g.order[0]
        : g.order[0];
    await this.channel.commit({
      board: this.emptyBoard(),
      status: 'playing',
      currentTurn: starter,
      winnerId: null,
      winningCells: null,
      lastMove: null,
    });
  }

  leaveGame(): void {
    this.channel.close();
  }

  // ---- Intern --------------------------------------------------------------
  /**
   * Firebase speichert keine leeren Arrays/Null-Werte sauber – beim Einlesen
   * ergänzen, damit die Oberfläche niemals auf "undefined" zugreift.
   */
  private normalize(g: C4Game): C4Game {
    const cols = g.cols || COLS;
    const rows = g.rows || ROWS;
    return {
      ...g,
      cols,
      rows,
      order: g.order ?? [],
      players: g.players ?? {},
      winnerId: g.winnerId ?? null,
      winningCells: g.winningCells ?? null,
      lastMove: g.lastMove ?? null,
      rev: g.rev ?? 0,
      board: Array.from({ length: rows * cols }, (_, i) => (g.board?.[i] ?? '') as string),
    };
  }

  /** Prüft, ob durch den letzten Stein vier in einer Reihe entstanden sind. */
  private findWin(board: string[], lastIndex: number, player: string): number[] | null {
    const r0 = Math.floor(lastIndex / COLS);
    const c0 = lastIndex % COLS;
    // Richtungen: waagrecht, senkrecht, beide Diagonalen.
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (const [dr, dc] of dirs) {
      const line = [lastIndex];
      // in eine Richtung
      let r = r0 + dr;
      let c = c0 + dc;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === player) {
        line.push(r * COLS + c);
        r += dr;
        c += dc;
      }
      // in die Gegenrichtung
      r = r0 - dr;
      c = c0 - dc;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === player) {
        line.unshift(r * COLS + c);
        r -= dr;
        c -= dc;
      }
      if (line.length >= 4) return line;
    }
    return null;
  }

  private nextPlayer(g: C4Game): string {
    const i = g.order.indexOf(g.currentTurn);
    return g.order[(i + 1) % g.order.length];
  }

  private emptyBoard(): string[] {
    return Array.from({ length: ROWS * COLS }, () => '');
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = this.randomCode();
      const snap = await withTimeout(get(ref(db, `connect4/games/${code}`)));
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

  /** Bricht früh mit klarer Meldung ab, wenn Firebase nicht eingerichtet ist. */
  private assertConfig(): void {
    if (!databaseConfigured) {
      throw new Error(
        'Firebase ist noch nicht fertig eingerichtet: In ' +
          'src/app/connect4/firebase/firebase-config.ts fehlt die gültige "databaseURL".',
      );
    }
  }

  private toMessage(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes('PERMISSION_DENIED')) {
      return 'Keine Verbindung zur Datenbank. Sind die Datenbank-Regeln für "connect4" gesetzt?';
    }
    return raw;
  }
}
