import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';

/** Width of one bar and the gap after it, in CSS pixels. */
const BAR_WIDTH = 4;
const BAR_GAP = 3;
/** A new bar is added this often – together with the bar size this sets the scroll speed. */
const SAMPLE_INTERVAL_MS = 60;
/** Silence is drawn as small dots, loud speech fills the full height. */
const MIN_BAR_HEIGHT = 2;

/**
 * Live waveform of the microphone input, in the style of ChatGPT's voice input:
 * one bar per time slice, new bars appear on the right and scroll to the left.
 */
@Component({
  selector: 'app-voice-waveform',
  template: `
    <!-- Absolutely positioned so the canvas' pixel size never pushes the layout wider -->
    <div class="relative h-full min-w-0 flex-1">
      <canvas #canvas class="absolute inset-0 block h-full w-full"></canvas>
    </div>
    <span class="shrink-0 tabular-nums opacity-70">{{ elapsed() }}</span>
  `,
  host: { class: 'flex min-w-0 items-center gap-3' },
})
export class VoiceWaveform {
  readonly stream = input.required<MediaStream>();
  /** When true the waveform freezes (e.g. while the recording is being transcribed). */
  readonly paused = input(false);

  protected readonly elapsed = signal('0:00');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly levels: number[] = [];

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => destroyRef.onDestroy(this.run()));
  }

  /** Starts analysing and drawing; returns the cleanup function. */
  private run(): () => void {
    const canvas = this.canvas().nativeElement;
    const context = canvas.getContext('2d')!;
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(this.stream()).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    const startedAt = performance.now();
    let lastSample = 0;
    let frame = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (this.paused()) return;

      if (now - lastSample >= SAMPLE_INTERVAL_MS) {
        lastSample = now;
        analyser.getFloatTimeDomainData(samples);
        this.levels.push(loudness(samples));
        const seconds = Math.floor((now - startedAt) / 1000);
        this.elapsed.set(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
      }
      this.render(canvas, context);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      void audioContext.close();
    };
  }

  private render(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
    // Match the canvas resolution to its displayed size so the bars stay crisp.
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(canvas).color;

    // Only keep as many bars as fit; the newest bar sits at the right edge.
    const maxBars = Math.floor(width / (BAR_WIDTH + BAR_GAP));
    if (this.levels.length > maxBars) this.levels.splice(0, this.levels.length - maxBars);

    this.levels.forEach((level, i) => {
      const barHeight = Math.max(MIN_BAR_HEIGHT, level * height);
      const x = width - (this.levels.length - i) * (BAR_WIDTH + BAR_GAP);
      context.beginPath();
      context.roundRect(x, (height - barHeight) / 2, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
      context.fill();
    });
  }
}

/** RMS of the audio samples, scaled so that normal speech uses most of the height (0…1). */
function loudness(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1, Math.sqrt(rms) * 1.8);
}
