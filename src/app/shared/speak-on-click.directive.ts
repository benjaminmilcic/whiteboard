import { Directive, HostListener, Input } from '@angular/core';

/**
 * Klick auf ein Element liest den übergebenen Text laut vor.
 * Nutzt die eingebaute Web Speech API (window.speechSynthesis) –
 * kostenlos, ohne API-Key, offline. Verfügbar in Chrome/Edge/Safari.
 *
 * Es wird immer KROATISCH vorgelesen (die Namen sind kroatisch),
 * unabhängig von der eingestellten App-Sprache. Wenn das Betriebssystem
 * eine kroatische Stimme hat, wird diese gezielt gewählt; sonst nutzt der
 * Browser die Standardstimme mit `lang = 'hr-HR'`.
 *
 * Verwendung:  <span [speakOnClick]="spieler.name">{{ spieler.name }}</span>
 */
@Directive({
  selector: '[speakOnClick]',
  standalone: true,
  host: {
    role: 'button',
    tabindex: '0',
    style: 'cursor: pointer',
  },
})
export class SpeakOnClickDirective {
  /** Zielsprache der Sprachausgabe. */
  private static readonly LANG = 'hr-HR';

  /** Der vorzulesende Text (i.d.R. ein Spielername). */
  @Input('speakOnClick') text = '';

  @HostListener('click')
  @HostListener('keydown.enter')
  @HostListener('keydown.space')
  speak(): void {
    const text = (this.text || '').trim();
    if (!text) return;

    const synth = window.speechSynthesis;
    if (!synth) return; // Browser ohne Sprachausgabe: still ignorieren

    synth.cancel(); // laufende Ausgabe abbrechen, damit es nicht überlappt

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = SpeakOnClickDirective.LANG;
    utter.rate = 0.95;

    const voice = this.croatianVoice(synth);
    if (voice) utter.voice = voice;

    synth.speak(utter);
  }

  /** Falls installiert: eine kroatische Stimme (hr / hr-HR). */
  private croatianVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
    const voices = synth.getVoices();
    return voices.find((v) => v.lang?.toLowerCase().startsWith('hr')) ?? null;
  }
}
