import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { SchachHome } from './components/home/home';
import { SchachBoard } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';
import { SyncStatusComponent } from '../shared/sync-status/sync-status';

@Component({
  selector: 'app-schach',
  standalone: true,
  imports: [SchachHome, SchachBoard, LanguageSwitcherComponent, SyncStatusComponent, TranslocoModule],
  templateUrl: './schach.html',
  styleUrl: './schach.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchachComponent {
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
