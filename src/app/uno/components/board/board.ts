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
import type { UnoCard, UnoColor } from '../../game/game.types';

type Outcome = 'win' | 'lose';

@Component({
  selector: 'app-uno-board',
  standalone: true,
  imports: [TranslocoModule, DraggableDirective],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnoBoard implements OnDestroy {
  protected readonly svc = inject(GameService);
  private readonly effects = inject(EffectsService);
  protected readonly game = this.svc.game;

  /** Auswahlfarben für den Joker (Reihenfolge = Anzeige). */
  protected readonly pickColors: UnoColor[] = ['r', 'y', 'g', 'b'];
  /** Id der gerade getippten Joker-Karte, für die eine Farbe gewählt wird. */
  protected readonly pendingWild = signal<string | null>(null);

  private effectsShown = false;

  protected readonly currentName = computed<string>(() => this.svc.currentPlayer()?.name ?? '');

  protected readonly outcome = computed<Outcome | null>(() => {
    const g = this.game();
    if (!g || g.status !== 'finished') return null;
    return g.winnerId === this.svc.playerId ? 'win' : 'lose';
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

  // ---- Kartendarstellung ---------------------------------------------------
  /** Mittiger Text einer Karte. */
  protected label(card: UnoCard): string {
    switch (card.value) {
      case 'skip':
        return '🚫';
      case 'rev':
        return '🔁';
      case 'd2':
        return '+2';
      case 'wild':
        return '🌈';
      case 'd4':
        return '+4';
      default:
        return card.value; // 0–9
    }
  }

  /** Kleinerer Eck-Text einer Karte (Zahl/Kürzel). */
  protected corner(card: UnoCard): string {
    switch (card.value) {
      case 'skip':
        return '⦸';
      case 'rev':
        return '⇄';
      case 'd2':
        return '+2';
      case 'wild':
        return '★';
      case 'd4':
        return '+4';
      default:
        return card.value;
    }
  }

  protected isPlayable(card: UnoCard): boolean {
    const g = this.game();
    if (!g || !this.svc.isMyTurn()) return false;
    return this.svc.isPlayable(card, this.svc.topCard(), g.currentColor);
  }

  // ---- Aktionen ------------------------------------------------------------
  protected onCardClick(card: UnoCard): void {
    if (!this.isPlayable(card)) return;
    if (card.color === 'w') {
      this.pendingWild.set(card.id); // Farbwahl-Overlay öffnen
      return;
    }
    this.svc.playCard(card.id);
  }

  protected chooseColor(color: UnoColor): void {
    const id = this.pendingWild();
    this.pendingWild.set(null);
    if (id) this.svc.playCard(id, color);
  }

  protected cancelWild(): void {
    this.pendingWild.set(null);
  }

  protected onDraw(): void {
    if (!this.svc.isMyTurn()) return;
    this.svc.drawCard();
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
