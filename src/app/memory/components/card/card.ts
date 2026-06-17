import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Motif } from '../motif/motif';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [Motif],
  templateUrl: './card.html',
  styleUrl: './card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Card {
  readonly motifId = input.required<string>();
  /** Karte liegt offen (umgedreht oder bereits gefunden). */
  readonly faceUp = input<boolean>(false);
  /** Paar wurde bereits gefunden. */
  readonly matched = input<boolean>(false);
  /** Ich habe dieses Paar gefunden (für die Farbmarkierung). */
  readonly mine = input<boolean>(false);
  /** Karte ist aktuell anklickbar. */
  readonly clickable = input<boolean>(false);

  readonly flip = output<void>();

  protected onClick(): void {
    if (this.clickable()) {
      this.flip.emit();
    }
  }
}
