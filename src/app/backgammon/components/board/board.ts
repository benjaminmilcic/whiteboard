import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from '../../game/game.service';
import { EffectsService } from '../../../memory/effects/effects.service';
import { DraggableDirective } from '../../../shared/draggable.directive';
import type { BgColor } from '../../game/game.types';

type Outcome = 'win' | 'lose';

// Sichtbare Anordnung der 24 Punkte (Index ins board-Array).
// Oben links → oben rechts, unten links → unten rechts.
const TOP_LEFT = [12, 13, 14, 15, 16, 17];
const TOP_RIGHT = [18, 19, 20, 21, 22, 23];
const BOTTOM_LEFT = [11, 10, 9, 8, 7, 6];
const BOTTOM_RIGHT = [5, 4, 3, 2, 1, 0];

// Augen-Muster für die Würfel (3×3-Raster, true = Punkt sichtbar).
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

@Component({
  selector: 'app-bg-board',
  standalone: true,
  imports: [NgTemplateOutlet, TranslocoModule, DraggableDirective],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BgBoard implements OnDestroy {
  protected readonly svc = inject(GameService);
  private readonly effects = inject(EffectsService);
  protected readonly game = this.svc.game;

  protected readonly topLeft = TOP_LEFT;
  protected readonly topRight = TOP_RIGHT;
  protected readonly bottomLeft = BOTTOM_LEFT;
  protected readonly bottomRight = BOTTOM_RIGHT;

  /** Aktuell angetippter Stein als Startpunkt (-1 = Bar). */
  protected readonly selectedFrom = signal<number | null>(null);

  private effectsShown = false;
  private passTimer: ReturnType<typeof setTimeout> | null = null;

  /** Felder, von denen aus gezogen werden darf. */
  protected readonly sources = computed<Set<number>>(() => new Set(this.svc.legalSources()));

  /** Mögliche Ziele für den gewählten Stein: Zielpunkt → Würfelwert. */
  protected readonly targets = computed<Map<number, number>>(() => {
    const f = this.selectedFrom();
    const m = new Map<number, number>();
    if (f === null) return m;
    for (const mv of this.svc.targetsFrom(f)) m.set(mv.to, mv.die);
    return m;
  });

  protected readonly currentName = computed<string>(() => this.svc.currentPlayer()?.name ?? '');

  protected readonly outcome = computed<Outcome | null>(() => {
    const g = this.game();
    if (!g || g.status !== 'finished') return null;
    return g.winnerId === this.svc.playerId ? 'win' : 'lose';
  });

  constructor() {
    // Auswahl zurücksetzen, sobald sich der Zustand ändert und sie ungültig wird.
    effect(() => {
      const g = this.game();
      if (!g || !this.svc.isMyTurn() || !g.rolled) {
        if (this.selectedFrom() !== null) this.selectedFrom.set(null);
      }
    });

    // Sieg/Niederlage-Effekte am Spielende.
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

    // Kein Zug möglich → nach 5 Sekunden automatisch an den nächsten Spieler.
    effect(() => {
      if (this.svc.noMoves()) {
        if (this.passTimer === null) {
          this.passTimer = setTimeout(() => {
            this.passTimer = null;
            this.svc.passTurn();
          }, 5000);
        }
      } else {
        this.clearPassTimer();
      }
    });
  }

  ngOnDestroy(): void {
    this.effects.stop();
    this.clearPassTimer();
  }

  private clearPassTimer(): void {
    if (this.passTimer !== null) {
      clearTimeout(this.passTimer);
      this.passTimer = null;
    }
  }

  // ---- Felder lesen --------------------------------------------------------
  protected countAt(i: number): number {
    return Math.abs(this.game()?.board[i] ?? 0);
  }

  protected colorAt(i: number): BgColor | null {
    const v = this.game()?.board[i] ?? 0;
    return v > 0 ? 'white' : v < 0 ? 'black' : null;
  }

  /** Bis zu 5 Steine zeichnen; der Rest wird als Zahl angezeigt. */
  protected discs(i: number): number[] {
    return Array.from({ length: Math.min(this.countAt(i), 5) }, (_, k) => k);
  }

  /** Zahl für „mehr als 5 Steine", sonst 0. */
  protected overflow(i: number): number {
    const c = this.countAt(i);
    return c > 5 ? c : 0;
  }

  protected darkTriangle(i: number): boolean {
    return i % 2 === 0;
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

  // ---- Bar / Herausspielen -------------------------------------------------
  /** Hilfsbereich 0…n-1 für *@for*. */
  protected range(n: number): number[] {
    return Array.from({ length: Math.min(n, 5) }, (_, k) => k);
  }

  protected barCount(color: BgColor): number {
    const g = this.game();
    if (!g) return 0;
    return color === 'white' ? g.barWhite : g.barBlack;
  }

  protected offCount(color: BgColor): number {
    const g = this.game();
    if (!g) return 0;
    return color === 'white' ? g.offWhite : g.offBlack;
  }

  protected barIsSource(): boolean {
    return this.sources().has(-1);
  }

  protected offIsTarget(): boolean {
    return this.targets().has(-1);
  }

  // ---- Würfel --------------------------------------------------------------
  protected pips(value: number): boolean[] {
    const on = PIPS[value] ?? [];
    return Array.from({ length: 9 }, (_, k) => on.includes(k));
  }

  // ---- Interaktion ---------------------------------------------------------
  protected tapPoint(i: number): void {
    if (!this.svc.isMyTurn()) return;
    const sel = this.selectedFrom();
    if (sel !== null) {
      const die = this.targets().get(i);
      if (die !== undefined) {
        this.svc.move(sel, i, die);
        this.selectedFrom.set(null);
        return;
      }
    }
    if (this.sources().has(i)) {
      this.selectedFrom.set(sel === i ? null : i);
    } else {
      this.selectedFrom.set(null);
    }
  }

  protected tapBar(): void {
    if (!this.svc.isMyTurn()) return;
    if (this.barIsSource()) {
      this.selectedFrom.set(this.selectedFrom() === -1 ? null : -1);
    }
  }

  protected tapOff(): void {
    if (!this.svc.isMyTurn()) return;
    const sel = this.selectedFrom();
    if (sel === null) return;
    const die = this.targets().get(-1);
    if (die !== undefined) {
      this.svc.move(sel, -1, die);
      this.selectedFrom.set(null);
    }
  }

  protected roll(): void {
    this.svc.roll();
  }

  protected pass(): void {
    this.clearPassTimer();
    this.svc.passTurn();
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
