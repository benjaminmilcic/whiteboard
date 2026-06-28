export type MillStatus = 'waiting' | 'playing' | 'finished';

export interface MillPlayer {
  id: string;
  name: string;
  emoji: string;
}

/** Felder sind mit 0..23 nummeriert (drei ineinander liegende Quadrate). */
export const POINTS_COUNT = 24;
/** Steine pro Spieler. */
export const PIECES = 9;

export interface MillGame {
  code: string;
  status: MillStatus;
  hostId: string;
  players: Record<string, MillPlayer>;
  /** Reihenfolge der Spieler-Ids (order[0] = Sitz 0, order[1] = Sitz 1). */
  order: string[];
  /** 24 Felder: -1 leer, sonst Sitzplatz (0 oder 1) des Steins. */
  board: number[];
  /** Wie viele Steine jeder Sitzplatz schon gesetzt hat (Setzphase). */
  placed: number[];
  /** playerId, der gerade dran ist. */
  currentTurn: string;
  /** true: aktueller Spieler hat eine Mühle und muss einen Stein wegnehmen. */
  removing: boolean;
  winnerId: string | null;
  lastAction: MillAction | null;
  createdAt: number;
  updatedAt: number;
}

/** Beschreibt den letzten Zug für eine kurze Einblendung beim Gegner. */
export interface MillAction {
  by: string;
  type: 'place' | 'move' | 'remove';
  /** Betroffenes Feld. */
  at_field: number;
  /** true, wenn dabei eine Mühle geschlossen wurde. */
  mill?: boolean;
  at: number;
}

/** Nachbarschaften je Feld (für Zugmöglichkeiten in der Zugphase). */
export const ADJACENCY: number[][] = [
  [1, 9], // 0
  [0, 2, 4], // 1
  [1, 14], // 2
  [4, 10], // 3
  [3, 5, 1, 7], // 4
  [4, 13], // 5
  [7, 11], // 6
  [6, 8, 4], // 7
  [7, 12], // 8
  [0, 10, 21], // 9
  [9, 11, 3, 18], // 10
  [10, 6, 15], // 11
  [8, 13, 17], // 12
  [12, 14, 5, 20], // 13
  [2, 13, 23], // 14
  [11, 16], // 15
  [15, 17, 19], // 16
  [16, 12], // 17
  [10, 19], // 18
  [18, 20, 16, 22], // 19
  [13, 19], // 20
  [9, 22], // 21
  [21, 23, 19], // 22
  [14, 22], // 23
];

/** Alle 16 Mühlen (Dreierreihen). */
export const MILLS: number[][] = [
  // waagerecht
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11],
  [12, 13, 14],
  [15, 16, 17],
  [18, 19, 20],
  [21, 22, 23],
  // senkrecht
  [0, 9, 21],
  [3, 10, 18],
  [6, 11, 15],
  [1, 4, 7],
  [16, 19, 22],
  [8, 12, 17],
  [5, 13, 20],
  [2, 14, 23],
];
