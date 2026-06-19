export type DameStatus = 'waiting' | 'playing' | 'finished';

// white = Gastgeber (Host), zieht nach oben (Zeile wird kleiner).
// black = Gast, zieht nach unten (Zeile wird größer).
export type DameColor = 'white' | 'black';

export interface DamePlayer {
  id: string;
  name: string;
  emoji: string;
  color: DameColor;
}

export interface DameGame {
  code: string;
  status: DameStatus;
  hostId: string;
  /**
   * Spielfeld als flaches Array der Länge 64 (Index = Zeile*8 + Spalte).
   * Werte: '' leer, 'w' weißer Stein, 'W' weiße Dame, 'b'/'B' schwarz.
   */
  board: string[];
  /** playerId, der gerade dran ist. */
  currentTurn: string;
  /** Bei Mehrfachschlag: Feld, mit dem zwingend weitergeschlagen werden muss. */
  continueFrom: number | null;
  /** Reihenfolge der Spieler-Ids (order[0] = Host = weiß). */
  order: string[];
  players: Record<string, DamePlayer>;
  winnerId: string | null;
  /** Zuletzt gezogener Stein (zum Hervorheben) oder null. */
  lastMove: { from: number; to: number } | null;
  createdAt: number;
  updatedAt: number;
}

/** Ein einzelner Zug: from → to, optional mit geschlagenem Feld. */
export interface DameMove {
  from: number;
  to: number;
  captured: number | null;
}
