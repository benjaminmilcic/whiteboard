import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { COLS, GameService, ROWS } from '../../game/game.service';
import { EffectsService } from '../../../memory/effects/effects.service';
import type { C4Color } from '../../game/game.types';

type Outcome = 'win' | 'lose' | 'tie';

@Component({
  selector: 'app-c4-board',
  standalone: true,
  imports: [TranslocoModule],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class C4Board implements OnDestroy {
  protected readonly svc = inject(GameService);
  private readonly effects = inject(EffectsService);
  protected readonly game = this.svc.game;

  protected readonly cols = Array.from({ length: COLS }, (_, i) => i);
  protected readonly rows = Array.from({ length: ROWS }, (_, i) => i);

  private effectsShown = false;

  /** Name des Spielers, der gerade am Zug ist. */
  protected readonly currentName = computed<string>(() => this.svc.currentPlayer()?.name ?? '');

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

  /** Index eines Feldes aus Zeile/Spalte. */
  protected idx(row: number, col: number): number {
    return row * COLS + col;
  }

  /** Farbe des Steins in diesem Feld (oder null, wenn leer). */
  protected colorAt(row: number, col: number): C4Color | null {
    const g = this.game();
    const pid = g?.board[this.idx(row, col)];
    if (!g || !pid) return null;
    return g.players[pid]?.color ?? null;
  }

  protected emojiAt(row: number, col: number): string {
    const g = this.game();
    const pid = g?.board[this.idx(row, col)];
    return (g && pid && g.players[pid]?.emoji) || '';
  }

  protected isWin(row: number, col: number): boolean {
    return !!this.game()?.winningCells?.includes(this.idx(row, col));
  }

  protected isLastMove(row: number, col: number): boolean {
    return this.game()?.lastMove === this.idx(row, col);
  }

  /** Darf in diese Spalte geworfen werden? */
  protected canDrop(col: number): boolean {
    const g = this.game();
    if (!g || g.status !== 'playing') return false;
    if (g.currentTurn !== this.svc.playerId) return false;
    return !g.board[this.idx(0, col)]; // oberste Zelle frei?
  }

  protected drop(col: number): void {
    this.svc.drop(col);
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
