import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from '../../game/game.service';
import { EffectsService } from '../../../memory/effects/effects.service';
import { DraggableDirective } from '../../../shared/draggable.directive';
import { GOAL_BASE, SEAT_START, TRACK_LEN } from '../../game/game.types';

type Outcome = 'win' | 'lose';

/** Die 40 Felder der gemeinsamen Laufbahn als [Zeile, Spalte] im 11×11-Raster. */
const TRACK: [number, number][] = [
  [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
  [3, 4], [2, 4], [1, 4], [0, 4],
  [0, 5],
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6],
  [4, 7], [4, 8], [4, 9], [4, 10],
  [5, 10],
  [6, 10], [6, 9], [6, 8], [6, 7], [6, 6],
  [7, 6], [8, 6], [9, 6], [10, 6],
  [10, 5],
  [10, 4], [9, 4], [8, 4], [7, 4], [6, 4],
  [6, 3], [6, 2], [6, 1], [6, 0],
  [5, 0],
];

/** Vier Zielfelder je Sitzplatz (führen zur Mitte). */
const GOAL: [number, number][][] = [
  [[5, 1], [5, 2], [5, 3], [5, 4]], // Sitz 0 (rot)
  [[5, 9], [5, 8], [5, 7], [5, 6]], // Sitz 1 (blau)
];

/** Vier Garagenplätze je Sitzplatz. */
const HOME: [number, number][][] = [
  [[0, 0], [1, 0], [0, 1], [1, 1]], // Sitz 0 (rot)
  [[9, 9], [10, 9], [9, 10], [10, 10]], // Sitz 1 (blau)
];

const SEAT_COLORS = ['#dc2626', '#2563eb']; // rot, blau

interface Cell {
  row: number;
  col: number;
  /** 'track' | 'goal' | 'home' | 'center' | 'void' */
  kind: 'track' | 'goal' | 'home' | 'center' | 'void';
  /** Sitz, dessen Farbe das Feld trägt (Start/Ziel/Garage), sonst -1. */
  seat: number;
  /** true für ein Startfeld auf der Laufbahn. */
  start: boolean;
}

interface Token {
  key: string;
  seat: number;
  pieceIndex: number;
  color: string;
  emoji: string;
  movable: boolean;
}

@Component({
  selector: 'app-ludo-board',
  standalone: true,
  imports: [TranslocoModule, DraggableDirective],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LudoBoard implements OnDestroy {
  protected readonly svc = inject(GameService);
  private readonly effects = inject(EffectsService);
  protected readonly game = this.svc.game;

  /** Statisches 11×11-Brettmodell (Feldarten). */
  protected readonly cells: Cell[] = this.buildCells();

  private effectsShown = false;

  protected readonly currentName = computed<string>(() => this.svc.currentPlayer()?.name ?? '');

  protected readonly outcome = computed<Outcome | null>(() => {
    const g = this.game();
    if (!g || g.status !== 'finished') return null;
    return g.winnerId === this.svc.playerId ? 'win' : 'lose';
  });

  /** Map "row,col" → Figuren auf diesem Feld. */
  protected readonly tokenMap = computed<Map<string, Token[]>>(() => {
    const g = this.game();
    const map = new Map<string, Token[]>();
    if (!g) return map;
    const legal = this.svc.legalMoves();
    for (let seat = 0; seat < g.order.length; seat++) {
      const id = g.order[seat];
      const player = g.players[id];
      if (!player) continue;
      const color = SEAT_COLORS[seat] ?? '#475569';
      const pieces = g.pieces[id] ?? [];
      for (let i = 0; i < pieces.length; i++) {
        const pos = pieces[i];
        let coord: [number, number];
        if (pos < 0) coord = HOME[seat][i];
        else if (pos < TRACK_LEN) coord = TRACK[(SEAT_START[seat] + pos) % TRACK_LEN];
        else coord = GOAL[seat][pos - GOAL_BASE];
        const movable =
          id === this.svc.playerId &&
          this.svc.isMyTurn() &&
          g.dice !== null &&
          legal.some((m) => m.pieceIndex === i);
        const key = coord[0] + ',' + coord[1];
        const token: Token = {
          key: seat + '-' + i,
          seat,
          pieceIndex: i,
          color,
          emoji: player.emoji,
          movable,
        };
        const list = map.get(key);
        if (list) list.push(token);
        else map.set(key, [token]);
      }
    }
    return map;
  });

  /** Dürfen wir gerade würfeln? */
  protected readonly canRoll = computed<boolean>(() => {
    const g = this.game();
    return this.svc.isMyTurn() && !!g && g.status === 'playing' && g.dice === null;
  });

  constructor() {
    effect(() => {
      const finished = this.game()?.status === 'finished';
      if (finished && !this.effectsShown) {
        this.effectsShown = true;
        if (this.outcome() === 'win') this.effects.celebrate();
        else this.effects.commiserate();
      } else if (!finished && this.effectsShown) {
        this.effectsShown = false;
        this.effects.stop();
      }
    });
  }

  ngOnDestroy(): void {
    this.effects.stop();
  }

  protected tokensAt(cell: Cell): Token[] {
    return this.tokenMap().get(cell.row + ',' + cell.col) ?? [];
  }

  // ---- Aktionen ------------------------------------------------------------
  protected roll(): void {
    if (this.canRoll()) this.svc.roll();
  }

  protected onToken(token: Token): void {
    if (token.movable) this.svc.move(token.pieceIndex);
  }

  protected pass(): void {
    if (this.svc.noMove()) this.svc.pass();
  }

  protected playAgain(): void {
    this.effects.stop();
    this.svc.playAgain();
  }

  protected leave(): void {
    this.effects.stop();
    this.svc.leaveGame();
  }

  // ---- Brettmodell ---------------------------------------------------------
  private buildCells(): Cell[] {
    const kind: Cell['kind'][][] = Array.from({ length: 11 }, () =>
      Array.from({ length: 11 }, () => 'void' as Cell['kind']),
    );
    const seat: number[][] = Array.from({ length: 11 }, () => Array.from({ length: 11 }, () => -1));
    const start: boolean[][] = Array.from({ length: 11 }, () =>
      Array.from({ length: 11 }, () => false),
    );

    for (const [r, c] of TRACK) kind[r][c] = 'track';
    for (let s = 0; s < GOAL.length; s++) {
      for (const [r, c] of GOAL[s]) {
        kind[r][c] = 'goal';
        seat[r][c] = s;
      }
      for (const [r, c] of HOME[s]) {
        kind[r][c] = 'home';
        seat[r][c] = s;
      }
      const [sr, sc] = TRACK[SEAT_START[s]];
      seat[sr][sc] = s;
      start[sr][sc] = true;
    }
    kind[5][5] = 'center';

    const cells: Cell[] = [];
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        cells.push({ row: r, col: c, kind: kind[r][c], seat: seat[r][c], start: start[r][c] });
      }
    }
    return cells;
  }
}
