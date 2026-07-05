import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { EffectsService } from '../memory/effects/effects.service';
import { DraggableDirective } from '../shared/draggable.directive';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';

type Status = 'idle' | 'playing' | 'over';
export type Level = 'easy' | 'medium' | 'hard';

/** Eine fliegende Kokoš auf dem Spielfeld. */
interface Chicken {
  id: number;
  /** Vertikale Position in Prozent der Spielfeldhöhe. */
  y: number;
  /** Flugrichtung: 1 = nach rechts, -1 = nach links. */
  dir: 1 | -1;
  /** Flugdauer (Sekunden) über die ganze Breite. */
  dur: number;
  /** Emoji-Größe in Pixeln. */
  size: number;
  /** Punkte beim Treffer. */
  points: number;
  /** Seltene goldene Kokoš (mehr Punkte). */
  golden: boolean;
  /** Ist sie schon getroffen? Dann Puff statt Vogel zeigen. */
  hit: boolean;
}

/**
 * Schwierigkeitsgrade. `speed` ist die Grund-Geschwindigkeit in **Pixel pro
 * Sekunde** – bewusst in Pixeln, damit das Tempo auf jedem Bildschirm gleich
 * schnell wirkt (nicht abhängig von der Fensterbreite). `spawnMs` steuert, wie
 * oft neue Kokoši kommen, `minSize`/`maxSize` ihre Größe.
 */
const LEVELS: Record<
  Level,
  { speed: number; spawnMs: number; minSize: number; maxSize: number; extra: number }
> = {
  easy: { speed: 130, spawnMs: 1150, minSize: 58, maxSize: 96, extra: 0 },
  medium: { speed: 215, spawnMs: 820, minSize: 46, maxSize: 90, extra: 0.4 },
  hard: { speed: 330, spawnMs: 600, minSize: 36, maxSize: 78, extra: 0.6 },
};

/** Gesamte horizontale Flugstrecke als Vielfaches der Spielfeldbreite (-25vw … 125vw). */
const TRAVEL_FACTOR = 1.5;

const ROUND_SECONDS = 60;
const BEST_KEY_PREFIX = 'moorhuhn-best-';

