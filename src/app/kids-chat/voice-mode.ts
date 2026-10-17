import { Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';
import { VoiceModeService } from './voice-mode.service';

/**
 * Full-screen voice conversation: a big owl that shows whether Sovica is listening, thinking or speaking,
 * with what was said as subtitles. Tapping the owl interrupts her; the button at the bottom ends the conversation.
 */
@Component({
  selector: 'app-kids-voice-mode',
  imports: [MatIconModule, TranslocoDirective],
  // The colours come from the chat's .kids-chat root (light/dark), the styles are scoped by .kc-voice
  encapsulation: ViewEncapsulation.None,
  styleUrl: './voice-mode.scss',
  template: `
    <div
      *transloco="let t; prefix: 'kidsChat.voice'"
      class="kc-voice"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="t('start')"
    >
      <div class="kc-voice-stage">
        <button
          type="button"
          class="kc-voice-ring"
          [attr.data-state]="voice.state()"
          [style.--level]="voice.level()"
          [attr.aria-label]="t(voice.state())"
          (click)="voice.interrupt()"
        >
          <span class="kc-voice-owl" aria-hidden="true">🦉</span>
          @if (voice.state() === 'thinking' || voice.state() === 'loading') {
            <span class="kc-voice-orbit" aria-hidden="true"><i></i><i></i><i></i></span>
          }
        </button>
        <!-- One text per state: kidsChat.voice.loading / listening / hearing / thinking / speaking -->
        <p class="kc-voice-status" aria-live="polite">{{ t(voice.state()) }}</p>
      </div>

      <div class="kc-voice-subtitles">
        @if (voice.heard()) {
          <p class="heard">„{{ voice.heard() }}“</p>
        }
        @if (voice.answer()) {
          <p class="answer">{{ answer() }}</p>
        }
      </div>

      <button type="button" class="kc-voice-end" (click)="voice.stop()">
        <mat-icon>close</mat-icon>
        {{ t('end') }}
      </button>
    </div>
  `,
})
export class KidsVoiceMode {
  protected readonly voice = inject(VoiceModeService);

  /** The answer without Markdown symbols – the model sometimes uses **bold** despite the voice-mode prompt. */
  protected readonly answer = computed(() => this.voice.answer().replace(/[*_`#]/g, ''));
}
