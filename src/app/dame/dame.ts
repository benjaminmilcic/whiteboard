import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from './game/game.service';
import { DameHome } from './components/home/home';
import { DameBoard } from './components/board/board';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

@Component({
  selector: 'app-dame',
  standalone: true,
  imports: [DameHome, DameBoard, LanguageSwitcherComponent, TranslocoModule],
  templateUrl: './dame.html',
  styleUrl: './dame.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DameComponent {
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
