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
import { POINTS_COUNT } from '../../game/game.types';

type Outcome = 'win' | 'lose';

/** Rasterpositionen [Zeile, Spalte] (0..6) der 24 Felder. */
const POINTS: [number, number][] = [
  [0, 0], [0, 3], [0, 6],
  [1, 1], [1, 3], [1, 5],
  [2, 2], [2, 3], [2, 4],
  [3, 0], [3, 1], [3, 2], [3, 4], [3, 5], [3, 6],
  [4, 2], [4, 3], [4, 4],
  [5, 1], [5, 3], [5, 5],
  [6, 0], [6, 3], [6, 6],
];

const SEAT_COLORS = ['#e11d48', '#1d4ed8']; // Sitz 0 = rot, Sitz 1 = blau

/** Rasterwert 0..6 → Prozentposition im quadratischen Brett. */
function pct(c: number): number {
  return 6 + (c * 88) / 6;
}

interface PointView {
  index: number;
  x: number;
  y: number;
  occupant: number; // -1 leer, sonst Sitz
  color: string | null;
  emoji: string;
  placeable: boolean;
  selectable: boolean;
  selected: boolean;
  target: boolean;
  removable: boolean;
}

@Component({
  selector: 'app-mill-board',
  standalone: true,
  imports: [TranslocoModule, DraggableDirective],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MillBoard implements OnDestroy {
  protected readonly svc = inject(GameService);
  private readonly effects = inject(EffectsService);
  protected readonly game = this.svc.game;

  /** Lokal gewählter eigener Stein (Zugphase). */
  protected readonly selected = signal<number | null>(null);

  private effectsShown = false;

  protected readonly currentName = computed<string>(() => this.svc.currentPlayer()?.name ?? '');

  protected readonly outcome = computed<Outcome | null>(() => {
    const g = this.game();
    if (!g || g.status !== 'finished') return null;
    return g.winnerId === this.svc.playerId ? 'win' : 'lose';
  });

  /** Gültige Zielfelder des aktuell gewählten Steins. */
  private readonly targets = computed<Set<number>>(() => {
    const g = this.game();
    const sel = this.selected();
    if (!g || sel === null) return new Set();
    return new Set(this.svc.targetsFor(g, sel));
  });

  /** Anzeige-Modell aller 24 Felder. */
  protected readonly points = computed<PointView[]>(() => {
    const g = this.game();
    const out: PointView[] = [];
    if (!g) return out;
    const mySeat = this.svc.mySeat();
    const myTurn = this.svc.isMyTurn();
    const removing = this.svc.removing();
    const place = this.svc.phase() === 'place';
    const sel = this.selected();
    const targets = this.targets();
    const removableSet = this.svc.removableSet();

    for (let i = 0; i < POINTS_COUNT; i++) {
      const occ = g.board[i];
      const seatId = occ >= 0 ? g.order[occ] : '';
      out.push({
        index: i,
        x: pct(POINTS[i][1]),
        y: pct(POINTS[i][0]),
        occupant: occ,
        color: occ >= 0 ? SEAT_COLORS[occ] ?? '#475569' : null,
        emoji: occ >= 0 ? g.players[seatId]?.emoji ?? '' : '',
        placeable: myTurn && !removing && place && occ === -1,
        selectable: myTurn && !removing && !place && occ === mySeat && this.svc.canSelect(i),
        selected: sel === i,
        target: sel !== null && occ === -1 && targets.has(i),
        removable: removing && removableSet.has(i),
      });
    }
    return out;
  });

  constructor() {
    // Auswahl zurücksetzen, sobald ich nicht (mehr) ziehen darf.
    effect(() => {
      if (!this.svc.isMyTurn() || this.svc.removing() || this.svc.phase() === 'place') {
        this.selected.set(null);
      }
    });

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

  // ---- Aktionen ------------------------------------------------------------
  protected onPoint(p: PointView): void {
    const g = this.game();
    if (!g) return;

    if (this.svc.removing()) {
      if (p.removable) this.svc.removePiece(p.index);
      return;
    }
    if (!this.svc.isMyTurn()) return;

    if (this.svc.phase() === 'place') {
      if (p.placeable) this.svc.place(p.index);
      return;
    }

    // Zugphase: eigenen Stein wählen oder Zielfeld antippen.
    if (p.occupant === this.svc.mySeat()) {
      if (p.selectable) this.selected.set(this.selected() === p.index ? null : p.index);
      return;
    }
    const sel = this.selected();
    if (sel !== null && p.target) {
      this.svc.move(sel, p.index);
      this.selected.set(null);
    }
  }

  protected playAgain(): void {
    this.effects.stop();
    this.svc.playAgain();
  }

  protected leave(): void {
    this.effects.stop();
    this.svc.leaveGame();
  }
}
