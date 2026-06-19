import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { AVATARS, GameService } from '../../game/game.service';

@Component({
  selector: 'app-dame-home',
  standalone: true,
  imports: [FormsModule, TranslocoModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DameHome implements OnInit {
  protected readonly game = inject(GameService);
  protected readonly avatars = AVATARS;

  protected readonly name = signal('');
  protected readonly emoji = signal(AVATARS[0]);
  protected readonly joinCode = signal('');
  protected readonly showJoin = signal(false);

  ngOnInit(): void {
    this.name.set(this.game.savedName);
    const e = this.game.savedEmoji;
    if (e && AVATARS.includes(e)) this.emoji.set(e);
  }

  protected onName(value: string): void {
    this.name.set(value);
  }

  protected onCode(value: string): void {
    this.joinCode.set(value.replace(/\D/g, '').slice(0, 4));
  }

  protected nameValid(): boolean {
    return this.name().trim().length >= 1;
  }

  protected async create(): Promise<void> {
    if (!this.nameValid() || this.game.busy()) return;
    try {
      await this.game.createGame(this.name().trim(), this.emoji());
    } catch {
      /* Fehler wird über game.error angezeigt. */
    }
  }

  protected async join(): Promise<void> {
    if (!this.nameValid() || this.joinCode().length !== 4 || this.game.busy()) return;
    try {
      await this.game.joinGame(this.joinCode(), this.name().trim(), this.emoji());
    } catch {
      /* Fehler wird über game.error angezeigt. */
    }
  }
}
