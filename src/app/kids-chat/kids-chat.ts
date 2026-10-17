import { Clipboard } from '@angular/cdk/clipboard';
import { TextFieldModule } from '@angular/cdk/text-field';
import {
  afterRenderEffect,
  Component,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LanguageSwitcherComponent } from '../schiffe/language-switcher/language-switcher';
import { KidsChatService } from './kids-chat.service';
import { MarkdownPipe } from './markdown.pipe';
import { VoiceError, VoiceInputService } from './voice-input.service';
import { KidsVoiceMode } from './voice-mode';
import { VoiceModeService } from './voice-mode.service';
import { VoiceWaveform } from './voice-waveform';

/** Name in the greeting – the backend's CHILD_NAME is the one the AI uses. */
const CHILD_NAME = 'Lisa';
const DARK_KEY = 'kidsChat.dark';

/**
 * "Sovica" – a child-friendly AI chat (Croatian, German, English) with voice input and a hands-free voice mode.
 * The answers come from backend/ (Groq), which checks every question and answer for child safety.
 */
@Component({
  selector: 'app-kids-chat',
  imports: [
    FormsModule,
    TextFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoDirective,
    LanguageSwitcherComponent,
    MarkdownPipe,
    KidsVoiceMode,
    VoiceWaveform,
  ],
  templateUrl: './kids-chat.html',
  // Not encapsulated: the answers are rendered Markdown (innerHTML). Everything is scoped by the .kids-chat root.
  encapsulation: ViewEncapsulation.None,
  styleUrl: './kids-chat.scss',
})
export class KidsChatComponent implements OnDestroy {
  protected readonly chat = inject(KidsChatService);
  protected readonly voice = inject(VoiceInputService);
  protected readonly voiceMode = inject(VoiceModeService);
  private readonly transloco = inject(TranslocoService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(Clipboard);
  private readonly router = inject(Router);

  protected readonly childName = CHILD_NAME;
  protected input = '';
  protected readonly dark = signal(loadDark());
  /** Index of the answer that was just copied – its button briefly shows a check mark. */
  protected readonly copiedIndex = signal<number | null>(null);

  private readonly scrollContainer = viewChild.required<ElementRef<HTMLElement>>('scrollContainer');

  constructor() {
    // Keep the newest tokens in view while the answer streams in
    afterRenderEffect(() => {
      this.chat.messages();
      const el = this.scrollContainer().nativeElement;
      el.scrollTop = el.scrollHeight;
    });
    effect(() => {
      try {
        localStorage.setItem(DARK_KEY, String(this.dark()));
      } catch {
        // storage blocked – the setting then only lasts until the page is closed
      }
    });
  }

  ngOnDestroy(): void {
    // Leaving the chat turns the microphone off
    void this.voiceMode.stop();
    void this.voice.cancel();
  }

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  protected send(): void {
    const text = this.input;
    this.input = '';
    void this.chat.send(text);
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Enter sends, Shift+Enter inserts a line break
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  /** First tap starts recording, the check mark stops it and puts the recognised text into the input. */
  protected async toggleRecording(): Promise<void> {
    try {
      if (this.voice.state() === 'idle') {
        await this.voice.start();
        return;
      }
      const text = await this.voice.stop();
      if (text) this.input = this.input.trim() ? `${this.input.trimEnd()} ${text}` : text;
    } catch (err) {
      this.showError(err instanceof VoiceError ? err.reason : 'transcription');
    }
  }

  protected async startVoiceMode(): Promise<void> {
    try {
      await this.voiceMode.start();
    } catch {
      this.showError('mic');
    }
  }

  protected copy(text: string, index: number): void {
    if (!this.clipboard.copy(text)) return;
    this.copiedIndex.set(index);
    setTimeout(() => this.copiedIndex.update((i) => (i === index ? null : i)), 2000);
  }

  private showError(reason: string): void {
    this.snackBar.open(this.transloco.translate(`kidsChat.errors.${reason}`), undefined, { duration: 4000 });
  }
}

function loadDark(): boolean {
  try {
    const stored = localStorage.getItem(DARK_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // storage blocked
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}
