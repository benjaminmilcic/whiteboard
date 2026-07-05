import { Component, ViewContainerRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { WakeLockService } from './shared/wake-lock.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Haelt den Bildschirm systemweit (alle Apps/Routen) an, damit Tablets ihn
  // waehrend der Nutzung nicht abdunkeln.
  private wakeLock = inject(WakeLockService);
  private transloco = inject(TranslocoService);

  // Von ngx-color-picker genutzt (cpUseRootViewContainer), damit der Picker
  // an den Root gehängt und nicht von überlaufenden Containern abgeschnitten wird.
  constructor(public vcRef: ViewContainerRef) {
    this.applyLangFromUrl();
    this.wakeLock.start();
  }

  // Setzt die Startsprache aus dem ?lang=-Parameter der URL (de, en, hr, zh).
  // Ohne gueltigen Parameter bleibt die in app.config voreingestellte Sprache (hr).
  private applyLangFromUrl() {
    const lang = new URLSearchParams(window.location.search).get('lang');
    if (lang && this.transloco.getAvailableLangs().some((l) => (typeof l === 'string' ? l : l.id) === lang)) {
      this.transloco.setActiveLang(lang);
    }
  }
}
