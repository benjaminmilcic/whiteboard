export type UnoStatus = 'waiting' | 'playing' | 'finished';

/** Spielbare Kartenfarben + 'w' für Joker (Wild). */
export type UnoColor = 'r' | 'y' | 'g' | 'b';
export type UnoCardColor = UnoColor | 'w';

/**
 * Kartenwert:
 *  - '0' … '9'  Zahlenkarten
 *  - 'skip'     Aussetzen (Gegner setzt aus → bei 2 Spielern: nochmal du)
 *  - 'rev'      Richtungswechsel (bei 2 Spielern wie Aussetzen)
 *  - 'd2'       Zieh Zwei (Gegner zieht 2 + setzt aus)
 *  - 'wild'     Farbwahl-Joker
 *  - 'd4'       Zieh-Vier-Joker (Gegner zieht 4 + setzt aus)
 */
export type UnoValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'rev' | 'd2' | 'wild' | 'd4';

export interface UnoCard {
  /** Innerhalb eines Spiels eindeutige Id (Karten kommen doppelt vor). */
  id: string;
  color: UnoCardColor;
  value: UnoValue;
}

export interface UnoPlayer {
  id: string;
  name: string;
  emoji: string;
}

export interface UnoGame {
  code: string;
  status: UnoStatus;
  hostId: string;
  players: Record<string, UnoPlayer>;
  /** Reihenfolge der Spieler-Ids. */
  order: string[];
  /** Handkarten je Spieler. */
  hands: Record<string, UnoCard[]>;
  /** Verdeckter Nachziehstapel (oberste Karte = letztes Element). */
  drawPile: UnoCard[];
  /** Offener Ablagestapel (oberste Karte = letztes Element). */
  discardPile: UnoCard[];
  /** Aktuell geforderte Farbe (löst Joker auf). */
  currentColor: UnoColor;
  /** playerId, der gerade dran ist. */
  currentTurn: string;
  winnerId: string | null;
  /** Letzter Spielzug (für kurze Hinweis-Einblendung), oder null. */
  lastAction: UnoAction | null;
  createdAt: number;
  updatedAt: number;
}

/** Beschreibt den letzten Zug, damit der Gegner sieht, was passiert ist. */
export interface UnoAction {
  /** Wer den Zug gemacht hat. */
  by: string;
  /** 'play' = Karte gelegt, 'draw' = Karte gezogen. */
  type: 'play' | 'draw';
  /** Gelegte Karte (nur bei type === 'play'). */
  card?: UnoCard;
  /** Wie viele Karten der Gegner ziehen musste (d2/d4). */
  forced?: number;
  at: number;
}
