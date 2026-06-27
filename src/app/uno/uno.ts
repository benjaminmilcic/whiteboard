import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { UnoHome } from './components/home/home';
import { UnoBoard } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

@Component({
  selector: 'app-uno',
  standalone: true,
  imports: [UnoHome, UnoBoard, LanguageSwitcherComponent, TranslocoModule],
  templateUrl: './uno.html',
  styleUrl: './uno.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnoComponent {
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
