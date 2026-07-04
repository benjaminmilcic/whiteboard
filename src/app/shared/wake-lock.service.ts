import { Injectable, OnDestroy } from '@angular/core';

/**
 * Haelt systemweit den Bildschirm an, solange die App geoeffnet ist, damit
 * Tablets/Smartphones ihn beim Nutzen nicht abdunkeln oder sperren.
 *
 * Einmalig in der Root-Komponente (App) aktivieren – gilt dann fuer alle
 * Routen/Spiele. Benoetigt eine sichere Umgebung (HTTPS oder localhost);
 * wird der Wake Lock nicht unterstuetzt oder verweigert, passiert nichts.
 */
@Injectable({ providedIn: 'root' })
export class WakeLockService implements OnDestroy {
  private wakeLock: WakeLockSentinel | null = null;
  private active = false;

  /** Startet den Wake Lock und haelt ihn ueber Tab-Wechsel hinweg aktiv. */
  start(): void {
    if (this.active) return;
    this.active = true;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    void this.request();
  }

  /** Gibt den Wake Lock frei und stoppt das automatische Wiederanfordern. */
  stop(): void {
    this.active = false;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    void this.release();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private onVisibilityChange = (): void => {
    // Der Browser gibt den Lock frei, sobald der Tab in den Hintergrund geht;
    // beim Zurueckkehren muss er neu angefordert werden.
    if (this.active && document.visibilityState === 'visible') {
      void this.request();
    }
  };

  private async request(): Promise<void> {
    if (!('wakeLock' in navigator) || this.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch {
      // Kein Wake Lock moeglich (z. B. Akkusparmodus) – nicht kritisch.
      this.wakeLock = null;
    }
  }

  private async release(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      /* ignorieren */
    }
    this.wakeLock = null;
  }
}
