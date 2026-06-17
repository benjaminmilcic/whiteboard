export type C4Status = 'waiting' | 'playing' | 'finished';

export type C4Color = 'red' | 'yellow';

export interface C4Player {
  id: string;
  name: string;
  emoji: string;
  color: C4Color; // Sitzplatz-Farbe: Host = rot, Gast = gelb
}

export interface C4Game {
  code: string;
  status: C4Status;
  hostId: string;
  cols: number; // 7
  rows: number; // 6
  /** Spielfeld als flaches Array (Länge cols*rows). Wert: playerId oder '' (leer).
   *  Index = row * cols + col, row 0 ist OBEN. */
  board: string[];
  /** playerId, der gerade dran ist. */
  currentTurn: string;
  /** Reihenfolge der Spieler-Ids. */
  order: string[];
  players: Record<string, C4Player>;
  winnerId: string | null; // playerId, 'tie' oder null
  /** Indizes der vier Gewinn-Felder (zum Hervorheben) oder null. */
  winningCells: number[] | null;
  /** Index des zuletzt geworfenen Steins (für die Hervorhebung) oder null. */
  lastMove: number | null;
  createdAt: number;
  updatedAt: number;
}
