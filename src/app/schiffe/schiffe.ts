import { Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { BattleComponent } from './battle/battle';
import { ConfirmDialogComponent } from './confirm-dialog/confirm-dialog';
import { GameService } from './game.service';
import { LanguageSwitcherComponent } from './language-switcher/language-switcher';
import { LobbyComponent } from './lobby/lobby';
import { ResultComponent } from './result/result';
import { SetupComponent } from './setup/setup';
import { DraggableDirective } from '../shared/draggable.directive';

type View = 'loading' | 'lobby' | 'waiting' | 'setup' | 'waitOpponent' | 'battle' | 'finished';

@Component({
  selector: 'app-schiffe',
  standalone: true,
  imports: [
    LobbyComponent,
    SetupComponent,
    BattleComponent,
    ResultComponent,
    ConfirmDialogComponent,
    LanguageSwitcherComponent,
    TranslocoModule,
    DraggableDirective,
  ],
  templateUrl: './schiffe.html',
  styleUrl: './schiffe.css',
})
export class SchiffeComponent implements OnInit {
  readonly game = inject(GameService);
  private router = inject(Router);

  ngOnInit() {
    this.game.init();
  }

  /** Zurück zur Start-Auswahl (Whiteboard oder Schiffe). */
  goHome() {
    this.router.navigate(['/']);
  }

  readonly view = computed<View>(() => {
    if (!this.game.uid()) return 'loading';
    const g = this.game.game();
    if (!g) return 'lobby';
    switch (g.status) {
      case 'waiting':
        return 'waiting';
      case 'setup':
        return this.game.me()?.ready ? 'waitOpponent' : 'setup';
      case 'battle':
        return 'battle';
      case 'finished':
        return 'finished';
      default:
        return 'lobby';
    }
  });
}
