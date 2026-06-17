import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { EffectsService } from '../memory/effects/effects.service';
import { DraggableDirective } from '../shared/draggable.directive';
import { WORDS, type HangmanWord } from './words';

// Kroatische Buchstaben-Tastatur (ohne Digrafe dž/lj/nj – einzeln raten).
const LETTERS = 'ABCČĆDĐEFGHIJKLMNOPRSŠTUVZŽ'.split('');
const MAX_WRONG = 6;

type Status = 'playing' | 'won' | 'lost';

@Component({
  selector: 'app-hangman',
  standalone: true,
  imports: [DraggableDirective],
  templateUrl: './hangman.html',
  styleUrl: './hangman.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HangmanComponent implements OnDestroy {
  private router = inject(Router);
  private effects = inject(EffectsService);

  readonly letters = LETTERS;
  readonly maxWrong = MAX_WRONG;

  readonly current = signal<HangmanWord>(this.pick());
  /** Bereits geratene Buchstaben (Großbuchstaben). */
  readonly guessed = signal<string[]>([]);

  private lastIndex = -1;
  private effectsShown = false;

  /** Falsch geratene Buchstaben (im Wort nicht enthalten). */
  readonly wrong = computed<number>(() => {
    const w = this.current().word;
    return this.guessed().filter((l) => !w.includes(l)).length;
  });

  readonly remaining = computed<number>(() => this.maxWrong - this.wrong());

  /** Breite der Schmelz-Pfütze – wächst mit der Zahl der Fehler. */
  readonly puddleRx = computed<number>(() => 8 + this.wrong() * 8);

  readonly won = computed<boolean>(() => {
    const w = this.current().word;
    const g = this.guessed();
    return [...w].every((ch) => ch === ' ' || g.includes(ch));
  });

  readonly status = computed<Status>(() => {
    if (this.won()) return 'won';
    if (this.wrong() >= this.maxWrong) return 'lost';
    return 'playing';
  });

  /** Hilfsarray zum Zeichnen der Herzen (volle + verlorene). */
  readonly hearts = computed(() =>
    Array.from({ length: this.maxWrong }, (_, i) => i < this.remaining()),
  );

  /** Das Wort als Felder: Buchstabe wenn geraten oder Spiel vorbei, sonst leer. */
  readonly slots = computed(() => {
    const reveal = this.status() === 'lost';
    const g = this.guessed();
    return [...this.current().word].map((ch) => ({
      char: ch,
      shown: ch === ' ' || g.includes(ch) || reveal,
      missed: reveal && ch !== ' ' && !g.includes(ch),
    }));
  });

  constructor() {
    effect(() => {
      const s = this.status();
      if (s !== 'playing' && !this.effectsShown) {
        this.effectsShown = true;
        if (s === 'won') this.effects.celebrate();
        else this.effects.commiserate();
      } else if (s === 'playing' && this.effectsShown) {
        this.effectsShown = false;
        this.effects.stop();
      }
    });
  }

  ngOnDestroy(): void {
    this.effects.stop();
  }

  isUsed(letter: string): boolean {
    return this.guessed().includes(letter);
  }

  isWrongLetter(letter: string): boolean {
    return this.isUsed(letter) && !this.current().word.includes(letter);
  }

  guess(letter: string): void {
    if (this.status() !== 'playing') return;
    if (this.isUsed(letter)) return;
    this.guessed.update((g) => [...g, letter]);
  }

  newWord(): void {
    this.effects.stop();
    this.effectsShown = false;
    this.current.set(this.pick());
    this.guessed.set([]);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  /** Zufälliges Wort, möglichst nicht dasselbe wie zuletzt. */
  private pick(): HangmanWord {
    let i = Math.floor(Math.random() * WORDS.length);
    if (WORDS.length > 1 && i === this.lastIndex) {
      i = (i + 1) % WORDS.length;
    }
    this.lastIndex = i;
    return WORDS[i];
  }
}
