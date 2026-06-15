import { Injectable } from '@angular/core';
import confetti from 'canvas-confetti';

/**
 * Kümmert sich um die „Show" am Spielende: Feuerwerk + Klang beim Sieg,
 * und ein trauriger Klang beim Verlieren.
 *
 * Die Sounds werden mit der Web Audio API erzeugt, damit keine externen
 * Audio-Dateien gebündelt oder geladen werden müssen.
 */
@Injectable({ providedIn: 'root' })
export class EffectsService {
  private audio: AudioContext | null = null;
  private fireworkTimer: ReturnType<typeof setInterval> | null = null;
  private soundTimers: ReturnType<typeof setTimeout>[] = [];

  /** Feuerwerk + Feuerwerks-Sound beim Gewinnen. */
  celebrate(): void {
    this.stop();
    this.launchFireworks();
    this.playFireworkShow();
  }

  /** Trauriger „Wah-Wah"-Klang beim Verlieren. */
  commiserate(): void {
    this.stop();
    this.playSadTrombone();
  }

  /** Räumt laufende Effekte auf (z.B. beim Verlassen des Bildschirms). */
  stop(): void {
    if (this.fireworkTimer) {
      clearInterval(this.fireworkTimer);
      this.fireworkTimer = null;
    }
    for (const t of this.soundTimers) clearTimeout(t);
    this.soundTimers = [];
    confetti.reset();
  }

  // ---- Feuerwerk (canvas-confetti) -----------------------------------

  private launchFireworks(): void {
    const duration = 5000;
    const end = Date.now() + duration;
    const colors = ['#fde047', '#f97316', '#ef4444', '#38bdf8', '#a855f7', '#22c55e'];
    const defaults = { startVelocity: 32, spread: 360, ticks: 70, zIndex: 1000 };
    const rnd = (min: number, max: number) => Math.random() * (max - min) + min;

    this.fireworkTimer = setInterval(() => {
      const timeLeft = end - Date.now();
      if (timeLeft <= 0) {
        if (this.fireworkTimer) clearInterval(this.fireworkTimer);
        this.fireworkTimer = null;
        return;
      }
      const particleCount = Math.round(45 * (timeLeft / duration)) + 10;
      confetti({
        ...defaults,
        particleCount,
        colors,
        origin: { x: rnd(0.1, 0.35), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        colors,
        origin: { x: rnd(0.65, 0.9), y: Math.random() - 0.2 },
      });
    }, 280);
  }

  // ---- Klang-Erzeugung ------------------------------------------------

  private ctx(): AudioContext | null {
    if (!this.audio) {
      const Ctor =
        window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return null;
      this.audio = new Ctor();
    }
    // Nach Nutzer-Interaktion ggf. wieder aufwecken.
    if (this.audio.state === 'suspended') this.audio.resume().catch(() => {});
    return this.audio;
  }

  /** Mehrere „Aufstieg + Knall + Knistern"-Salven über ein paar Sekunden. */
  private playFireworkShow(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    // 6 Feuerwerks-Raketen in unregelmäßigen Abständen.
    const offsets = [0, 600, 1300, 2100, 3000, 3900];
    for (const ms of offsets) {
      const timer = setTimeout(() => {
        const c = this.ctx();
        if (c) this.playSingleFirework(c);
      }, ms);
      this.soundTimers.push(timer);
    }
  }

  private playSingleFirework(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // 1) Aufstiegs-Pfeifen: Ton steigt an, wird leiser.
    const whistle = ctx.createOscillator();
    const whistleGain = ctx.createGain();
    whistle.type = 'sine';
    whistle.frequency.setValueAtTime(400, now);
    whistle.frequency.exponentialRampToValueAtTime(1400, now + 0.5);
    whistleGain.gain.setValueAtTime(0.0001, now);
    whistleGain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
    whistleGain.gain.exponentialRampToValueAtTime(0.04, now + 0.5);
    whistle.connect(whistleGain).connect(ctx.destination);
    whistle.start(now);
    whistle.stop(now + 0.55);

    // 2) Knall: kurzer, tiefer Rausch-Impuls direkt nach dem Aufstieg.
    const boomAt = now + 0.55;
    const boom = ctx.createBufferSource();
    boom.buffer = this.noiseBuffer(ctx, 0.5);
    const boomFilter = ctx.createBiquadFilter();
    boomFilter.type = 'lowpass';
    boomFilter.frequency.setValueAtTime(900, boomAt);
    boomFilter.frequency.exponentialRampToValueAtTime(120, boomAt + 0.4);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.5, boomAt);
    boomGain.gain.exponentialRampToValueAtTime(0.001, boomAt + 0.5);
    boom.connect(boomFilter).connect(boomGain).connect(ctx.destination);
    boom.start(boomAt);
    boom.stop(boomAt + 0.5);

    // 3) Knistern: viele winzige, hohe Rausch-Pieper nach dem Knall.
    const crackle = ctx.createBufferSource();
    crackle.buffer = this.noiseBuffer(ctx, 0.6);
    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = 'highpass';
    crackleFilter.frequency.value = 4000;
    const crackleGain = ctx.createGain();
    crackleGain.gain.setValueAtTime(0.0001, boomAt + 0.05);
    crackleGain.gain.linearRampToValueAtTime(0.12, boomAt + 0.12);
    crackleGain.gain.exponentialRampToValueAtTime(0.001, boomAt + 0.6);
    crackle.connect(crackleFilter).connect(crackleGain).connect(ctx.destination);
    crackle.start(boomAt + 0.05);
    crackle.stop(boomAt + 0.65);
  }

  /** Klassisches absteigendes „Wah-Wah-Wah-Waaah" beim Verlieren. */
  private playSadTrombone(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const start = ctx.currentTime + 0.05;
    // Absteigende Noten (Hz), letzte länger + „leiernd".
    const notes = [
      { f: 311, dur: 0.32 }, // Eb4
      { f: 277, dur: 0.32 }, // C#4
      { f: 247, dur: 0.32 }, // B3
      { f: 220, dur: 0.85 }, // A3 (zieht sich)
    ];
    let t = start;
    notes.forEach((n, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, t);
      // Leichtes Abrutschen der Tonhöhe = trauriger „Wah"-Effekt.
      osc.frequency.linearRampToValueAtTime(n.f * 0.94, t + n.dur);

      // Sanfter, dumpfer Klang.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1100;

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
      gain.gain.setValueAtTime(0.18, t + n.dur - 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);

      // Bei der letzten Note ein „Leiern" (Vibrato) für den Comedy-Effekt.
      if (i === notes.length - 1) {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 6;
        lfoGain.gain.value = 10;
        lfo.connect(lfoGain).connect(osc.frequency);
        lfo.start(t);
        lfo.stop(t + n.dur);
      }

      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.dur + 0.02);
      t += n.dur + 0.04;
    });
  }

  /** Erzeugt einen kurzen Puffer mit weißem Rauschen. */
  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