@Component({
  selector: 'app-moorhuhn',
  standalone: true,
  imports: [DraggableDirective, TranslocoModule, LanguageSwitcherComponent],
  templateUrl: './moorhuhn.html',
  styleUrl: './moorhuhn.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoorhuhnComponent implements OnDestroy {
  private router = inject(Router);
  private effects = inject(EffectsService);

  @ViewChild('arena') private arenaRef?: ElementRef<HTMLElement>;

  readonly roundSeconds = ROUND_SECONDS;
  readonly levelList: Level[] = ['easy', 'medium', 'hard'];

  readonly status = signal<Status>('idle');
  readonly level = signal<Level>('medium');
  readonly score = signal<number>(0);
  readonly hits = signal<number>(0);
  readonly timeLeft = signal<number>(ROUND_SECONDS);
  readonly chickens = signal<Chicken[]>([]);
  readonly best = signal<number>(this.loadBest('medium'));
  readonly newRecord = signal<boolean>(false);

  /** Breite des Zeitbalkens (0–100 %). */
  readonly timePct = computed(() => (this.timeLeft() / this.roundSeconds) * 100);

  private nextId = 1;
  private spawnTimer: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private removeTimers: ReturnType<typeof setTimeout>[] = [];
  private audio: AudioContext | null = null;

  ngOnDestroy(): void {
    this.cleanup();
    this.effects.stop();
  }

  /** Wählt eine Stufe (aktualisiert die angezeigte Bestmarke). */
  chooseLevel(level: Level): void {
    this.level.set(level);
    this.best.set(this.loadBest(level));
  }

  /** Startet eine neue Runde in der gewählten Stufe. */
  start(level: Level = this.level()): void {
    this.cleanup();
    this.effects.stop();
    this.level.set(level);
    this.best.set(this.loadBest(level));
    this.newRecord.set(false);
    this.score.set(0);
    this.hits.set(0);
    this.timeLeft.set(ROUND_SECONDS);
    this.chickens.set([]);
    this.status.set('playing');

    // Uhr: jede Sekunde herunterzählen.
    this.clockTimer = setInterval(() => {
      const t = this.timeLeft() - 1;
      this.timeLeft.set(t);
      if (t <= 0) this.finish();
    }, 1000);

    // Kokoši spawnen – Rhythmus je nach Stufe.
    const cfg = LEVELS[level];
    this.spawnTimer = setInterval(() => {
      this.spawn();
      if (Math.random() < cfg.extra) this.spawn();
    }, cfg.spawnMs);

    // Sofort ein paar Vögel, damit es gleich losgeht.
    this.spawn();
    this.spawn();
  }

  /** Trefferklick auf eine Kokoš. */
  shoot(c: Chicken, event: Event): void {
    event.stopPropagation();
    if (this.status() !== 'playing' || c.hit) return;

    this.playSquawk();
    this.score.update((s) => s + c.points);
    this.hits.update((h) => h + 1);
    this.chickens.update((list) => list.map((x) => (x.id === c.id ? { ...x, hit: true } : x)));

    // Puff kurz anzeigen, dann entfernen.
    const t = setTimeout(() => this.despawn(c.id), 650);
    this.removeTimers.push(t);
  }

  /** Ein Schuss ins Leere (Klick aufs Feld ohne Kokoš). */
  miss(): void {
    if (this.status() !== 'playing') return;
    this.playShot();
  }

  /** Kokoš hat das Feld unberührt verlassen (CSS-Animation zu Ende). */
  escaped(id: number): void {
    this.despawn(id);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  // ---- intern --------------------------------------------------------

  private spawn(): void {
    if (this.status() !== 'playing') return;

    const cfg = LEVELS[this.level()];
    const size = cfg.minSize + Math.round(Math.random() * (cfg.maxSize - cfg.minSize));
    const golden = Math.random() < 0.08;
    // Kleinere & schnellere Kokoši sind mehr wert.
    const points = golden ? 5 : size < 55 ? 3 : size < 75 ? 2 : 1;

    // Kleine Vögel fliegen flinker: bis zu +60 % über der Grund-Geschwindigkeit.
    const range = cfg.maxSize - cfg.minSize || 1;
    const sizeFactor = 1 + ((cfg.maxSize - size) / range) * 0.6;
    const pxPerSec = cfg.speed * sizeFactor;

    // Flugdauer aus fester Pixel-Geschwindigkeit + echter Spielfeldbreite
    // → gleiches Tempo unabhängig von der Bildschirmgröße.
    const arenaW = this.arenaRef?.nativeElement.clientWidth || window.innerWidth || 800;
    const dur = Math.max(1.4, (TRAVEL_FACTOR * arenaW) / pxPerSec);

    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const y = 6 + Math.random() * 64; // 6–70 %

    const chicken: Chicken = {
      id: this.nextId++,
      y,
      dir,
      dur,
      size,
      points,
      golden,
      hit: false,
    };
    this.chickens.update((list) => [...list, chicken]);
  }

  private despawn(id: number): void {
    this.chickens.update((list) => list.filter((c) => c.id !== id));
  }

  private finish(): void {
    if (this.status() !== 'playing') return;
    this.stopTimers();
    this.chickens.set([]);
    this.status.set('over');

    const record = this.score() > this.best();
    if (record) {
      this.best.set(this.score());
      this.saveBest(this.level(), this.score());
      this.newRecord.set(true);
      this.effects.celebrate();
    } else {
      this.effects.draw();
    }
  }

  private stopTimers(): void {
    if (this.spawnTimer) {
      clearInterval(this.spawnTimer);
      this.spawnTimer = null;
    }
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  private cleanup(): void {
    this.stopTimers();
    for (const t of this.removeTimers) clearTimeout(t);
    this.removeTimers = [];
  }

  private loadBest(level: Level): number {
    try {
      const v = Number(localStorage.getItem(BEST_KEY_PREFIX + level));
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0;
    }
  }

  private saveBest(level: Level, v: number): void {
    try {
      localStorage.setItem(BEST_KEY_PREFIX + level, String(v));
    } catch {
      /* ignore */
    }
  }

  // ---- kleine Sounds (Web Audio, keine Dateien nötig) ----------------

  private ctx(): AudioContext | null {
    if (!this.audio) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.audio = new Ctor();
    }
    if (this.audio.state === 'suspended') this.audio.resume().catch(() => {});
    return this.audio;
  }

  /** Kurzer „Peng"-Schuss (gefiltertes Rauschen). */
  private playShot(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.14);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.15);
  }

  /** Schuss + lustiges „Gack"-Quietschen beim Treffer. */
  private playSquawk(): void {
    this.playShot();
    const ctx = this.ctx();
    if (!ctx) return;
    const now = ctx.currentTime + 0.04;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }
}
