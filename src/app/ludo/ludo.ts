import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { LudoHome } from './components/home/home';
import { LudoBoard } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

@Component({
  selector: 'app-ludo',
  standalone: true,
  imports: [LudoHome, LudoBoard, LanguageSwitcherComponent, TranslocoModule],
  templateUrl: './ludo.html',
  styleUrl: './ludo.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LudoComponent {
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
