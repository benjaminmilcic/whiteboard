import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { MillHome } from './components/home/home';
import { MillBoard } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

@Component({
  selector: 'app-mill',
  standalone: true,
  imports: [MillHome, MillBoard, LanguageSwitcherComponent, TranslocoModule],
  templateUrl: './mill.html',
  styleUrl: './mill.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MillComponent {
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
