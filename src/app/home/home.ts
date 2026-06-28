import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [TranslocoModule, LanguageSwitcherComponent],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent {
  private router = inject(Router);

  go(target: 'whiteboard' | 'schiffe' | 'memory' | 'connect4' | 'backgammon' | 'dame' | 'schach' | 'puzzle' | 'hangman' | 'yatzy' | 'uno' | 'ludo' | 'mill') {
    this.router.navigate([target]);
  }
}
