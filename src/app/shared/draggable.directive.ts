import { Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/**
 * Macht ein Element mit Maus oder Finger verschiebbar (z. B. einen Ergebnis-Dialog,
 * damit man ihn zur Seite schieben und den letzten Spielstand prüfen kann).
 *
 * Klicks auf Buttons & Co. innerhalb des Elements lösen KEIN Verschieben aus,
 * damit die Knöpfe normal bedienbar bleiben.
 */
@Directive({
  selector: '[appDraggable]',
  standalone: true,
})
export class DraggableDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>).nativeElement;

  private dragging = false;
  private startX = 0;
  private startY = 0;
  private baseX = 0;
  private baseY = 0;

  constructor() {
    this.el.style.touchAction = 'none';
    this.el.style.cursor = 'grab';
    this.el.addEventListener('pointerdown', this.onDown);
  }

  private onDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement;
    // Bedienelemente nicht zum Ziehen verwenden – nur den „leeren" Dialog greifen.
    if (target.closest('button, a, input, select, textarea, label')) return;
    this.dragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.el.style.cursor = 'grabbing';
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const x = this.baseX + (e.clientX - this.startX);
    const y = this.baseY + (e.clientY - this.startY);
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.baseX += e.clientX - this.startX;
    this.baseY += e.clientY - this.startY;
    this.el.style.cursor = 'grab';
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  };

  ngOnDestroy(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }
}
