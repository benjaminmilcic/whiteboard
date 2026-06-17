import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from '../../game/game.service';
import { EffectsService } from '../../effects/effects.service';
import { Card } from '../card/card';
import { Motif } from '../motif/motif';
import { DraggableDirective } from '../../../shared/draggable.directive';

type Outcome = 'win' | 'lose' | 'tie';

const COLS_BY_PAIRS: Record<number, number> = { 6: 4, 10: 5, 12: 6 };

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [Card, Motif, TranslocoModule, DraggableDirective],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Board implements OnDestroy {
  protected readonly svc = inject(GameService);
  private readonly effects = inject(EffectsService);
  protected readonly game = this.svc.game;

  private effectsShown = false;

  protected readonly cols = computed<number>(() => {
    const g = this.game();
    if (!g) return 4;
    return COLS_BY_PAIRS[g.pairs] ?? Math.ceil(Math.sqrt(g.board.length * 1.6));
  });

  protected readonly ratio = computed<number>(() => {
    const g = this.game();
    if (!g) return 1;
    const cols = this.cols();
    const rows = Math.ceil(g.board.length / cols);
    return cols / rows;
  });

  /** Name des Spielers, der gerade am Zug ist (für den Text in der Kopfzeile). */
  protected readonly currentName = computed<string>(() => {
    const g = this.game();
    if (!g) return '';
    return g.players[g.currentTurn]?.name ?? '';
  });

  /** Ergebnis aus Sicht des Spielers an DIESEM Gerät. */
  protected readonly outcome = computed<Outcome | null>(() => {
    const g = this.game();
    if (!g || g.status !== 'finished') return null;
    if (g.winnerId === 'tie') return 'tie';
    return g.winnerId === this.svc.playerId ? 'win' : 'lose';
  });

  constructor() {
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

  protected faceUp(i: number): boolean {
    const g = this.game();
    if (!g) return false;
    return !!g.board[i]?.matchedBy || (g.flipped ?? []).includes(i);
  }

  protected matched(i: number): boolean {
    return !!this.game()?.board[i]?.matchedBy;
  }

  protected mine(i: number): boolean {
    return this.game()?.board[i]?.matchedBy === this.svc.playerId;
  }

  protected clickable(i: number): boolean {
    const g = this.game();
    if (!g || g.status !== 'playing') return false;
    if (g.currentTurn !== this.svc.playerId) return false;
    const flipped = g.flipped ?? [];
    if (g.resolving || flipped.length >= 2) return false;
    if (g.board[i]?.matchedBy || flipped.includes(i)) return false;
    return true;
  }

  protected onFlip(i: number): void {
    this.svc.flip(i);
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
