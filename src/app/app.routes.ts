import { Routes } from '@angular/router';
import { HomeComponent } from './home/home';
import { Whiteboard } from './whiteboard/whiteboard';
import { SchiffeComponent } from './schiffe/schiffe';
import { MemoryComponent } from './memory/memory';
import { Connect4Component } from './connect4/connect4';
import { BackgammonComponent } from './backgammon/backgammon';
import { PuzzleComponent } from './puzzle/puzzle';
import { HangmanComponent } from './hangman/hangman';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'whiteboard', component: Whiteboard },
  { path: 'schiffe', component: SchiffeComponent },
  { path: 'memory', component: MemoryComponent },
  { path: 'connect4', component: Connect4Component },
  { path: 'backgammon', component: BackgammonComponent },
  { path: 'puzzle', component: PuzzleComponent },
  { path: 'hangman', component: HangmanComponent },
  { path: '**', redirectTo: '' },
];
