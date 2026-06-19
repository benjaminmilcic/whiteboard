import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { SchachHome } from './components/home/home';
import { SchachBoard } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

@Component({
  selector: 'app-schach',
  standalone: true,
  imports: [SchachHome, SchachBoard, LanguageSwitcherComponent, TranslocoModule],
  templateUrl: './schach.html',
  styleUrl: './schach.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchachComponent {
  private router = inject(Router);
  protected readonly svc = inject(GameService);
  protected readonly game = this.svc.game;

  goHome() {
    this.router.navigate(['/']);
  }

  endGame() {
    this.svc.leaveGame();
  }
}
