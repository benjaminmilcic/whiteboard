import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-puzzle',
  standalone: true,
  imports: [],
  templateUrl: './puzzle.html',
  styleUrl: './puzzle.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PuzzleComponent {
  private router = inject(Router);

  /** Zurück zur Start-Auswahl. */
  goHome() {
    this.router.navigate(['/']);
  }
}
