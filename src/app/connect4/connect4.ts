import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { C4Home } from './components/home/home';
import { C4Board } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

@Component({
  selector: 'app-connect4',
  standalone: true,
  imports: [C4Home, C4Board, LanguageSwitcherComponent, TranslocoModule],
  templateUrl: './connect4.html',
  styleUrl: './connect4.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Connect4Component {
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
