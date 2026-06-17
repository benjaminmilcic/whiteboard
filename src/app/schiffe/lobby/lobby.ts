import { Component, inject, OnInit, signal } from '@angular/core';
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
export class LobbyComponent implements OnInit {
  readonly game = inject(GameService);
  readonly avatars = AVATARS;
  readonly name = signal('');
  readonly emoji = signal(AVATARS[0]);
  readonly code = signal('');

  ngOnInit(): void {
    // Gemerkten Namen/Avatar vorbelegen, damit man sie nicht neu eingeben muss.
    this.name.set(this.game.savedName);
    const emoji = this.game.savedEmoji;
    if (emoji && AVATARS.includes(emoji)) this.emoji.set(emoji);
  }

  create() {
    this.game.createGame(this.name(), this.emoji());
  }

  join() {
    this.game.joinGame(this.code(), this.name(), this.emoji());
  }
}
