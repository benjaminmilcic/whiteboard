import { Component, ViewContainerRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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

  // Von ngx-color-picker genutzt (cpUseRootViewContainer), damit der Picker
  // an den Root gehängt und nicht von überlaufenden Containern abgeschnitten wird.
  constructor(public vcRef: ViewContainerRef) {
    this.wakeLock.start();
  }
}
