import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { BoardComponent } from '../board/board';
import { GameService } from '../game.service';
import { CellView, FLEET, GRID_SIZE, PlacedShip, ShipSpec } from '../models';

type Orient = 'h' | 'v';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [BoardComponent, TranslocoModule],
  templateUrl: './setup.html',
  styleUrl: './setup.css',
})
export class SetupComponent {
  readonly game = inject(GameService);
  readonly fleet = FLEET;

  /** specId -> belegte Felder ("x,y") */
  private readonly placed = signal<Record<string, string[]>>({});
  readonly orient = signal<Orient>('h');
  readonly flash = signal<string | null>(null);

  readonly nextSpec = computed<ShipSpec | null>(
    () => FLEET.find((s) => !this.placed()[s.id]) ?? null,
  );
  readonly allPlaced = computed(() => this.nextSpec() === null);

  private occupied = computed<Set<string>>(() => {
    const set = new Set<string>();
    for (const cells of Object.values(this.placed())) {
      cells.forEach((c) => set.add(c));
    }
    return set;
  });

  readonly rows = computed<CellView[][]>(() => {
    const occ = this.occupied();
    const grid: CellView[][] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      const row: CellView[] = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        row.push({ state: occ.has(`${x},${y}`) ? 'ship' : 'water' });
      }
      grid.push(row);
    }
    return grid;
  });

  toggleOrient() {
    this.orient.set(this.orient() === 'h' ? 'v' : 'h');
  }

  onCell(c: { x: number; y: number }) {
    const key = `${c.x},${c.y}`;
    // Auf bestehendes Schiff getippt? -> wegnehmen
    const map = { ...this.placed() };
    for (const [id, cells] of Object.entries(map)) {
      if (cells.includes(key)) {
        delete map[id];
        this.placed.set(map);
        return;
      }
    }
    const spec = this.nextSpec();
    if (!spec) {
      this.warn('setup.warnAllPlaced');
      return;
    }
    const cells = this.cellsFor(c.x, c.y, spec.size, this.orient());
    if (!cells) {
      this.warn('setup.warnNoFit');
      return;
    }
    map[spec.id] = cells;
    this.placed.set(map);
    this.flash.set(null);
  }

  /** Liefert die Felder oder null, falls außerhalb / überlappend. */
  private cellsFor(x: number, y: number, size: number, orient: Orient, occ = this.occupied()): string[] | null {
    const cells: string[] = [];
    for (let i = 0; i < size; i++) {
      const cx = orient === 'h' ? x + i : x;
      const cy = orient === 'v' ? y + i : y;
      if (cx >= GRID_SIZE || cy >= GRID_SIZE) return null;
      const key = `${cx},${cy}`;
      if (occ.has(key)) return null;
      cells.push(key);
    }
    return cells;
  }

  randomize() {
    const map: Record<string, string[]> = {};
    const occ = new Set<string>();
    for (const spec of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 300 && !placed; tries++) {
        const orient: Orient = Math.random() < 0.5 ? 'h' : 'v';
        const x = Math.floor(Math.random() * GRID_SIZE);
        const y = Math.floor(Math.random() * GRID_SIZE);
        const cells = this.cellsFor(x, y, spec.size, orient, occ);
        if (cells) {
          cells.forEach((c) => occ.add(c));
          map[spec.id] = cells;
          placed = true;
        }
      }
    }
    this.placed.set(map);
    this.flash.set(null);
  }

  clear() {
    this.placed.set({});
    this.flash.set(null);
  }

  ready() {
    const ships: PlacedShip[] = FLEET.filter((s) => this.placed()[s.id]).map((s) => ({
      specId: s.id,
      size: s.size,
      cells: this.placed()[s.id],
    }));
    if (ships.length !== FLEET.length) return;
    this.game.submitFleet(ships);
  }

  leave() {
    this.game.askLeave();
  }

  private warn(msg: string) {
    this.flash.set(msg);
    setTimeout(() => this.flash.set(null), 1500);
  }
}
