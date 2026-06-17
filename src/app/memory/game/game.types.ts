export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface Player {
  id: string;
  name: string;
  avatar: string; // motif-id als bunter Avatar
  score: number;
}

export interface Card {
  motifId: string;
  matchedBy: string | null; // playerId, der das Paar gefunden hat
}

export interface GameState {
  code: string;
  status: GameStatus;
  hostId: string;
  pairs: number;
  board: Card[];
  /** Indizes der aktuell offenen Karten (0, 1 oder 2). */
  flipped: number[];
  /** true während der kurzen Anzeige eines Fehlversuchs. */
  resolving: boolean;
  /** playerId, der gerade dran ist. */
  currentTurn: string;
  /** Reihenfolge der Spieler-Ids. */
  order: string[];
  players: Record<string, Player>;
  winnerId: string | null; // playerId, 'tie' oder null
  createdAt: number;
  updatedAt: number;
}

export interface ScoreEntry {
  code: string;
  pairs: number;
  winnerName: string;
  players: { name: string; score: number }[];
  finishedAt: number;
}
