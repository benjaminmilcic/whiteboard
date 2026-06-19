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
import { GameService, SIZE } from '../../game/game.service';
import { EffectsService } from '../../../memory/effects/effects.service';
import { DraggableDirective } from '../../../shared/draggable.directive';
import type { DameColor } from '../../game/game.types';

type Outcome = 'win' | 'lose';

@Component({
  selector: 'app-dame-board',
  standalone: true,
  imports: [TranslocoModule, DraggableDirective],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DameBoard implements OnDestroy {
  protected readonly svc = inject(GameService);
  private readonly effects = inject(EffectsService);
  protected readonly game = this.svc.game;

  /** Alle 64 Felder als Index 0…63. */
  protected readonly squares = Array.from({ length: SIZE * SIZE }, (_, i) => i);

  protected readonly selectedFrom = signal<number | null>(null);

  private effectsShown = false;

  protected readonly sources = computed<Set<number>>(() => new Set(this.svc.legalSources()));

  /** Zielfelder des gewählten Steins: Zielindex → geschlagenes Feld (oder null). */
  protected readonly targets = computed<Map<number, number | null>>(() => {
    const f = this.selectedFrom();
    const m = new Map<number, number | null>();
    if (f === null) return m;
    for (const mv of this.svc.targetsFrom(f)) m.set(mv.to, mv.captured);
    return m;
  });

  protected readonly currentName = computed<string>(() => this.svc.currentPlayer()?.name ?? '');

  protected readonly outcome = computed<Outcome | null>(() => {
    const g = this.game();
    if (!g || g.status !== 'finished') return null;
    return g.winnerId === this.svc.playerId ? 'win' : 'lose';
  });

  constructor() {
    // Bei Mehrfachschlag den Pflicht-Stein automatisch auswählen.
    effect(() => {
      const g = this.game();
      if (!g || !this.svc.isMyTurn()) {
        if (this.selectedFrom() !== null) this.selectedFrom.set(null);
        return;
      }
      if (g.continueFrom !== null && this.selectedFrom() !== g.continueFrom) {
        this.selectedFrom.set(g.continueFrom);
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

  // ---- Felder lesen --------------------------------------------------------
  protected row(i: number): number {
    return Math.floor(i / SIZE);
  }

  protected isDark(i: number): boolean {
    return (this.row(i) + (i % SIZE)) % 2 === 1;
  }

  protected pieceColor(i: number): DameColor | null {
    const c = this.game()?.board[i] ?? '';
    if (!c) return null;
    return c.toLowerCase() === 'w' ? 'white' : 'black';
  }

  protected isKing(i: number): boolean {
    const c = this.game()?.board[i] ?? '';
    return c === 'W' || c === 'B';
  }

  protected isSource(i: number): boolean {
    return this.sources().has(i);
  }

  protected isTarget(i: number): boolean {
    return this.targets().has(i);
  }

  protected isSelected(i: number): boolean {
    return this.selectedFrom() === i;
  }

  protected isLast(i: number): boolean {
    const lm = this.game()?.lastMove;
    return !!lm && (lm.from === i || lm.to === i);
  }

  // ---- Interaktion ---------------------------------------------------------
  protected tapSquare(i: number): void {
    if (!this.svc.isMyTurn()) return;
    const sel = this.selectedFrom();
    if (sel !== null && this.targets().has(i)) {
      this.svc.move(sel, i);
      this.selectedFrom.set(null);
      return;
    }
    if (this.sources().has(i)) {
      this.selectedFrom.set(sel === i ? null : i);
    } else {
      this.selectedFrom.set(null);
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
