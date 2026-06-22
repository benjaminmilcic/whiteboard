import { Injectable, computed, signal } from '@angular/core';
import { ref, set, get, update, onValue, type Unsubscribe } from 'firebase/database';
import { authReady, db, databaseConfigured } from '../firebase/firebase';
import type { BgColor, BgGame, BgMove, BgPlayer } from './game.types';

const PLAYER_ID_KEY = 'bg_player_id';
const PLAYER_NAME_KEY = 'bg_player_name';
const PLAYER_EMOJI_KEY = 'bg_player_emoji';
const CODE_ALPHABET = '0123456789'; // vierstelliger Zahlencode

export const POINTS = 24;
export const CHECKERS = 15;
export const AVATARS = ['🦄', '🐙', '🦈', '🐱', '🦖', '🐬', '🦊', '🐸', '🐧', '🦁'];

interface Bar {
  white: number;
  black: number;
}

@Injectable({ providedIn: 'root' })
export class GameService {
  /** Aktueller Spielzustand aus der Realtime Database. */
  readonly game = signal<BgGame | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly playerId = this.loadPlayerId();

  private gameUnsub: Unsubscribe | null = null;

  // ---- Abgeleitete Signale für die Oberfläche -----------------------------
  readonly me = computed<BgPlayer | null>(() => this.game()?.players[this.playerId] ?? null);

  readonly opponent = computed<BgPlayer | null>(() => {
    const g = this.game();
    if (!g) return null;
    return Object.values(g.players).find((p) => p.id !== this.playerId) ?? null;
  });

  readonly isMyTurn = computed<boolean>(() => {
    const g = this.game();
    return !!g && g.status === 'playing' && g.currentTurn === this.playerId;
  });

  readonly currentPlayer = computed<BgPlayer | null>(() => {
    const g = this.game();
    return g ? g.players[g.currentTurn] ?? null : null;
  });

  /** Farbe des Spielers an DIESEM Gerät. */
  readonly myColor = computed<BgColor | null>(() => this.me()?.color ?? null);

  /** Darf gerade gewürfelt werden? */
  readonly canRoll = computed<boolean>(() => {
    const g = this.game();
    return this.isMyTurn() && !!g && !g.rolled;
  });

  /** Gewürfelt, aber kein Zug möglich → Zug muss weitergegeben werden. */
  readonly noMoves = computed<boolean>(() => {
    const g = this.game();
    if (!g || !this.isMyTurn() || !g.rolled || g.diceLeft.length === 0) return false;
    const color = this.myColor();
    if (!color) return false;
    return !this.anyMove(g.board, { white: g.barWhite, black: g.barBlack }, color, g.diceLeft);
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
      const player: BgPlayer = { id: this.playerId, name: name.trim() || 'Spieler', emoji, color: 'white' };
      const state: BgGame = {
        code,
        status: 'waiting',
        hostId: this.playerId,
        board: this.startBoard(),
        barWhite: 0,
        barBlack: 0,
        offWhite: 0,
        offBlack: 0,
        currentTurn: this.playerId,
        order: [this.playerId],
        players: { [this.playerId]: player },
        dice: [],
        diceLeft: [],
        rolled: false,
        winnerId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.withTimeout(set(ref(db, `backgammon/games/${code}`), state));
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
      const snap = await this.withTimeout(get(ref(db, `backgammon/games/${code}`)));
      if (!snap.exists()) {
        throw new Error('Kein Spiel mit diesem Code gefunden.');
      }
      const state = this.normalize(snap.val() as BgGame);
      if (!state.players[this.playerId]) {
        if (Object.keys(state.players).length >= 2) {
          throw new Error('Dieses Spiel ist schon voll (2 Spieler).');
        }
        // Host ist weiß → Gast wird schwarz.
        const taken = Object.values(state.players).map((p) => p.color);
        const color: BgColor = taken.includes('white') ? 'black' : 'white';
        state.players[this.playerId] = { id: this.playerId, name: name.trim() || 'Spieler', emoji, color };
        state.order = [...state.order, this.playerId];
        state.status = 'playing';
        state.currentTurn = state.order[0]; // Host (weiß) beginnt
        state.updatedAt = Date.now();
        await this.withTimeout(set(ref(db, `backgammon/games/${code}`), state));
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
  /** Würfelt (nur der Spieler, der dran ist und noch nicht gewürfelt hat). */
  async roll(): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId || g.rolled) return;
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const diceLeft = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    await update(ref(db, `backgammon/games/${g.code}`), {
      dice: [d1, d2],
      diceLeft,
      rolled: true,
      updatedAt: Date.now(),
    });
  }

  /**
   * Führt einen einzelnen Stein-Zug aus.
   * @param from Quellpunkt 0–23, oder -1 für „von der Bar".
   * @param to   Zielpunkt 0–23, oder -1 für „herausspielen".
   * @param die  Der dafür verwendete Würfelwert.
   */
  async move(from: number, to: number, die: number): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId) return;
    const color = this.colorOf(this.playerId, g);
    if (!color) return;
    if (!g.diceLeft.includes(die)) return;

    const bar: Bar = { white: g.barWhite, black: g.barBlack };
    const legal = this.legalFor(g.board, bar, color, die);
    if (!legal.some((m) => m.from === from && m.to === to)) return;

    const board = [...g.board];
    let barWhite = g.barWhite;
    let barBlack = g.barBlack;
    let offWhite = g.offWhite;
    let offBlack = g.offBlack;
    const sign = color === 'white' ? 1 : -1;

    // Stein vom Startfeld nehmen.
    if (from === -1) {
      if (color === 'white') barWhite--;
      else barBlack--;
    } else {
      board[from] -= sign;
    }

    // Stein aufs Ziel setzen.
    if (to === -1) {
      if (color === 'white') offWhite++;
      else offBlack++;
    } else if (color === 'white') {
      if (board[to] === -1) {
        board[to] = 1;
        barBlack++; // gegnerischen Stein schlagen
      } else {
        board[to] += 1;
      }
    } else {
      if (board[to] === 1) {
        board[to] = -1;
        barWhite++; // gegnerischen Stein schlagen
      } else {
        board[to] -= 1;
      }
    }

    const diceLeft = [...g.diceLeft];
    diceLeft.splice(diceLeft.indexOf(die), 1);

    const off = color === 'white' ? offWhite : offBlack;
    const base = { board, barWhite, barBlack, offWhite, offBlack, updatedAt: Date.now() };

    if (off >= CHECKERS) {
      await update(ref(db, `backgammon/games/${g.code}`), {
        ...base,
        status: 'finished',
        winnerId: this.playerId,
        dice: [],
        diceLeft: [],
        rolled: false,
      });
      return;
    }

    const newBar: Bar = { white: barWhite, black: barBlack };
    const canContinue = diceLeft.length > 0 && this.anyMove(board, newBar, color, diceLeft);
    if (canContinue) {
      await update(ref(db, `backgammon/games/${g.code}`), { ...base, diceLeft });
    } else {
      await update(ref(db, `backgammon/games/${g.code}`), {
        ...base,
        dice: [],
        diceLeft: [],
        rolled: false,
        currentTurn: this.nextPlayer(g),
      });
    }
  }

