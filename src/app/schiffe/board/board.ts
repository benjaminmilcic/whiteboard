import { Component, input, output } from '@angular/core';
import { CellView, GRID_SIZE } from '../models';

@Component({
  selector: 'app-board',
  standalone: true,
  templateUrl: './board.html',
  styleUrl: './board.css',
})
export class BoardComponent {
  readonly rows = input.required<CellView[][]>();
  readonly interactive = input<boolean>(false);
  readonly cellClick = output<{ x: number; y: number }>();

  readonly size = GRID_SIZE;
  readonly letters = Array.from({ length: GRID_SIZE }, (_, i) =>
    String.fromCharCode(65 + i),
  );

  locked(cell: CellView): boolean {
    return cell.state === 'hit' || cell.state === 'miss' || cell.state === 'sunk';
  }

  content(cell: CellView): string {
    switch (cell.state) {
      case 'hit':
        return '💥';
      case 'sunk':
        return '🔥';
      case 'miss':
        return '💧';
      case 'ship':
        return '🚢';
      default:
        return '';
    }
  }

  cellClass(cell: CellView): string {
    const clickable = this.interactive() && !this.locked(cell);
    switch (cell.state) {
      case 'ship':
        return 'bg-slate-500 text-white shadow-inner' + (clickable ? ' cursor-pointer hover:bg-slate-600' : '');
      case 'hit':
        return 'bg-red-500 animate-bumm';
      case 'sunk':
        return 'bg-slate-800 animate-bumm';
      case 'miss':
        return 'bg-sky-100 text-sky-400';
      case 'preview':
        return 'bg-emerald-400 text-white';
      case 'invalid':
        return 'bg-rose-400 text-white';
      default:
        return 'bg-sky-300 shadow-inner' + (clickable ? ' cursor-pointer hover:bg-sky-400 active:scale-95' : '');
    }
  }
}
