import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from '../../game/game.service';
import { CARD_MOTIFS } from '../../data/card-motifs';
import { Motif } from '../motif/motif';

interface Difficulty {
  pairs: number;
  labelKey: string;
  hintKey: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, Motif, TranslocoModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit {
  protected readonly game = inject(GameService);
  protected readonly motifs = CARD_MOTIFS;

  protected readonly difficulties: Difficulty[] = [
    { pairs: 6, labelKey: 'memory.easy', hintKey: 'memory.easyHint' },
    { pairs: 10, labelKey: 'memory.medium', hintKey: 'memory.mediumHint' },
    { pairs: 12, labelKey: 'memory.hard', hintKey: 'memory.hardHint' },
  ];

  protected readonly name = signal('');
  protected readonly avatar = signal(this.motifs[0].id);
  protected readonly pairs = signal(6);
  protected readonly joinCode = signal('');
  protected readonly showJoin = signal(false);

  ngOnInit(): void {
    this.name.set(this.game.savedName);
    this.avatar.set(this.game.savedAvatar);
  }

  protected onName(value: string): void {
    this.name.set(value);
  }

  protected onCode(value: string): void {
    this.joinCode.set(value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4));
  }

  protected nameValid(): boolean {
    return this.name().trim().length >= 1;
  }

  protected async create(): Promise<void> {
    if (!this.nameValid() || this.game.busy()) return;
    try {
      await this.game.createGame(this.name().trim(), this.avatar(), this.pairs());
    } catch {
      /* Fehler wird über game.error angezeigt. */
    }
  }

  protected async join(): Promise<void> {
    if (!this.nameValid() || this.joinCode().length !== 4 || this.game.busy()) return;
    try {
      await this.game.joinGame(this.joinCode(), this.name().trim(), this.avatar());
    } catch {
      /* Fehler wird über game.error angezeigt. */
    }
  }
}
