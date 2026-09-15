import { logger } from '../util/logger.js';

const SCOPE = 'audio';

const SFX_GAIN = 0.34;

/** The supplied audio, served from the repo-level `assets/` (Vite publicDir). */
const AUDIO_URL = {
  fall: '/audio/fall.mp3',
  // Case matters on a deployed (Linux) host: the file is `Background.mp3`.
  music: '/audio/Background.mp3',
} as const;

/** Background music level under the portal's music volume, so effects stay audible over it. */
const MUSIC_GAIN = 0.45;

const MAX_VOICES = 12;

/** Extra gain on the fall sound above the effects bus, so it cuts through. */
const FALL_GAIN = 2;

export type SoundName = 'jump' | 'land' | 'fall' | 'step' | 'balloon' | 'win' | 'buy' | 'hatch' | 'crack' | 'ui' | 'deny';

/** Seconds a sound refuses to retrigger, so nothing can machine-gun. */
const COOLDOWNS: Readonly<Record<SoundName, number>> = {
  jump: 0.08,
  land: 0.12,
  fall: 0.8,
  step: 0.05,
  balloon: 0.5,
  win: 0.4,
  buy: 0.2,
  hatch: 0.6,
  crack: 0.12,
  ui: 0.05,
  deny: 0.25,
};

