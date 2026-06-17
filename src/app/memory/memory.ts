import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { Home } from './components/home/home';
import { Board } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

@Component({
  selector: 'app-memory',
  standalone: true,
  imports: [Home, Board, LanguageSwitcherComponent, TranslocoModule],
  templateUrl: './memory.html',
  styleUrl: './memory.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryComponent {
  private router = inject(Router);
  protected readonly svc = inject(GameService);
  protected readonly game = this.svc.game;

  /** Zurück zur Start-Auswahl (Whiteboard, Schiffe oder Memory). */
  goHome() {
    this.router.navigate(['/']);
  }

  /** Laufendes Spiel verlassen (oben in der Buttonleiste). */
  endGame() {
    this.svc.leaveGame();
  }
}
