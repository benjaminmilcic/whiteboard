import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import type { AwayPlayer } from '../game-channel';

/**
 * Zeigt an, wenn die Verbindung zum Spiel nicht steht oder ein Zug nicht
 * gespeichert werden konnte.
 *
 * Vorher war so etwas nirgends sichtbar: die Fehlermeldung der Spiele wurde
 * ausschliesslich auf dem Startbildschirm gerendert. Wer schon im Spiel war,
 * bekam von einem Verbindungsverlust nichts mit – das Brett blieb einfach
 * stehen und beide Spieler warteten aufeinander.
 *
 * Wird in der Huelle jedes Spiels eingebunden, gilt also fuer Start- UND
 * Spielansicht.
 */
@Component({
  selector: 'app-sync-status',
  standalone: true,
  imports: [TranslocoModule],
  templateUrl: './sync-status.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncStatusComponent {
  /** Verbindung ist laenger weg (kurze Aussetzer werden nicht gemeldet). */
  readonly offline = input(false);
  /** Meldung aus dem Spiel-Service, z. B. "Zug wurde nicht gespeichert". */
  readonly error = input<string | null>(null);
  /** Ein Zug ist unterwegs und dauert auffaellig lange. */
  readonly pending = input(false);
  /** Mitspieler, die gerade nicht verbunden sind. */
  readonly away = input<AwayPlayer[]>([]);

  /** Namen der Abwesenden, fertig fuer die Meldung. */
  protected readonly awayNames = computed(() =>
    this.away()
      .map((p) => p.name)
      .filter(Boolean)
      .join(', '),
  );

  /** Hinweis wegklicken. */
  readonly dismissed = output<void>();
  /** Stand neu vom Server holen. */
  readonly retried = output<void>();
}
