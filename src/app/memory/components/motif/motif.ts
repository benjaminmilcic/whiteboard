import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CARD_MOTIFS } from '../../data/card-motifs';

const MOTIF_MAP = new Map(CARD_MOTIFS.map((m) => [m.id, m]));

@Component({
  selector: 'app-motif',
  standalone: true,
  templateUrl: './motif.html',
  styleUrl: './motif.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Motif {
  readonly motifId = input.required<string>();

  protected readonly name = computed(() => MOTIF_MAP.get(this.motifId())?.name ?? '');

  protected readonly safeSvg = computed<SafeHtml>(() => {
    const svg = MOTIF_MAP.get(this.motifId())?.svg ?? '';
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });

  constructor(private readonly sanitizer: DomSanitizer) {}
}
