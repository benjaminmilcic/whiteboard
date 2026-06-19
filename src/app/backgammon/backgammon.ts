import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { BgHome } from './components/home/home';
import { BgBoard } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

@Component({
  selector: 'app-backgammon',
  standalone: true,
  imports: [BgHome, BgBoard, LanguageSwitcherComponent, TranslocoModule],
  templateUrl: './backgammon.html',
  styleUrl: './backgammon.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackgammonComponent {
  private router = inject(Router);
  protected readonly svc = inject(GameService);
  protected readonly game = this.svc.game;

  /** Zurück zur Start-Auswahl. */
  goHome() {
    this.router.navigate(['/']);
  }

  /** Laufendes Spiel verlassen (oben in der Buttonleiste). */
  endGame() {
    this.svc.leaveGame();
  }
}
