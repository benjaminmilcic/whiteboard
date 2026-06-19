export type ChessStatus = 'waiting' | 'playing' | 'finished';

// white = Gastgeber (Host), Figuren unten; black = Gast, Figuren oben.
export type ChessColor = 'white' | 'black';

export interface ChessPlayer {
  id: string;
  name: string;
  emoji: string;
  color: ChessColor;
}

export interface ChessGame {
  code: string;
  status: ChessStatus;
  hostId: string;
  /**
   * Spielfeld als flaches Array der Länge 64 (Index = Zeile*8 + Spalte, Zeile 0 oben).
   * Figuren in FEN-Schreibweise: Weiß GROSS (KQRBNP), Schwarz klein (kqrbnp), '' leer.
   */
  board: string[];
  currentTurn: string;
  order: string[];
  players: Record<string, ChessPlayer>;
  /** Rochaderechte als Teilmenge von "KQkq", "-" wenn keine. */
  castling: string;
  /** Feld, das per En-passant geschlagen werden kann, oder null. */
  enPassant: number | null;
  /** Steht der Spieler, der gerade dran ist, im Schach? */
  check: boolean;
  /** playerId des Siegers, 'draw' bei Patt, oder null. */
  winnerId: string | null;
  lastMove: { from: number; to: number } | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChessMove {
  from: number;
  to: number;
  /** Bauernumwandlung (automatisch zur Dame). */
  promo?: boolean;
  /** Schlagen per En-passant. */
  enPassant?: boolean;
  /** Rochade: 'K' kurz, 'Q' lang. */
  castle?: 'K' | 'Q';
}
