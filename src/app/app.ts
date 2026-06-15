import { Component, ViewContainerRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Von ngx-color-picker genutzt (cpUseRootViewContainer), damit der Picker
  // an den Root gehängt und nicht von überlaufenden Containern abgeschnitten wird.
  constructor(public vcRef: ViewContainerRef) {}
}
