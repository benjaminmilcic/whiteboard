import { Component, computed, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { BoardComponent } from '../board/board';
import { GameService } from '../game.service';
import { CellView, GRID_SIZE, PlacedShip, ShotResult } from '../models';

@Component({
  selector: 'app-battle',
  standalone: true,
  imports: [BoardComponent, TranslocoModule],
  templateUrl: './battle.html',
  styleUrl: './battle.css',
})
export class BattleComponent {
  readonly game = inject(GameService);

  private myFleet = computed<PlacedShip[]>(() => {
    const g = this.game.game();
    const id = this.game.uid();
    return g && id ? g.fleets[id] ?? [] : [];
  });

  private enemyFleet = computed<PlacedShip[]>(() => {
    const g = this.game.game();
    const id = this.game.opponentId();
    return g && id ? g.fleets[id] ?? [] : [];
  });

  private myShots = computed<Record<string, ShotResult>>(() => {
    const g = this.game.game();
    const id = this.game.uid();
    return g && id ? g.shots[id] ?? {} : {};
  });

  private enemyShots = computed<Record<string, ShotResult>>(() => {
    const g = this.game.game();
    const id = this.game.opponentId();
    return g && id ? g.shots[id] ?? {} : {};
  });

  readonly totalShips = computed(() => this.enemyFleet().length || this.myFleet().length);
  readonly enemySunk = computed(() => this.countSunk(this.enemyFleet(), this.myShots()));
  readonly myAlive = computed(
    () => this.myFleet().length - this.countSunk(this.myFleet(), this.enemyShots()),
  );

  /** Feld auf dem ich schieße: nur meine Treffer/Fehlschüsse sind sichtbar. */
  readonly enemyRows = computed<CellView[][]>(() => {
    const shots = this.myShots();
    const sunk = this.sunkCells(this.enemyFleet(), shots);
    return this.buildGrid((key) => {
      const r = shots[key];
      if (r === 'hit') return sunk.has(key) ? 'sunk' : 'hit';
      if (r === 'miss') return 'miss';
      return 'water';
    });
  });

  /** Mein Feld: meine Schiffe + die Schüsse des Gegners auf mich. */
  readonly myRows = computed<CellView[][]>(() => {
    const shots = this.enemyShots();
    const fleet = this.myFleet();
    const shipCells = new Set(fleet.flatMap((s) => s.cells));
    const sunk = this.sunkCells(fleet, shots);
    return this.buildGrid((key) => {
      const r = shots[key];
      if (r === 'hit') return sunk.has(key) ? 'sunk' : 'hit';
      if (r === 'miss') return 'miss';
      return shipCells.has(key) ? 'ship' : 'water';
    });
  });

  shoot(c: { x: number; y: number }) {
    if (this.game.isMyTurn()) this.game.shoot(c.x, c.y);
  }

  leave() {
    this.game.askLeave();
  }

  // ---- Helfer ----
  private buildGrid(stateFor: (key: string) => CellView['state']): CellView[][] {
    const grid: CellView[][] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      const row: CellView[] = [];
      for (let x = 0; x < GRID_SIZE; x++) row.push({ state: stateFor(`${x},${y}`) });
      grid.push(row);
    }
    return grid;
  }

  private sunkCells(fleet: PlacedShip[], shots: Record<string, ShotResult>): Set<string> {
    const set = new Set<string>();
    for (const ship of fleet) {
      if (ship.cells.every((c) => shots[c] === 'hit')) {
        ship.cells.forEach((c) => set.add(c));
      }
    }
    return set;
  }

  private countSunk(fleet: PlacedShip[], shots: Record<string, ShotResult>): number {
    return fleet.filter((s) => s.cells.every((c) => shots[c] === 'hit')).length;
  }
}
