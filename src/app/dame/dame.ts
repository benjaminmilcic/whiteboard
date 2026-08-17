import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { DameHome } from './components/home/home';
import { DameBoard } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';
import { SyncStatusComponent } from '../shared/sync-status/sync-status';

@Component({
  selector: 'app-dame',
  standalone: true,
  imports: [DameHome, DameBoard, LanguageSwitcherComponent, SyncStatusComponent, TranslocoModule],
  templateUrl: './dame.html',
  styleUrl: './dame.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DameComponent {
  private router = inject(Router);
  protected readonly svc = inject(GameService);
  protected readonly game = this.svc.game;
  constructor() {
    // Nach einem Neuladen (oder wenn Android den Tab verworfen hat) direkt
    // zurück ins laufende Spiel, statt auf dem Startbildschirm zu landen.
    void this.svc.resume();
  }

  goHome() {
    this.router.navigate(['/']);
  }

  endGame() {
    this.svc.leaveGame();
  }
}
