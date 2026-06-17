import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent {
  private router = inject(Router);

  go(target: 'whiteboard' | 'schiffe' | 'memory' | 'connect4') {
    this.router.navigate([target]);
  }
}
