import { Injectable, computed, signal } from '@angular/core';
import { ref, set, get, update, onValue, type Unsubscribe } from 'firebase/database';
import { authReady, db, databaseConfigured } from '../firebase/firebase';
import type { YatzyGame, YPlayer } from './game.types';
import {
  CATEGORIES,
  DICE_COUNT,
  MAX_ROLLS,
  scoreFor,
  totalsFor,
  type Category,
  type ScoreMap,
} from './scoring';

const PLAYER_ID_KEY = 'yatzy_player_id';
const PLAYER_NAME_KEY = 'yatzy_player_name';
const PLAYER_EMOJI_KEY = 'yatzy_player_emoji';
const CODE_ALPHABET = '0123456789';

export const AVATARS = ['🦄', '🐙', '🦈', '🐱', '🦖', '🐬', '🦊', '🐸', '🐧', '🦁'];

@Injectable({ providedIn: 'root' })
export class GameService {
  readonly game = signal<YatzyGame | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly playerId = this.loadPlayerId();

  private gameUnsub: Unsubscribe | null = null;

  // ---- Abgeleitete Signale -------------------------------------------------
  readonly me = computed<YPlayer | null>(() => this.game()?.players[this.playerId] ?? null);

  readonly opponent = computed<YPlayer | null>(() => {
    const g = this.game();
    if (!g) return null;
    return Object.values(g.players).find((p) => p.id !== this.playerId) ?? null;
  });

  readonly isMyTurn = computed<boolean>(() => {
    const g = this.game();
    return !!g && g.status === 'playing' && g.currentTurn === this.playerId;
  });

  readonly currentPlayer = computed<YPlayer | null>(() => {
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
      const player: YPlayer = { id: this.playerId, name: name.trim() || 'Spieler', emoji };
      const state: YatzyGame = {
        code,
        status: 'waiting',
        hostId: this.playerId,
        players: { [this.playerId]: player },
        order: [this.playerId],
        currentTurn: this.playerId,
        dice: this.freshDice(),
        held: this.freshHeld(),
        rollsLeft: MAX_ROLLS,
        rolledThisTurn: false,
        scores: { [this.playerId]: {} },
        winnerId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.withTimeout(set(ref(db, `yatzy/games/${code}`), state));
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
      const snap = await this.withTimeout(get(ref(db, `yatzy/games/${code}`)));
      if (!snap.exists()) {
        throw new Error('Kein Spiel mit diesem Code gefunden.');
      }
      const state = this.normalize(snap.val() as YatzyGame);
      if (!state.players[this.playerId]) {
        if (Object.keys(state.players).length >= 2) {
          throw new Error('Dieses Spiel ist schon voll (2 Spieler).');
        }
        state.players[this.playerId] = { id: this.playerId, name: name.trim() || 'Spieler', emoji };
        state.order = [...state.order, this.playerId];
        state.scores = { ...state.scores, [this.playerId]: {} };
        state.status = 'playing';
        state.currentTurn = state.order[0]; // Host beginnt
        state.dice = this.freshDice();
        state.held = this.freshHeld();
        state.rollsLeft = MAX_ROLLS;
        state.rolledThisTurn = false;
        state.updatedAt = Date.now();
        await this.withTimeout(set(ref(db, `yatzy/games/${code}`), state));
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
  /** Würfelt die nicht festgehaltenen Würfel. */
  async roll(): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId) return;
    if (g.rollsLeft <= 0) return;

    const first = !g.rolledThisTurn;
    const dice = g.dice.map((v, i) => (!first && g.held[i] ? v : this.rnd()));
    await update(ref(db, `yatzy/games/${g.code}`), {
      dice,
      held: first ? this.freshHeld() : g.held,
      rollsLeft: g.rollsLeft - 1,
      rolledThisTurn: true,
      updatedAt: Date.now(),
    });
  }

  /** Hält einen Würfel fest oder gibt ihn frei. */
  async toggleHold(i: number): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId) return;
    if (!g.rolledThisTurn || g.rollsLeft === 0) return;
    const held = g.held.map((x, j) => (j === i ? !x : x));
    await update(ref(db, `yatzy/games/${g.code}`), { held, updatedAt: Date.now() });
  }

