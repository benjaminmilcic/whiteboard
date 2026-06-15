import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from '../game.service';

const AVATARS = ['🦄', '🐙', '🦈', '🐱', '🦖', '🐬', '🦊', '🐸', '🐧', '🦁'];

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [FormsModule, TranslocoModule],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css',
})
export class LobbyComponent {
  readonly game = inject(GameService);
  readonly avatars = AVATARS;
  readonly name = signal('');
  readonly emoji = signal(AVATARS[0]);
  readonly code = signal('');

  create() {
    this.game.createGame(this.name(), this.emoji());
  }

  join() {
    this.game.joinGame(this.code(), this.name(), this.emoji());
  }
}
