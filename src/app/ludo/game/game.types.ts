export type LudoStatus = 'waiting' | 'playing' | 'finished';

export interface LudoPlayer {
  id: string;
  name: string;
  emoji: string;
}

/**
 * Position einer Figur, kodiert als eine Zahl:
 *  - -1        in der „Garage" (Startfeld-Hof), noch nicht im Spiel
 *  - 0 … 39    auf der gemeinsamen Laufbahn, als *relativer* Fortschritt
 *              ab dem eigenen Startfeld (Brettfeld = (startIndex + pos) % 40)
 *  - 40 … 43   im eigenen Zielhaus (pos - 40 = Zielfeld 0 … 3)
 *
 * Eine Figur ist „fertig", sobald pos >= 40.
 */
export type LudoPos = number;

export const HOME: LudoPos = -1;
export const GOAL_BASE = 40; // pos 40..43 = Zielfelder 0..3
export const TRACK_LEN = 40; // Felder auf der gemeinsamen Laufbahn
export const GOAL_LEN = 4; // Zielfelder pro Spieler
export const PIECES = 4; // Figuren pro Spieler

/** Startfeld-Index auf der Laufbahn je Sitzplatz (0 = rot, 1 = blau). */
export const SEAT_START: number[] = [0, 20];

/** Beschreibt den letzten Zug für eine kurze Einblendung beim Gegner. */
export interface LudoAction {
  /** Wer gewürfelt/gezogen hat. */
  by: string;
  /** Gewürfelte Augenzahl. */
  dice: number;
  /** true, wenn dieser Wurf eine gegnerische Figur geschlagen hat. */
  captured?: boolean;
  at: number;
}

export interface LudoGame {
  code: string;
  status: LudoStatus;
  hostId: string;
  players: Record<string, LudoPlayer>;
  /** Reihenfolge der Spieler-Ids (order[0] = Sitz 0 = rot). */
  order: string[];
  /** Figur-Positionen je Spieler (immer 4 Einträge). */
  pieces: Record<string, LudoPos[]>;
  /** playerId, der gerade dran ist. */
  currentTurn: string;
  /** Zuletzt gewürfelte Augenzahl; null = es muss erst gewürfelt werden. */
  dice: number | null;
  /** Wie viele Würfe der aktuelle Spieler in dieser Phase noch hat. */
  rollsLeft: number;
  winnerId: string | null;
  lastAction: LudoAction | null;
  createdAt: number;
  updatedAt: number;
}

/** Ein möglicher Zug: Figur `pieceIndex` landet auf `to`. */
export interface LudoMove {
  pieceIndex: number;
  to: LudoPos;
  /** true, wenn dabei eine gegnerische Figur geschlagen wird. */
  captures: boolean;
}
