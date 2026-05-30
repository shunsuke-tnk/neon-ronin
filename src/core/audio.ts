// Fully procedural audio (no asset files): synthesised SFX + an evolving
// layered music engine driven by a lookahead scheduler. All sound is built
// from oscillators, a noise buffer, filters and envelopes through the Web
// Audio API, so the whole game ships as a single offline HTML file.

export interface MusicMood {
  /** Root note frequency (Hz). */
  root: number;
  /** Semitone offsets defining the scale. */
  scale: number[];
  /** Seconds per 16th-note step. */
  stepDur: number;
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  /** Hue-ish character not used for audio, kept for callers' convenience. */
  name: string;
}

const SEMITONE = Math.pow(2, 1 / 12);

function noteFreq(root: number, semis: number): number {
  return root * Math.pow(SEMITONE, semis);
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuffer!: AudioBuffer;

  muted = false;
  private musicTimer: number | null = null;
  private mood: MusicMood | null = null;
  private nextStepTime = 0;
  private step = 0;
  private intensity = 0.6;

  /** Must be called from within a user gesture (key press / click). */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.34;
    this.musicBus.connect(this.master);

    // 1s of white noise for percussive / explosion textures.
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
    return this.muted;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---- low level voices ----------------------------------------------------

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    bus: GainNode,
    opts: { glideTo?: number; attack?: number; pan?: number } = {},
  ): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (opts.glideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.glideTo), t + dur);
    }
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = g;
    osc.connect(g);
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = opts.pan;
      g.connect(pan);
      node = pan;
    }
    node.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(
    dur: number,
    gain: number,
    bus: GainNode,
    filter: { type: BiquadFilterType; freq: number; q?: number },
  ): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    f.Q.value = filter.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ---- named SFX -----------------------------------------------------------

  shoot(): void {
    this.tone(880, 0.16, 'square', 0.16, this.sfxBus, { glideTo: 320 });
    this.tone(1320, 0.08, 'sine', 0.08, this.sfxBus, { glideTo: 600 });
  }

  slash(): void {
    this.noise(0.18, 0.22, this.sfxBus, { type: 'bandpass', freq: 2600, q: 0.8 });
    this.tone(520, 0.12, 'triangle', 0.1, this.sfxBus, { glideTo: 900 });
  }

  jump(): void {
    this.tone(360, 0.18, 'sine', 0.14, this.sfxBus, { glideTo: 720 });
  }

  dash(): void {
    this.noise(0.22, 0.18, this.sfxBus, { type: 'highpass', freq: 800 });
    this.tone(220, 0.18, 'sawtooth', 0.1, this.sfxBus, { glideTo: 90 });
  }

  hit(): void {
    this.tone(180, 0.1, 'square', 0.16, this.sfxBus, { glideTo: 70 });
    this.noise(0.08, 0.12, this.sfxBus, { type: 'lowpass', freq: 1800 });
  }

  enemyHit(): void {
    this.tone(420, 0.07, 'square', 0.1, this.sfxBus, { glideTo: 260 });
  }

  explosion(big = false): void {
    this.noise(big ? 0.7 : 0.4, big ? 0.5 : 0.34, this.sfxBus, {
      type: 'lowpass',
      freq: big ? 900 : 1400,
    });
    this.tone(120, big ? 0.6 : 0.35, 'sawtooth', 0.22, this.sfxBus, { glideTo: 40 });
  }

  pickup(): void {
    this.tone(740, 0.09, 'triangle', 0.16, this.sfxBus);
    this.tone(1110, 0.12, 'triangle', 0.14, this.sfxBus, { attack: 0.01 });
  }

  powerUp(): void {
    const base = 520;
    [0, 4, 7, 12].forEach((s, i) => {
      window.setTimeout(() => this.tone(noteFreq(base, s), 0.22, 'triangle', 0.16, this.sfxBus), i * 70);
    });
  }

  levelUp(): void {
    const base = 440;
    [0, 7, 12, 16, 19].forEach((s, i) => {
      window.setTimeout(() => this.tone(noteFreq(base, s), 0.3, 'sawtooth', 0.14, this.sfxBus), i * 80);
    });
  }

  hurt(): void {
    this.tone(300, 0.22, 'sawtooth', 0.2, this.sfxBus, { glideTo: 120 });
    this.noise(0.12, 0.16, this.sfxBus, { type: 'lowpass', freq: 1200 });
  }

  uiMove(): void {
    this.tone(660, 0.05, 'square', 0.06, this.sfxBus);
  }

  uiSelect(): void {
    this.tone(880, 0.12, 'triangle', 0.12, this.sfxBus, { glideTo: 1320 });
  }

  bossWarn(): void {
    this.tone(70, 0.9, 'sawtooth', 0.22, this.musicBus);
    this.noise(0.9, 0.18, this.musicBus, { type: 'lowpass', freq: 400 });
  }

  // ---- music engine --------------------------------------------------------

  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(1.2, v));
  }

  startMusic(mood: MusicMood): void {
    if (!this.ctx) return;
    this.mood = mood;
    this.step = 0;
    this.nextStepTime = this.now() + 0.1;
    if (this.musicTimer === null) {
      this.musicTimer = window.setInterval(() => this.schedule(), 40);
    }
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.mood = null;
  }

  private schedule(): void {
    if (!this.ctx || !this.mood) return;
    const lookahead = 0.18;
    while (this.nextStepTime < this.now() + lookahead) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += this.mood.stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.ctx || !this.mood || this.muted) return;
    const m = this.mood;
    const bar = Math.floor(step / 16);
    // Simple i–VI–III–VII style root movement over 4 bars.
    const roots = [0, -3, 4, -5];
    const chordRoot = roots[bar % roots.length];

    // Bass on the quarter notes.
    if (step % 4 === 0) {
      this.scheduledTone(
        noteFreq(m.root / 2, chordRoot),
        m.stepDur * 3.4,
        m.bassWave,
        0.34,
        this.musicBus,
        time,
      );
    }
    // Pad chord at the top of each bar.
    if (step % 16 === 0) {
      [0, 7, 12].forEach((s) =>
        this.scheduledTone(
          noteFreq(m.root, chordRoot + s),
          m.stepDur * 15,
          'sine',
          0.06 + 0.04 * this.intensity,
          this.musicBus,
          time,
          0.6,
        ),
      );
    }
    // Arpeggiated lead, denser at higher intensity.
    const density = 0.35 + 0.5 * this.intensity;
    if (step % 2 === 0 && Math.random() < density) {
      const deg = m.scale[(step + bar) % m.scale.length];
      this.scheduledTone(
        noteFreq(m.root * 2, chordRoot + deg),
        m.stepDur * 1.6,
        m.leadWave,
        0.08 + 0.05 * this.intensity,
        this.musicBus,
        time,
        0.06,
        (step % 4) - 1.5,
      );
    }
    // Hat / pulse.
    if (step % 2 === 1) {
      this.scheduledNoise(0.04, 0.05 + 0.05 * this.intensity, time);
    }
  }

  private scheduledTone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    bus: GainNode,
    time: number,
    attack = 0.01,
    pan = 0,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    let node: AudioNode = g;
    osc.connect(g);
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan / 2));
      g.connect(p);
      node = p;
    }
    node.connect(bus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private scheduledNoise(dur: number, gain: number, time: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(time);
    src.stop(time + dur + 0.02);
  }
}
