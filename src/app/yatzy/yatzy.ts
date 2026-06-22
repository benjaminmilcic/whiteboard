import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { YHome } from './components/home/home';
import { YBoard } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

@Component({
  selector: 'app-yatzy',
  standalone: true,
  imports: [YHome, YBoard, LanguageSwitcherComponent, TranslocoModule],
  templateUrl: './yatzy.html',
  styleUrl: './yatzy.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YatzyComponent {
  private router = inject(Router);
  protected readonly svc = inject(GameService);
  protected readonly game = this.svc.game;

  /** Zurück zur Start-Auswahl. */
  goHome() {
    this.router.navigate(['/']);
  }

  /** Laufendes Spiel verlassen. */
  endGame() {
    this.svc.leaveGame();
  }
}
