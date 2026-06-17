import { Injectable, computed, signal } from '@angular/core';
import {
  ref,
  set,
  get,
  update,
  onValue,
  push,
  query,
  orderByChild,
  limitToLast,
  type Unsubscribe,
} from 'firebase/database';
import { db, databaseConfigured } from '../firebase/firebase';
import { CARD_MOTIFS } from '../data/card-motifs';
import type { Card, GameState, Player, ScoreEntry } from './game.types';

const PLAYER_ID_KEY = 'memory_player_id';
const PLAYER_NAME_KEY = 'memory_player_name';
const PLAYER_AVATAR_KEY = 'memory_player_avatar';
const MISMATCH_MS = 1300;
// Zeichen ohne leicht verwechselbare (kein I/O/0/1) – kindgerecht vorlesbar.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

@Injectable({ providedIn: 'root' })
export class GameService {
  /** Aktueller Spielzustand aus der Realtime Database. */
  readonly game = signal<GameState | null>(null);
  /** Letzte beendete Spiele (für die Bestenliste). */
  readonly scores = signal<ScoreEntry[]>([]);
  /** Fehlermeldung für die Oberfläche (z. B. fehlende Firebase-Konfiguration). */
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly playerId = this.loadPlayerId();

  private gameUnsub: Unsubscribe | null = null;
  private mismatchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRecordedFinish = 0;
  private scoresSubscribed = false;

  // ---- Abgeleitete Signale für die Oberfläche -----------------------------
  readonly me = computed<Player | null>(() => this.game()?.players[this.playerId] ?? null);

  readonly opponent = computed<Player | null>(() => {
    const g = this.game();
    if (!g) return null;
    const other = Object.values(g.players).find((p) => p.id !== this.playerId);
    return other ?? null;
  });

  readonly isMyTurn = computed<boolean>(() => {
    const g = this.game();
    return !!g && g.status === 'playing' && g.currentTurn === this.playerId;
  });

  readonly currentPlayer = computed<Player | null>(() => {
    const g = this.game();
    return g ? g.players[g.currentTurn] ?? null : null;
  });

  // ---- Spieler-Identität ---------------------------------------------------
  get savedName(): string {
    return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
  }
  get savedAvatar(): string {
    return localStorage.getItem(PLAYER_AVATAR_KEY) ?? CARD_MOTIFS[0].id;
  }

