import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { enableRtdbDebugFromUrl } from './app/shared/rtdb-debug';

// Muss vor dem ersten Datenbankzugriff laufen (siehe rtdb-debug.ts).
enableRtdbDebugFromUrl();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