/**
 * Every sound in the game.
 *
 * `Background.mp3` loops as the background music, streamed through an audio
 * element (never decoded whole into memory) into its own music bus. The supplied
 * `fall.mp3` plays when a player drops off the staircase; everything else is
 * synthesised, because oscillators cost hundreds of bytes against a 12 MB budget.
 * Master and music volume follow the portal settings, and mute silences both.
 *
 * One-shots are bounded twice: a per-sound cooldown and a hard voice ceiling.
 * Nothing starts before a real user gesture.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private fallBuffer: AudioBuffer | null = null;
  private loadingSamples = false;
  private voices = 0;
  private readonly lastPlayed = new Map<SoundName, number>();
  private muted = false;
  /** Master volume from the portal settings, 0..1. Kept apart from mute. */
  private masterLevel = 1;
  /** Music volume from the portal settings, 0..1. */
  private musicLevel = 1;
  private musicBus: GainNode | null = null;
  private music: HTMLAudioElement | null = null;

  constructor() {
    try {
      this.muted = window.localStorage.getItem('balloonpersecond.muted') === '1';
    } catch {
      this.muted = false;
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  resume(): void {
    if (!this.context) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.context = new Ctor();
      } catch (error) {
        logger.warn(SCOPE, `no audio context: ${String(error)}`);
        return;
      }
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterLevel;
      this.master.connect(this.context.destination);
      this.sfxBus = this.context.createGain();
      this.sfxBus.gain.value = SFX_GAIN;
      this.sfxBus.connect(this.master);
      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = MUSIC_GAIN * this.musicLevel;
      this.musicBus.connect(this.master);
    }

    void this.context.resume().catch(() => undefined);
    void this.loadSamples();
    this.startMusic();
  }

  /**
   * The looping background track. Started on the first user gesture (browsers
   * refuse audio before one) and routed through the master gain, so mute and the
   * master volume apply. A failure to load or play just means no music.
   */
  private startMusic(): void {
    const ctx = this.context;
    if (!ctx || !this.musicBus) return;
    if (!this.music) {
      try {
        const element = new Audio(AUDIO_URL.music);
        element.loop = true;
        element.preload = 'auto';
        element.crossOrigin = 'anonymous';
        ctx.createMediaElementSource(element).connect(this.musicBus);
        element.addEventListener('error', () => logger.warn(SCOPE, `could not load ${AUDIO_URL.music}`), { once: true });
        this.music = element;
      } catch (error) {
        logger.warn(SCOPE, `no background music: ${String(error)}`);
        return;
      }
    }
    if (this.music.paused) void this.music.play().catch(() => undefined);
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    try {
      window.localStorage.setItem('balloonpersecond.muted', this.muted ? '1' : '0');
    } catch {
      /* per-viewer convenience only */
    }
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterLevel, this.context.currentTime, 0.05);
    }
    return this.muted;
  }

  /**
   * Master volume, 0..1 (the portal's `master_volume`). Separate from mute: the
   * master gain is the product of the two, so unmuting restores the slider.
   */
  setMasterVolume(level: number): void {
    this.masterLevel = Number.isFinite(level) ? Math.min(Math.max(level, 0), 1) : 1;
    if (this.master && this.context && !this.muted) {
      this.master.gain.setTargetAtTime(this.masterLevel, this.context.currentTime, 0.05);
    }
  }

  /** The portal's `music_volume`, 0..1: scales the background music only. */
  setMusicVolume(level: number): void {
    this.musicLevel = Number.isFinite(level) ? Math.min(Math.max(level, 0), 1) : 1;
    if (this.musicBus && this.context) {
      this.musicBus.gain.setTargetAtTime(MUSIC_GAIN * this.musicLevel, this.context.currentTime, 0.05);
    }
  }

  play(name: SoundName, intensity = 1): void {
    const ctx = this.context;
    if (!ctx || !this.sfxBus || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < COOLDOWNS[name]) return;
    if (this.voices >= MAX_VOICES) return;
    this.lastPlayed.set(name, now);
    const level = Math.min(Math.max(intensity, 0), 1);

    switch (name) {
      case 'jump':
        // A soft rising whoosh: a balloon tug rather than a leap.
        this.blip(now, 'sine', 300, 720, 0.24, 0.32);
        this.blip(now + 0.03, 'triangle', 520, 900, 0.18, 0.12);
        break;
      case 'land':
        // A soft pat, not a crash: the balloon lets the player down gently.
        this.thud(now, 0.06 + level * 0.1, 110);
        break;
      case 'fall':
        if (!this.playBuffer(this.fallBuffer, now, FALL_GAIN)) this.blip(now, 'sawtooth', 600, 90, 0.6, 0.3);
        break;
      case 'step':
        this.thud(now, 0.07 + level * 0.1, 130);
        break;
      case 'balloon':
        // A rubbery squeak as the meter pays out.
        this.blip(now, 'sine', 620, 980, 0.1, 0.22);
        this.blip(now + 0.07, 'sine', 880, 1320, 0.1, 0.16);
        break;
      case 'hatch':
        this.arpeggio(now, [0, 3, 7, 12, 15, 19], 0.06, 'triangle', 0.4);
        break;
      case 'crack':
        this.thud(now, 0.25, 240);
        this.blip(now, 'square', 1400, 500, 0.05, 0.08);
        break;
      case 'win':
        this.arpeggio(now, [0, 4, 7, 12, 16], 0.08, 'triangle', 0.5);
        break;
      case 'buy':
        this.arpeggio(now, [0, 5, 9, 12], 0.05, 'square', 0.3);
        break;
      case 'ui':
        this.blip(now, 'sine', 660, 880, 0.06, 0.25);
        break;
      case 'deny':
        this.blip(now, 'square', 180, 120, 0.14, 0.3);
        break;
    }
  }

  dispose(): void {
    if (this.music) {
      this.music.pause();
      this.music.removeAttribute('src');
      this.music.load();
      this.music = null;
    }
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }

  private async loadSamples(): Promise<void> {
    const ctx = this.context;
    if (!ctx || this.loadingSamples) return;
    this.loadingSamples = true;
    try {
      const response = await fetch(AUDIO_URL.fall);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.fallBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      // The synthesised fallback covers it.
      logger.warn(SCOPE, `could not load ${AUDIO_URL.fall}: ${String(error)}`);
    }
  }

  private playBuffer(buffer: AudioBuffer | null, at: number, gain: number): boolean {
    const ctx = this.context;
    if (!ctx || !this.sfxBus || !buffer) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const envelope = ctx.createGain();
    envelope.gain.value = gain;
    source.connect(envelope);
    envelope.connect(this.sfxBus);
    this.voices += 1;
    source.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      source.disconnect();
      envelope.disconnect();
    };
    source.start(at);
    return true;
  }

  private blip(at: number, shape: OscillatorType, from: number, to: number, length: number, gain: number): void {
    const ctx = this.context;
    if (!ctx || !this.sfxBus) return;
    const osc = ctx.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(envelope);
    envelope.connect(this.sfxBus);
    this.hold(osc, envelope, at, length);
  }

  private thud(at: number, gain: number, frequency = 150): void {
    const ctx = this.context;
    if (!ctx || !this.sfxBus) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.45, at + 0.09);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    osc.connect(envelope);
    envelope.connect(this.sfxBus);
    this.hold(osc, envelope, at, 0.12);
  }

  private arpeggio(at: number, semitones: readonly number[], step: number, shape: OscillatorType, gain: number): void {
    const ctx = this.context;
    if (!ctx || !this.sfxBus) return;
    for (let i = 0; i < semitones.length; i += 1) {
      if (this.voices >= MAX_VOICES) return;
      const osc = ctx.createOscillator();
      osc.type = shape;
      osc.frequency.value = 440 * 2 ** ((semitones[i] ?? 0) / 12);
      const start = at + i * step;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + step * 2.2);
      osc.connect(envelope);
      envelope.connect(this.sfxBus);
      this.hold(osc, envelope, start, step * 2.2);
    }
  }

  private hold(osc: OscillatorNode, envelope: GainNode, at: number, length: number): void {
    this.voices += 1;
    osc.start(at);
    osc.stop(at + length + 0.02);
    osc.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      osc.disconnect();
      envelope.disconnect();
    };
  }
}
