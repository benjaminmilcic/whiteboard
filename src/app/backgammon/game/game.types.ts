export type BgStatus = 'waiting' | 'playing' | 'finished';

// white = Gastgeber (Host), zieht von hohen zu niedrigen Feldern (Heimat 0–5).
// black = Gast, zieht von niedrigen zu hohen Feldern (Heimat 18–23).
export type BgColor = 'white' | 'black';

export interface BgPlayer {
  id: string;
  name: string;
  emoji: string;
  color: BgColor;
}

export interface BgGame {
  code: string;
  status: BgStatus;
  hostId: string;
  /**
   * Spielfeld als flaches Array der Länge 24.
   * Wert > 0  → so viele weiße Steine auf diesem Punkt.
   * Wert < 0  → so viele schwarze Steine (Betrag) auf diesem Punkt.
   * Wert = 0  → Punkt ist leer.
   * Index 0 ist die rechte untere Ecke (weiße Heimat), Index 23 rechts oben.
   */
  board: number[];
  /** Geschlagene Steine, die wieder eingewürfelt werden müssen. */
  barWhite: number;
  barBlack: number;
  /** Bereits herausgespielte Steine (Ziel: 15). */
  offWhite: number;
  offBlack: number;
  /** playerId, der gerade dran ist. */
  currentTurn: string;
  /** Reihenfolge der Spieler-Ids (order[0] = Host = weiß). */
  order: string[];
  players: Record<string, BgPlayer>;
  /** Der aktuelle Wurf (zwei Würfel) – leer, solange noch nicht gewürfelt wurde. */
  dice: number[];
  /** Noch nicht verbrauchte Würfelaugen (bei Pasch vier gleiche Werte). */
  diceLeft: number[];
  /** Hat der aktuelle Spieler in diesem Zug schon gewürfelt? */
  rolled: boolean;
  winnerId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Ein einzelner Teilzug eines Steins (für die Zug-Erzeugung). */
export interface BgMove {
  /** Quellpunkt 0–23 oder -1 für „von der Bar". */
  from: number;
  /** Zielpunkt 0–23 oder -1 für „herausspielen" (bear off). */
  to: number;
  /** Verwendeter Würfelwert. */
  die: number;
}
