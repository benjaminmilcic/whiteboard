import { Component, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { GameService } from '../game.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [TranslocoModule],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialogComponent {
  readonly game = inject(GameService);
}
