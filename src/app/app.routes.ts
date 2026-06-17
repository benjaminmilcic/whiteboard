import { Routes } from '@angular/router';
import { HomeComponent } from './home/home';
import { Whiteboard } from './whiteboard/whiteboard';
import { SchiffeComponent } from './schiffe/schiffe';
import { MemoryComponent } from './memory/memory';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'whiteboard', component: Whiteboard },
  { path: 'schiffe', component: SchiffeComponent },
  { path: 'memory', component: MemoryComponent },
  { path: '**', redirectTo: '' },
];
