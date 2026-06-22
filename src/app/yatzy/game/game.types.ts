import type { ScoreMap } from './scoring';

export type YStatus = 'waiting' | 'playing' | 'finished';

export interface YPlayer {
  id: string;
  name: string;
  emoji: string;
}

export interface YatzyGame {
  code: string;
  status: YStatus;
  hostId: string;
  players: Record<string, YPlayer>;
  /** Reihenfolge der Spieler-Ids (Host zuerst). */
  order: string[];
  /** playerId, der gerade würfelt/wählt. */
  currentTurn: string;
  /** Gemeinsame Würfel (beide Geräte sehen denselben Wurf). */
  dice: number[];
  /** Welche Würfel sind festgehalten. */
  held: boolean[];
  /** Verbleibende Würfe in diesem Zug (0 … 3). */
  rollsLeft: number;
  /** Wurde in diesem Zug schon mindestens einmal gewürfelt? */
  rolledThisTurn: boolean;
  /** Wertungstabelle je Spieler: nur eingetragene Kategorien sind gesetzt. */
  scores: Record<string, ScoreMap>;
  winnerId: string | null; // playerId, 'tie' oder null
  createdAt: number;
  updatedAt: number;
}