  /** Trägt die aktuelle Würfelkombination in eine Kategorie ein. */
  async choose(cat: Category): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId) return;
    if (!g.rolledThisTurn) return;
    if (g.scores[this.playerId]?.[cat] != null) return;

    const value = scoreFor(cat, g.dice);
    const updatedScores: Record<string, ScoreMap> = {
      ...g.scores,
      [this.playerId]: { ...(g.scores[this.playerId] ?? {}), [cat]: value },
    };
    const finished = g.order.every((id) =>
      CATEGORIES.every((c) => updatedScores[id]?.[c.key] != null),
    );
    const next = this.nextPlayer(g);

    const payload: Record<string, unknown> = {
      [`scores/${this.playerId}/${cat}`]: value,
      held: this.freshHeld(),
      rollsLeft: MAX_ROLLS,
      rolledThisTurn: false,
      updatedAt: Date.now(),
    };
    if (finished) {
      payload['status'] = 'finished';
      payload['winnerId'] = this.computeWinner(updatedScores, g.order);
    } else {
      payload['currentTurn'] = next;
    }
    await update(ref(db, `yatzy/games/${g.code}`), payload);
  }

  /** Neue Runde – der Verlierer beginnt (bei Gleichstand der Host). */
  async playAgain(): Promise<void> {
    const g = this.game();
    if (!g) return;
    const starter =
      g.winnerId && g.winnerId !== 'tie'
        ? g.order.find((id) => id !== g.winnerId) ?? g.order[0]
        : g.order[0];
    const scores: Record<string, ScoreMap> = {};
    for (const id of g.order) scores[id] = {};
    await set(ref(db, `yatzy/games/${g.code}`), {
      ...g,
      status: 'playing',
      currentTurn: starter,
      dice: this.freshDice(),
      held: this.freshHeld(),
      rollsLeft: MAX_ROLLS,
      rolledThisTurn: false,
      scores,
      winnerId: null,
      updatedAt: Date.now(),
    });
  }

  leaveGame(): void {
    this.gameUnsub?.();
    this.gameUnsub = null;
    this.game.set(null);
  }

  // ---- Intern --------------------------------------------------------------
  private subscribe(code: string): void {
    this.gameUnsub?.();
    const gameRef = ref(db, `yatzy/games/${code}`);
    this.gameUnsub = onValue(
      gameRef,
      (snap) => {
        const raw = snap.val() as YatzyGame | null;
        this.game.set(raw ? this.normalize(raw) : null);
      },
      (err) => this.error.set(this.toMessage(err)),
    );
  }

  /** Firebase liefert leere Arrays/Objekte/Nullwerte unzuverlässig – auffüllen. */
  private normalize(g: YatzyGame): YatzyGame {
    const order = g.order ?? [];
    const scores: Record<string, ScoreMap> = {};
    for (const id of order) scores[id] = g.scores?.[id] ?? {};
    return {
      ...g,
      order,
      players: g.players ?? {},
      scores,
      dice: Array.from({ length: DICE_COUNT }, (_, i) => g.dice?.[i] ?? 1),
      held: Array.from({ length: DICE_COUNT }, (_, i) => g.held?.[i] ?? false),
      rollsLeft: g.rollsLeft ?? MAX_ROLLS,
      rolledThisTurn: g.rolledThisTurn ?? false,
      winnerId: g.winnerId ?? null,
    };
  }

  private computeWinner(scores: Record<string, ScoreMap>, order: string[]): string {
    const totals = order.map((id) => ({ id, total: totalsFor(scores[id] ?? {}).total }));
    const max = Math.max(...totals.map((t) => t.total));
    const winners = totals.filter((t) => t.total === max);
    return winners.length === 1 ? winners[0].id : 'tie';
  }

  private nextPlayer(g: YatzyGame): string {
    const i = g.order.indexOf(g.currentTurn);
    return g.order[(i + 1) % g.order.length];
  }

  private freshDice(): number[] {
    return Array.from({ length: DICE_COUNT }, () => 1);
  }

  private freshHeld(): boolean[] {
    return Array.from({ length: DICE_COUNT }, () => false);
  }

  private rnd(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = this.randomCode();
      const snap = await this.withTimeout(get(ref(db, `yatzy/games/${code}`)));
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
          'src/app/yatzy/firebase/firebase-config.ts fehlt die gültige "databaseURL".',
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
      return 'Keine Verbindung zur Datenbank. Sind die Datenbank-Regeln für "yatzy" gesetzt?';
    }
    return raw;
  }
}
