// ---- Spielkonstanten -------------------------------------------------

export const GRID_SIZE = 8;

/** Treffer = nochmal schießen? (macht Kindern mehr Spaß). Auf false setzen
 *  für klassische Regeln (nach jedem Schuss ist der/die andere dran). */
export const EXTRA_TURN_ON_HIT = true;

export interface ShipSpec {
  id: string;
  /** Übersetzungs-Schlüssel für den Namen, z. B. "ships.battleship" */
  nameKey: string;
  emoji: string;
  size: number;
}

/** Die Flotte, die jede:r platzieren muss. */
export const FLEET: ShipSpec[] = [
  { id: 'b', nameKey: 'ships.battleship', emoji: '🚢', size: 4 },
  { id: 'c1', nameKey: 'ships.cruiser', emoji: '⛴️', size: 3 },
  { id: 'c2', nameKey: 'ships.cruiser', emoji: '⛴️', size: 3 },
  { id: 'd1', nameKey: 'ships.boat', emoji: '⛵', size: 2 },
  { id: 'd2', nameKey: 'ships.boat', emoji: '⛵', size: 2 },
  { id: 'd3', nameKey: 'ships.boat', emoji: '⛵', size: 2 },
];

// ---- Datentypen (so liegen sie in Firestore) -------------------------

export type GameStatus = 'waiting' | 'setup' | 'battle' | 'finished';

/** Ein platziertes Schiff. cells sind Strings im Format "x,y". */
export interface PlacedShip {
  specId: string;
  size: number;
  cells: string[];
}

export interface PlayerState {
  name: string;
  emoji: string;
  ready: boolean;
}

export type ShotResult = 'hit' | 'miss';

export interface Game {
  code: string;
  status: GameStatus;
  hostId: string;
  guestId: string | null;
  /** uid -> Spielerinfo */
  players: Record<string, PlayerState>;
  /** uid -> seine/ihre platzierte Flotte */
  fleets: Record<string, PlacedShip[]>;
  /** uid -> { "x,y": "hit" | "miss" }  = Schüsse, die DIESE Person abgegeben hat */
  shots: Record<string, Record<string, ShotResult>>;
  /** uid der Person, die gerade dran ist */
  turn: string | null;
  winner: string | null;
  createdAt: number;
}

export interface CellView {
  state: 'water' | 'ship' | 'hit' | 'miss' | 'sunk' | 'preview' | 'invalid';
}
