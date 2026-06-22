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
import { EffectsService } from '../../../memory/effects/effects.service';
import { DraggableDirective } from '../../../shared/draggable.directive';
import { CATEGORIES, pips, scoreFor, totalsFor, type Category } from '../../game/scoring';

type Outcome = 'win' | 'lose' | 'tie';

@Component({
  selector: 'app-y-board',
  standalone: true,
  imports: [TranslocoModule, DraggableDirective],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YBoard implements OnDestroy {
  protected readonly svc = inject(GameService);
  private readonly effects = inject(EffectsService);
  protected readonly game = this.svc.game;

  protected readonly upperCats = CATEGORIES.filter((c) => c.upper);
  protected readonly lowerCats = CATEGORIES.filter((c) => !c.upper);
  protected readonly diceIdx = [0, 1, 2, 3, 4];

  private effectsShown = false;

  protected readonly myScores = computed(() => this.game()?.scores[this.svc.playerId] ?? {});
  protected readonly oppScores = computed(() => {
    const opp = this.svc.opponent();
    const g = this.game();
    return opp && g ? g.scores[opp.id] ?? {} : {};
  });
  protected readonly myTotals = computed(() => totalsFor(this.myScores()));
  protected readonly oppTotals = computed(() => totalsFor(this.oppScores()));

  protected readonly currentName = computed(() => this.svc.currentPlayer()?.name ?? '');

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

  // ---- Würfel --------------------------------------------------------------
  protected pipsFor(v: number): boolean[] {
    return pips(v);
  }
  protected dieValue(i: number): number {
    return this.game()?.dice[i] ?? 1;
  }
  protected isHeld(i: number): boolean {
    return !!this.game()?.held[i];
  }
  protected rolledThisTurn(): boolean {
    return !!this.game()?.rolledThisTurn;
  }
  protected rollsLeft(): number {
    return this.game()?.rollsLeft ?? 0;
  }
  protected canHold(): boolean {
    return this.svc.isMyTurn() && this.rolledThisTurn() && this.rollsLeft() > 0;
  }

  // ---- Wertungstabelle -----------------------------------------------------
  protected potential(cat: Category): number {
    const g = this.game();
    return g ? scoreFor(cat, g.dice) : 0;
  }
  protected meFilled(cat: Category): boolean {
    return this.myScores()[cat] != null;
  }
  protected oppFilled(cat: Category): boolean {
    return this.oppScores()[cat] != null;
  }
  protected meValue(cat: Category): number | undefined {
    return this.myScores()[cat];
  }
  protected oppValue(cat: Category): number | undefined {
    return this.oppScores()[cat];
  }
  protected canPick(cat: Category): boolean {
    return this.svc.isMyTurn() && this.rolledThisTurn() && !this.meFilled(cat);
  }

  // ---- Aktionen ------------------------------------------------------------
  protected roll(): void {
    this.svc.roll();
  }
  protected hold(i: number): void {
    if (this.canHold()) this.svc.toggleHold(i);
  }
  protected choose(cat: Category): void {
    this.svc.choose(cat);
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
