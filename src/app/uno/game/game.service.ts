import { Injectable, computed, signal } from '@angular/core';
import { ref, set, get, update, onValue, type Unsubscribe } from 'firebase/database';
import { authReady, db, databaseConfigured } from '../firebase/firebase';
import type { UnoCard, UnoColor, UnoGame, UnoPlayer, UnoValue } from './game.types';

const PLAYER_ID_KEY = 'uno_player_id';
const PLAYER_NAME_KEY = 'uno_player_name';
const PLAYER_EMOJI_KEY = 'uno_player_emoji';
const CODE_ALPHABET = '0123456789';

export const START_HAND = 7;
export const AVATARS = ['🦄', '🐙', '🦈', '🐱', '🦖', '🐬', '🦊', '🐸', '🐧', '🦁'];
export const COLORS: UnoColor[] = ['r', 'y', 'g', 'b'];

@Injectable({ providedIn: 'root' })
export class GameService {
  /** Aktueller Spielzustand aus der Realtime Database. */
  readonly game = signal<UnoGame | null>(null);
  /** Fehlermeldung für die Oberfläche (z. B. fehlende Firebase-Konfiguration). */
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly playerId = this.loadPlayerId();

  private gameUnsub: Unsubscribe | null = null;
  /** Laufende Nummer für eindeutige Karten-Ids innerhalb eines Spiels. */
  private cardSeq = 0;

  // ---- Abgeleitete Signale für die Oberfläche -----------------------------
  readonly me = computed<UnoPlayer | null>(() => this.game()?.players[this.playerId] ?? null);

  readonly opponent = computed<UnoPlayer | null>(() => {
    const g = this.game();
    if (!g) return null;
    return Object.values(g.players).find((p) => p.id !== this.playerId) ?? null;
  });

  readonly myHand = computed<UnoCard[]>(() => this.game()?.hands[this.playerId] ?? []);

  readonly opponentCount = computed<number>(() => {
    const g = this.game();
    const opp = this.opponent();
    return g && opp ? (g.hands[opp.id]?.length ?? 0) : 0;
  });

  readonly topCard = computed<UnoCard | null>(() => {
    const pile = this.game()?.discardPile;
    return pile && pile.length ? pile[pile.length - 1] : null;
  });

  readonly isMyTurn = computed<boolean>(() => {
    const g = this.game();
    return !!g && g.status === 'playing' && g.currentTurn === this.playerId;
  });

