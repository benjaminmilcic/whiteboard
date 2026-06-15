import { Component, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  templateUrl: './language-switcher.html',
  styleUrl: './language-switcher.css',
})
export class LanguageSwitcherComponent {
  private transloco = inject(TranslocoService);

  readonly langs = [
    { code: 'hr', label: 'Hrvatski', img: '/flags/hr.svg' },
    { code: 'de', label: 'Deutsch', img: '/flags/de.svg' },
    { code: 'en', label: 'English', img: '/flags/gb.svg' },
  ];

  readonly active = signal(this.transloco.getActiveLang());

  setLang(code: string) {
    this.transloco.setActiveLang(code);
    this.active.set(code);
  }
}