  /** Gibt den Zug weiter, wenn kein Zug möglich ist. */
  async passTurn(): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId) return;
    await update(ref(db, `backgammon/games/${g.code}`), {
      dice: [],
      diceLeft: [],
      rolled: false,
      currentTurn: this.nextPlayer(g),
      updatedAt: Date.now(),
    });
  }

  /** Neue Runde – der Verlierer der letzten Runde beginnt. */
  async playAgain(): Promise<void> {
    const g = this.game();
    if (!g) return;
    const starter =
      g.winnerId && g.order.includes(g.winnerId)
        ? g.order.find((id) => id !== g.winnerId) ?? g.order[0]
        : g.order[0];
    await update(ref(db, `backgammon/games/${g.code}`), {
      board: this.startBoard(),
      barWhite: 0,
      barBlack: 0,
      offWhite: 0,
      offBlack: 0,
      status: 'playing',
      currentTurn: starter,
      dice: [],
      diceLeft: [],
      rolled: false,
      winnerId: null,
      updatedAt: Date.now(),
    });
  }

  leaveGame(): void {
    this.gameUnsub?.();
    this.gameUnsub = null;
    this.game.set(null);
  }

  // ---- Hilfen für die Oberfläche ------------------------------------------
  /** Felder (0–23, oder -1 für Bar), von denen aus aktuell gezogen werden kann. */
  legalSources(): number[] {
    const g = this.game();
    if (!g || !this.isMyTurn() || !g.rolled) return [];
    const color = this.colorOf(this.playerId, g);
    if (!color) return [];
    const bar: Bar = { white: g.barWhite, black: g.barBlack };
    const set = new Set<number>();
    for (const d of new Set(g.diceLeft)) {
      for (const m of this.legalFor(g.board, bar, color, d)) set.add(m.from);
    }
    return [...set];
  }

  /** Mögliche Ziele für einen Stein von „from" (pro Ziel der sparsamste Würfel). */
  targetsFrom(from: number): BgMove[] {
    const g = this.game();
    if (!g) return [];
    const color = this.colorOf(this.playerId, g);
    if (!color) return [];
    const bar: Bar = { white: g.barWhite, black: g.barBlack };
    const byTo = new Map<number, BgMove>();
    for (const d of new Set(g.diceLeft)) {
      for (const m of this.legalFor(g.board, bar, color, d)) {
        if (m.from !== from) continue;
        const existing = byTo.get(m.to);
        if (!existing || d < existing.die) byTo.set(m.to, { from: m.from, to: m.to, die: d });
      }
    }
    return [...byTo.values()];
  }

  // ---- Regel-Logik ---------------------------------------------------------
  private startBoard(): number[] {
    const b = new Array<number>(24).fill(0);
    // Weiß (+) zieht Richtung Index 0, Heimat 0–5.
    b[23] = 2;
    b[12] = 5;
    b[7] = 3;
    b[5] = 5;
    // Schwarz (−) zieht Richtung Index 23, Heimat 18–23.
    b[0] = -2;
    b[11] = -5;
    b[16] = -3;
    b[18] = -5;
    return b;
  }

  /** Einstiegsfeld von der Bar für einen Würfelwert. */
  private entryIndex(color: BgColor, die: number): number {
    return color === 'white' ? 24 - die : die - 1;
  }

  /** Darf eine Farbe auf diesem Punkt landen? (Gesperrt bei ≥2 gegnerischen Steinen.) */
  private canLand(board: number[], color: BgColor, to: number): boolean {
    const v = board[to];
    return color === 'white' ? v >= -1 : v <= 1;
  }

  /** Sind alle eigenen Steine in der Heimat (Voraussetzung fürs Herausspielen)? */
  private allHome(board: number[], bar: Bar, color: BgColor): boolean {
    if (color === 'white') {
      if (bar.white > 0) return false;
      for (let i = 6; i < 24; i++) if (board[i] > 0) return false;
    } else {
      if (bar.black > 0) return false;
      for (let i = 0; i < 18; i++) if (board[i] < 0) return false;
    }
    return true;
  }

  /** Kann der Stein bei Index i mit diesem Würfel herausgespielt werden? */
  private canBearOff(board: number[], color: BgColor, i: number, die: number): boolean {
    if (color === 'white') {
      if (i < 0 || i > 5) return false;
      const need = i + 1;
      if (die === need) return true;
      if (die > need) {
        for (let j = i + 1; j <= 5; j++) if (board[j] > 0) return false; // kein Stein weiter hinten
        return true;
      }
      return false;
    }
    if (i < 18 || i > 23) return false;
    const need = 24 - i;
    if (die === need) return true;
    if (die > need) {
      for (let j = 18; j < i; j++) if (board[j] < 0) return false;
      return true;
    }
    return false;
  }

  /** Alle erlaubten Einzelzüge für eine Farbe mit einem bestimmten Würfelwert. */
  private legalFor(board: number[], bar: Bar, color: BgColor, die: number): BgMove[] {
    const moves: BgMove[] = [];
    const onBar = color === 'white' ? bar.white : bar.black;

    // Mit Steinen auf der Bar muss zuerst eingewürfelt werden.
    if (onBar > 0) {
      const to = this.entryIndex(color, die);
      if (this.canLand(board, color, to)) moves.push({ from: -1, to, die });
      return moves;
    }

    for (let i = 0; i < 24; i++) {
      const mine = color === 'white' ? board[i] > 0 : board[i] < 0;
      if (!mine) continue;
      const to = color === 'white' ? i - die : i + die;
      if (to >= 0 && to < 24) {
        if (this.canLand(board, color, to)) moves.push({ from: i, to, die });
      } else if (this.allHome(board, bar, color) && this.canBearOff(board, color, i, die)) {
        moves.push({ from: i, to: -1, die });
      }
    }
    return moves;
  }

  private anyMove(board: number[], bar: Bar, color: BgColor, diceLeft: number[]): boolean {
    for (const d of new Set(diceLeft)) {
      if (this.legalFor(board, bar, color, d).length > 0) return true;
    }
    return false;
  }

  private colorOf(id: string, g: BgGame): BgColor | null {
    return g.players[id]?.color ?? null;
  }

  private nextPlayer(g: BgGame): string {
    const i = g.order.indexOf(g.currentTurn);
    return g.order[(i + 1) % g.order.length];
  }

  // ---- Intern --------------------------------------------------------------
  private subscribe(code: string): void {
    this.gameUnsub?.();
    const gameRef = ref(db, `backgammon/games/${code}`);
    this.gameUnsub = onValue(
      gameRef,
      (snap) => {
        const raw = snap.val() as BgGame | null;
        this.game.set(raw ? this.normalize(raw) : null);
      },
      (err) => this.error.set(this.toMessage(err)),
    );
  }

  /** Firebase lässt leere Arrays/Null-Werte weg – beim Einlesen wieder ergänzen. */
  private normalize(g: BgGame): BgGame {
    return {
      ...g,
      order: g.order ?? [],
      players: g.players ?? {},
      board: Array.from({ length: 24 }, (_, i) => g.board?.[i] ?? 0),
      barWhite: g.barWhite ?? 0,
      barBlack: g.barBlack ?? 0,
      offWhite: g.offWhite ?? 0,
      offBlack: g.offBlack ?? 0,
      dice: g.dice ?? [],
      diceLeft: g.diceLeft ?? [],
      rolled: g.rolled ?? false,
      winnerId: g.winnerId ?? null,
    };
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = this.randomCode();
      const snap = await this.withTimeout(get(ref(db, `backgammon/games/${code}`)));
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
          'src/app/backgammon/firebase/firebase-config.ts fehlt die gültige "databaseURL".',
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
      return 'Keine Verbindung zur Datenbank. Sind die Datenbank-Regeln für "backgammon" gesetzt?';
    }
    return raw;
  }
}