  readonly currentPlayer = computed<UnoPlayer | null>(() => {
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
      const player: UnoPlayer = { id: this.playerId, name: name.trim() || 'Spieler', emoji };
      const state: UnoGame = {
        code,
        status: 'waiting',
        hostId: this.playerId,
        players: { [this.playerId]: player },
        order: [this.playerId],
        hands: { [this.playerId]: [] },
        drawPile: [],
        discardPile: [],
        currentColor: 'r',
        currentTurn: this.playerId,
        winnerId: null,
        lastAction: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.withTimeout(set(ref(db, `uno/games/${code}`), state));
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
      const snap = await this.withTimeout(get(ref(db, `uno/games/${code}`)));
      if (!snap.exists()) {
        throw new Error('Kein Spiel mit diesem Code gefunden.');
      }
      const state = this.normalize(snap.val() as UnoGame);
      if (!state.players[this.playerId]) {
        if (Object.keys(state.players).length >= 2) {
          throw new Error('Dieses Spiel ist schon voll (2 Spieler).');
        }
        state.players[this.playerId] = { id: this.playerId, name: name.trim() || 'Spieler', emoji };
        state.order = [...state.order, this.playerId];
        // Beim Beitritt wird ausgeteilt und losgelegt – Host beginnt.
        this.dealNewRound(state, state.order[0]);
        state.status = 'playing';
        state.updatedAt = Date.now();
        await this.withTimeout(set(ref(db, `uno/games/${code}`), state));
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
   * Legt eine Handkarte ab. Bei Jokern muss `chosenColor` gesetzt sein.
   * Gibt false zurück, wenn der Zug ungültig ist (Karte passt nicht / nicht dran).
   */
  async playCard(cardId: string, chosenColor?: UnoColor): Promise<boolean> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId) return false;

    const hand = [...(g.hands[this.playerId] ?? [])];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) return false;
    const card = hand[idx];
    if (!this.isPlayable(card, this.topCard(), g.currentColor)) return false;
    const isWild = card.color === 'w';
    if (isWild && !chosenColor) return false;

    // Karte aus der Hand auf den Ablagestapel.
    hand.splice(idx, 1);
    const hands: Record<string, UnoCard[]> = { ...g.hands, [this.playerId]: hand };
    const drawPile = [...g.drawPile];
    const discardPile = [...g.discardPile, card];
    const newColor: UnoColor = isWild ? (chosenColor as UnoColor) : (card.color as UnoColor);

    const oppId = this.otherId(g, this.playerId);

    // Sieg: keine Karten mehr.
    if (hand.length === 0) {
      await update(ref(db, `uno/games/${g.code}`), {
        hands,
        drawPile,
        discardPile,
        currentColor: newColor,
        status: 'finished',
        winnerId: this.playerId,
        lastAction: { by: this.playerId, type: 'play', card, at: Date.now() },
        updatedAt: Date.now(),
      });
      return true;
    }

    // Wirkung der Karte bestimmen.
    let forced = 0;
    if (card.value === 'd2') forced = 2;
    else if (card.value === 'd4') forced = 4;
    const skipsOpponent = card.value === 'skip' || card.value === 'rev' || forced > 0;

    if (oppId && forced > 0) {
      const oppHand = [...(hands[oppId] ?? [])];
      this.drawInto(oppHand, drawPile, discardPile, forced);
      hands[oppId] = oppHand;
    }

    // Bei 2 Spielern: Aussetzen/Zieh-Karte → derselbe Spieler ist nochmal dran.
    const nextTurn = skipsOpponent ? this.playerId : oppId ?? this.playerId;

    await update(ref(db, `uno/games/${g.code}`), {
      hands,
      drawPile,
      discardPile,
      currentColor: newColor,
      currentTurn: nextTurn,
      lastAction: { by: this.playerId, type: 'play', card, forced, at: Date.now() },
      updatedAt: Date.now(),
    });
    return true;
  }

  /** Zieht eine Karte vom Nachziehstapel. Danach ist der Gegner dran. */
  async drawCard(): Promise<void> {
    const g = this.game();
    if (!g || g.status !== 'playing' || g.currentTurn !== this.playerId) return;

    const hand = [...(g.hands[this.playerId] ?? [])];
    const drawPile = [...g.drawPile];
    const discardPile = [...g.discardPile];
    this.drawInto(hand, drawPile, discardPile, 1);
    const oppId = this.otherId(g, this.playerId);

    await update(ref(db, `uno/games/${g.code}`), {
      hands: { ...g.hands, [this.playerId]: hand },
      drawPile,
      discardPile,
      currentTurn: oppId ?? this.playerId,
      lastAction: { by: this.playerId, type: 'draw', at: Date.now() },
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
    const next: UnoGame = { ...g };
    this.dealNewRound(next, starter);
    await update(ref(db, `uno/games/${g.code}`), {
      hands: next.hands,
      drawPile: next.drawPile,
      discardPile: next.discardPile,
      currentColor: next.currentColor,
      currentTurn: next.currentTurn,
      status: 'playing',
      winnerId: null,
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
  /** Darf diese Karte auf die oberste Ablage (mit aktueller Farbe) gelegt werden? */
  isPlayable(card: UnoCard, top: UnoCard | null, currentColor: UnoColor): boolean {
    if (card.color === 'w') return true; // Joker passt immer
    if (card.color === currentColor) return true;
    if (top && card.value === top.value) return true;
    return false;
  }

  /** Hat der Spieler am Zug überhaupt eine spielbare Karte? */
  readonly hasPlayable = computed<boolean>(() => {
    const g = this.game();
    if (!g || !this.isMyTurn()) return false;
    const top = this.topCard();
    return this.myHand().some((c) => this.isPlayable(c, top, g.currentColor));
  });

  // ---- Intern --------------------------------------------------------------
  private subscribe(code: string): void {
    this.gameUnsub?.();
    const gameRef = ref(db, `uno/games/${code}`);
    this.gameUnsub = onValue(
      gameRef,
      (snap) => {
        const raw = snap.val() as UnoGame | null;
        this.game.set(raw ? this.normalize(raw) : null);
      },
      (err) => this.error.set(this.toMessage(err)),
    );
  }

  /**
   * Firebase speichert keine leeren Arrays sauber – beim Einlesen ergänzen,
   * damit die Oberfläche niemals auf "undefined" zugreift.
   */
  private normalize(g: UnoGame): UnoGame {
    const order = g.order ?? [];
    const players = g.players ?? {};
    const hands: Record<string, UnoCard[]> = {};
    for (const id of Object.keys(players)) {
      hands[id] = (g.hands?.[id] ?? []).filter(Boolean);
    }
    return {
      ...g,
      order,
      players,
      hands,
      drawPile: (g.drawPile ?? []).filter(Boolean),
      discardPile: (g.discardPile ?? []).filter(Boolean),
      currentColor: g.currentColor ?? 'r',
      winnerId: g.winnerId ?? null,
      lastAction: g.lastAction ?? null,
    };
  }

  /** Teilt für eine neue Runde aus und legt die Startkarte. */
  private dealNewRound(state: UnoGame, starter: string): void {
    const deck = this.shuffle(this.buildDeck());
    const hands: Record<string, UnoCard[]> = {};
    for (const id of state.order) hands[id] = [];
    for (let i = 0; i < START_HAND; i++) {
      for (const id of state.order) {
        const c = deck.pop();
        if (c) hands[id].push(c);
      }
    }
    // Startkarte: erste reine Zahlenkarte (keine Aktion/Joker) verwenden.
    let startIdx = deck.findIndex((c) => c.color !== 'w' && this.isNumber(c.value));
    if (startIdx < 0) startIdx = deck.length - 1;
    const [start] = deck.splice(startIdx, 1);

    state.hands = hands;
    state.drawPile = deck;
    state.discardPile = start ? [start] : [];
    state.currentColor = (start && start.color !== 'w' ? start.color : 'r') as UnoColor;
    state.currentTurn = starter;
  }

  /** Zieht n Karten in `hand` und mischt bei Bedarf den Ablagestapel nach. */
  private drawInto(
    hand: UnoCard[],
    drawPile: UnoCard[],
    discardPile: UnoCard[],
    n: number,
  ): void {
    for (let i = 0; i < n; i++) {
      if (drawPile.length === 0) this.reshuffle(drawPile, discardPile);
      const c = drawPile.pop();
      if (!c) break; // beide Stapel leer – nichts mehr zu ziehen
      hand.push(c);
    }
  }

  /** Mischt den Ablagestapel (ohne oberste Karte) zurück in den Nachziehstapel. */
  private reshuffle(drawPile: UnoCard[], discardPile: UnoCard[]): void {
    if (discardPile.length <= 1) return;
    const top = discardPile.pop()!;
    const rest = discardPile.splice(0, discardPile.length);
    for (const c of this.shuffle(rest)) drawPile.push(c);
    discardPile.push(top);
  }

  private isNumber(v: UnoValue): boolean {
    return v.length === 1 && v >= '0' && v <= '9';
  }

  private buildDeck(): UnoCard[] {
    const deck: UnoCard[] = [];
    const actions: UnoValue[] = ['skip', 'rev', 'd2'];
    for (const color of COLORS) {
      deck.push(this.card(color, '0'));
      for (let n = 1; n <= 9; n++) {
        deck.push(this.card(color, String(n) as UnoValue));
        deck.push(this.card(color, String(n) as UnoValue));
      }
      for (const a of actions) {
        deck.push(this.card(color, a));
        deck.push(this.card(color, a));
      }
    }
    for (let i = 0; i < 4; i++) deck.push(this.card('w', 'wild'));
    for (let i = 0; i < 4; i++) deck.push(this.card('w', 'd4'));
    return deck;
  }

  private card(color: UnoCard['color'], value: UnoValue): UnoCard {
    return { id: 'k' + (this.cardSeq++).toString(36), color, value };
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private otherId(g: UnoGame, id: string): string | null {
    return g.order.find((x) => x !== id) ?? null;
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = this.randomCode();
      const snap = await this.withTimeout(get(ref(db, `uno/games/${code}`)));
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
          'src/app/shared/firebase-config.ts fehlt die gültige "databaseURL".',
      );
    }
  }

  /** Verhindert ewiges Hängen, falls die Datenbank nicht antwortet. */
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
      return 'Keine Verbindung zur Datenbank. Sind die Datenbank-Regeln für "uno" gesetzt?';
    }
    return raw;
  }
}
