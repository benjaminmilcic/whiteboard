import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from '../game.service';
import { EffectsService } from '../effects.service';

@Component({
  selector: 'app-result',
  standalone: true,
  imports: [TranslocoModule],
  templateUrl: './result.html',
  styleUrl: './result.css',
})
export class ResultComponent implements OnInit, OnDestroy {
  readonly game = inject(GameService);
  private readonly effects = inject(EffectsService);

  ngOnInit(): void {
    // Beim Anzeigen des Ergebnisses passende Show + Klang starten.
    if (this.game.amWinner()) {
      this.effects.celebrate();
    } else {
      this.effects.commiserate();
    }
  }

  ngOnDestroy(): void {
    // Feuerwerk/Töne stoppen, wenn der Bildschirm verlassen wird
    // (z.B. „Nochmal spielen" oder „Zurück zum Start").
    this.effects.stop();
  }
}
