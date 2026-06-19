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
import type { ChessColor } from '../../game/game.types';

type Outcome = 'win' | 'lose' | 'draw';

const GLYPH: Record<string, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

@Component({
  selector: 'app-schach-board',
  standalone: true,
  imports: [TranslocoModule, DraggableDirective],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchachBoard implements OnDestroy {
  protected readonly svc = inject(GameService);
  private readonly effects = inject(EffectsService);
  protected readonly game = this.svc.game;

  protected readonly selectedFrom = signal<number | null>(null);

  private effectsShown = false;

  /** Reihenfolge der Felder beim Zeichnen – für Schwarz um 180° gedreht. */
  protected readonly view = computed<number[]>(() => {
    const flip = this.svc.myColor() === 'black';
    return Array.from({ length: 64 }, (_, i) => (flip ? 63 - i : i));
  });

  protected readonly sources = computed<Set<number>>(() => new Set(this.svc.legalSources()));

  protected readonly targets = computed<Set<number>>(() => {
    const f = this.selectedFrom();
    if (f === null) return new Set<number>();
    return new Set(this.svc.targetsFrom(f));
  });

  protected readonly currentName = computed<string>(() => this.svc.currentPlayer()?.name ?? '');

  /** Feld des Königs, der gerade im Schach steht (oder -1). */
  protected readonly checkSquare = computed<number>(() => {
    const g = this.game();
    if (!g || !g.check) return -1;
    const color = this.svc.currentPlayer()?.color;
    return color ? this.svc.kingSquare(color) : -1;
  });

  protected readonly outcome = computed<Outcome | null>(() => {
    const g = this.game();
    if (!g || g.status !== 'finished') return null;
    if (g.winnerId === 'draw') return 'draw';
    return g.winnerId === this.svc.playerId ? 'win' : 'lose';
  });

  constructor() {
    effect(() => {
      if (!this.svc.isMyTurn() && this.selectedFrom() !== null) this.selectedFrom.set(null);
    });

    effect(() => {
      const finished = this.game()?.status === 'finished';
      if (finished && !this.effectsShown) {
        this.effectsShown = true;
        const o = this.outcome();
        if (o === 'win') this.effects.celebrate();
        else if (o === 'lose') this.effects.commiserate();
        else this.effects.draw();
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
  protected isDark(i: number): boolean {
    return (Math.floor(i / 8) + (i % 8)) % 2 === 1;
  }

  protected pieceColor(i: number): ChessColor | null {
    const p = this.game()?.board[i] ?? '';
    if (!p) return null;
    return p === p.toUpperCase() ? 'white' : 'black';
  }

  protected glyph(i: number): string {
    const p = this.game()?.board[i] ?? '';
    return p ? GLYPH[p.toLowerCase()] ?? '' : '';
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

  protected isCheck(i: number): boolean {
    return this.checkSquare() === i;
  }

  /** Reihen-Beschriftung am linken Rand (von oben nach unten), je nach Drehung. */
  protected readonly ranks = computed<number[]>(() => {
    const flip = this.svc.myColor() === 'black';
    return flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  });

  /** Linien-Beschriftung am unteren Rand (von links nach rechts), je nach Drehung. */
  protected readonly files = computed<string[]>(() => {
    const flip = this.svc.myColor() === 'black';
    const f = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    return flip ? f.slice().reverse() : f;
  });

  /** Steht auf dem Zielfeld eine gegnerische Figur (zum Hervorheben als Schlag)? */
  protected isCapture(i: number): boolean {
    return this.isTarget(i) && !!this.game()?.board[i];
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