  private rememberProfile(name: string, avatar: string): void {
    localStorage.setItem(PLAYER_NAME_KEY, name);
    localStorage.setItem(PLAYER_AVATAR_KEY, avatar);
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
  async createGame(name: string, avatar: string, pairs: number): Promise<string> {
    this.rememberProfile(name, avatar);
    this.busy.set(true);
    this.error.set(null);
    try {
      this.assertConfig();
      const code = await this.uniqueCode();
      const player: Player = { id: this.playerId, name, avatar, score: 0 };
      const state: GameState = {
        code,
        status: 'waiting',
        hostId: this.playerId,
        pairs,
        board: this.buildBoard(pairs),
        flipped: [],
        resolving: false,
        currentTurn: this.playerId,
        order: [this.playerId],
        players: { [this.playerId]: player },
        winnerId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.withTimeout(set(ref(db, `games/${code}`), state));
      this.subscribe(code);
      return code;
    } catch (e) {
      this.error.set(this.toMessage(e));
      throw e;
    } finally {
      this.busy.set(false);
    }
  }

  async joinGame(rawCode: string, name: string, avatar: string): Promise<void> {
    const code = rawCode.trim().toUpperCase();
    this.rememberProfile(name, avatar);
    this.busy.set(true);
    this.error.set(null);
    try {
      this.assertConfig();
      const snap = await this.withTimeout(get(ref(db, `games/${code}`)));
      if (!snap.exists()) {
        throw new Error('Kein Spiel mit diesem Code gefunden.');
      }
      const state = snap.val() as GameState;
      if (!state.players[this.playerId]) {
        const ids = Object.keys(state.players);
        if (ids.length >= 2) {
          throw new Error('Dieses Spiel ist schon voll (2 Spieler).');
        }
        state.players[this.playerId] = { id: this.playerId, name, avatar, score: 0 };
        state.order = [...state.order, this.playerId];
        state.status = 'playing';
        state.currentTurn = state.order[0];
        state.updatedAt = Date.now();
        await this.withTimeout(set(ref(db, `games/${code}`), state));
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
  async flip(index: number): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing') return;
    if (g.currentTurn !== this.playerId) return;
    if (g.resolving || g.flipped.length >= 2) return;
    if (g.flipped.includes(index)) return;
    if (g.board[index].matchedBy) return;

    const flipped = [...g.flipped, index];

    if (flipped.length < 2) {
      await update(ref(db, `games/${g.code}`), { flipped, updatedAt: Date.now() });
      return;
    }

    const [a, b] = flipped;
    const isMatch = g.board[a].motifId === g.board[b].motifId;

    if (isMatch) {
      const board: Card[] = g.board.map((c, i) =>
        i === a || i === b ? { ...c, matchedBy: this.playerId } : c
      );
      const players: Record<string, Player> = { ...g.players };
      const mine = players[this.playerId];
      players[this.playerId] = { ...mine, score: mine.score + 1 };
      const finished = board.every((c) => c.matchedBy);

      await update(ref(db, `games/${g.code}`), {
        board,
        players,
        flipped: [],
        resolving: false,
        updatedAt: Date.now(),
        ...(finished
          ? { status: 'finished', winnerId: this.computeWinner(players) }
          : {}),
      });
    } else {
      // Beide Karten kurz zeigen, dann umdrehen und Gegner ist dran.
      await update(ref(db, `games/${g.code}`), {
        flipped,
        resolving: true,
        updatedAt: Date.now(),
      });
      const next = this.nextPlayer(g);
      this.mismatchTimer = setTimeout(() => {
        update(ref(db, `games/${g.code}`), {
          flipped: [],
          resolving: false,
          currentTurn: next,
          updatedAt: Date.now(),
        }).catch((e) => this.error.set(this.toMessage(e)));
      }, MISMATCH_MS);
    }
  }

  /** Neue Runde – beide Spieler dürfen starten. */
  async playAgain(): Promise<void> {
    const g = this.game();
    if (!g) return;
    const players: Record<string, Player> = {};
    for (const [id, p] of Object.entries(g.players)) {
      players[id] = { ...p, score: 0 };
    }
    // Fairness: Der Verlierer der letzten Runde beginnt (bei Gleichstand der Host).
    const starter =
      g.winnerId && g.winnerId !== 'tie'
        ? g.order.find((id) => id !== g.winnerId) ?? g.order[0]
        : g.order[0];
    await update(ref(db, `games/${g.code}`), {
      board: this.buildBoard(g.pairs),
      flipped: [],
      resolving: false,
      status: 'playing',
      currentTurn: starter,
      winnerId: null,
      players,
      updatedAt: Date.now(),
    });
  }

  leaveGame(): void {
    if (this.mismatchTimer) clearTimeout(this.mismatchTimer);
    this.mismatchTimer = null;
    this.gameUnsub?.();
    this.gameUnsub = null;
    this.lastRecordedFinish = 0;
    this.game.set(null);
  }

  // ---- Bestenliste ---------------------------------------------------------
  subscribeScores(): void {
    if (this.scoresSubscribed) return;
    this.scoresSubscribed = true;
    const q = query(ref(db, 'scores'), orderByChild('finishedAt'), limitToLast(12));
    onValue(
      q,
      (snap) => {
        const list: ScoreEntry[] = [];
        snap.forEach((child) => {
          list.push(child.val() as ScoreEntry);
        });
        list.reverse(); // neueste zuerst
        this.scores.set(list);
      },
      (err) => this.error.set(this.toMessage(err))
    );
  }

  // ---- Intern --------------------------------------------------------------
  private subscribe(code: string): void {
    this.gameUnsub?.();
    this.lastRecordedFinish = 0;
    const gameRef = ref(db, `games/${code}`);
    this.gameUnsub = onValue(
      gameRef,
      (snap) => {
        const raw = snap.val() as GameState | null;
        const g = raw ? this.normalize(raw) : null;
        this.game.set(g);
        if (
          g &&
          g.status === 'finished' &&
          this.playerId === g.hostId &&
          this.lastRecordedFinish !== g.updatedAt
        ) {
          this.lastRecordedFinish = g.updatedAt;
          this.recordScore(g);
        }
      },
      (err) => this.error.set(this.toMessage(err))
    );
  }

  private async recordScore(g: GameState): Promise<void> {
    const players = Object.values(g.players).map((p) => ({ name: p.name, score: p.score }));
    const winnerName =
      g.winnerId === 'tie' || !g.winnerId
        ? 'Unentschieden'
        : g.players[g.winnerId]?.name ?? 'Unbekannt';
    const entry: ScoreEntry = {
      code: g.code,
      pairs: g.pairs,
      winnerName,
      players,
      finishedAt: g.updatedAt,
    };
    try {
      await set(push(ref(db, 'scores')), entry);
    } catch (e) {
      this.error.set(this.toMessage(e));
    }
  }

  /**
   * Firebase speichert keine leeren Arrays/Null-Werte – beim Einlesen ergänzen,
   * damit die Oberfläche niemals auf "undefined" zugreift.
   */
  private normalize(g: GameState): GameState {
    return {
      ...g,
      flipped: g.flipped ?? [],
      order: g.order ?? [],
      players: g.players ?? {},
      winnerId: g.winnerId ?? null,
      board: (g.board ?? []).map((c) => ({
        motifId: c.motifId,
        matchedBy: c.matchedBy ?? null,
      })),
    };
  }

  private computeWinner(players: Record<string, Player>): string {
    const list = Object.values(players);
    const top = Math.max(...list.map((p) => p.score));
    const leaders = list.filter((p) => p.score === top);
    return leaders.length === 1 ? leaders[0].id : 'tie';
  }

  private nextPlayer(g: GameState): string {
    const i = g.order.indexOf(g.currentTurn);
    return g.order[(i + 1) % g.order.length];
  }

  private buildBoard(pairs: number): Card[] {
    const motifs = [...CARD_MOTIFS].sort(() => Math.random() - 0.5).slice(0, pairs);
    const cards: Card[] = [];
    for (const m of motifs) {
      cards.push({ motifId: m.id, matchedBy: null });
      cards.push({ motifId: m.id, matchedBy: null });
    }
    return this.shuffle(cards);
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = this.randomCode();
      const snap = await this.withTimeout(get(ref(db, `games/${code}`)));
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
        'Firebase ist noch nicht fertig eingerichtet: In src/app/firebase/firebase-config.ts ' +
          'fehlt die gültige "databaseURL". Lege in der Firebase-Konsole die Realtime Database an ' +
          'und trage die URL ein (siehe README, Abschnitt 2.2/2.4).'
      );
    }
  }

  /** Verhindert ewiges Hängen, falls die Datenbank nicht antwortet. */
  private withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                'Zeitüberschreitung: Die Datenbank antwortet nicht. Prüfe die "databaseURL" ' +
                  'und ob die Realtime Database in der Firebase-Konsole angelegt ist.'
              )
            ),
          ms
        )
      ),
    ]);
  }

  private toMessage(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes('DEIN_PROJEKT') || raw.includes('PERMISSION_DENIED')) {
      return 'Keine Verbindung zur Datenbank. Ist die Firebase-Konfiguration eingetragen und sind die Datenbank-Regeln gesetzt?';
    }
    return raw;
  }
}
