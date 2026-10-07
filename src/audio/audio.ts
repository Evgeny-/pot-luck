/**
 * Pot Luck sound. Everything audible is synthesized with the Web Audio API (no audio files):
 * a cozy kitchen palette (wooden knocks, liquid bloops, ceramic clinks, a service bell) and a
 * small generative music engine with one arrangement per cuisine.
 *
 * Nothing is created until `unlock()` runs inside a user gesture, and every method is a safe
 * no-op without Web Audio (Node tests, old browsers), so callers never need to guard.
 *
 *   sfx voices ──┬──────────────► sfxBus ──────────────┐
 *                └─ send ─► sfxWet ─────┐              ├─► master ─► compressor ─► out
 *   song voices ─┬─► song fade ─► musicBus ─► duck ────┤
 *                └─ send ─► song fade ─► musicWet ─► duck ─► reverb (one light kitchen room)
 *
 * Volumes sit before the shared reverb, so the music and SFX sliders also scale their echoes.
 * Voices reach their bus through cached pan/send lanes (no panner or send node per note), constant
 * pitches stay off the automation timeline, and voice caps bound the work: cheap enough for phones.
 */

export type SfxName =
  | 'press'
  | 'slide'
  | 'plop'
  | 'park'
  | 'bowlOut'
  | 'blocked'
  | 'full'
  | 'serve'
  | 'lid'
  | 'reveal'
  | 'unlock'
  | 'link'
  | 'thaw'
  | 'win'
  | 'star'
  | 'stuck'
  | 'undo'
  | 'hint'
  | 'button'
  | 'newMechanic'
  | 'map';

export interface PlayOpts {
  pitch?: number;
  volume?: number;
  pan?: number;
}

export type MusicTheme = 'menu' | 'italy' | 'japan' | 'mexico' | 'usa' | 'india' | 'china';

export interface Audio {
  unlock(): void;
  play(name: SfxName, opts?: PlayOpts): void;
  startMusic(theme: MusicTheme): void;
  stopMusic(fadeSec?: number): void;
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
  setMuted(m: boolean): void;
  duck(amount: number, sec: number): void;
  readonly ready: boolean;
}

// ---------------------------------------------------------------- tuning

const MASTER = 0.9;
/** Music sits well under the SFX: at equal slider positions it plays at about a third of their level. */
const MUSIC_TRIM = 0.36;
/** Level of the shared reverb return. */
const ROOM = 0.42;
/** Music scheduler: how far ahead notes are scheduled and how often the timer wakes up. */
const LOOKAHEAD = 0.2;
const TICK_MS = 50;
/** Voice caps keep phones cool: per song, across a crossfade, and for overlapping SFX. */
const SONG_VOICES = 12;
const MUSIC_VOICES = 16;
const SFX_VOICES = 32;
const CROSSFADE = 1.2;

/** Minimum gap between two plays of the same sound (seconds); frequent sounds must not pile up. */
const RATE: Partial<Record<SfxName, number>> = {
  press: 0.04, slide: 0.05, plop: 0.045, park: 0.05, bowlOut: 0.05, blocked: 0.08, full: 0.2,
  button: 0.03, map: 0.04, thaw: 0.07, lid: 0.08, reveal: 0.08, unlock: 0.1, link: 0.06,
  hint: 0.12, undo: 0.06, star: 0.05, serve: 0.1, stuck: 0.5, win: 0.5, newMechanic: 0.3,
};
/** Sounds that always play even when the SFX voice cap is reached. */
const IMPORTANT = new Set<SfxName>(['win', 'serve', 'star', 'stuck']);

// ---------------------------------------------------------------- small helpers

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const pageHidden = () => typeof document !== 'undefined' && document.hidden === true;
/** Swallows a rejected promise (resume/suspend) without assuming the call returned one. */
const quiet = (p: unknown) => {
  if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => undefined);
};

function hash(a: number, b: number): number {
  let h = (a ^ Math.imul((b + 0x9e3779b9) | 0, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 13;
  return h >>> 0 || 1;
}

/** Small deterministic generator (xorshift32): every bar gets its own seeded stream. */
class Rand {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s ^= this.s << 13;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5;
    return (this.s >>> 0) / 4294967296;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length)];
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
}

/** Remembers when scheduled voices end so callers can cap how many overlap. */
class Voices {
  private spans: [number, number][] = [];
  count(now: number, t0: number, t1: number): number {
    this.spans = this.spans.filter((s) => s[1] > now);
    let n = 0;
    for (const s of this.spans) if (s[0] < t1 && s[1] > t0) n++;
    return n;
  }
  add(t0: number, t1: number): void {
    this.spans.push([t0, t1]);
  }
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
/** Semitone offset of scale degree `i` (any integer: it wraps into octaves). */
const deg = (scale: readonly number[], i: number) => {
  const n = scale.length;
  const o = Math.floor(i / n);
  return scale[i - o * n] + 12 * o;
};
/** Moves `m` by whole octaves into [lo, lo + 12). */
const fold = (m: number, lo: number) => m - 12 * Math.floor((m - lo) / 12);
/** The member of `cands` closest to `x`; ties and near-ties are broken randomly for variety. */
const nearest = (x: number, cands: number[], r: Rand) => {
  let best = cands[0];
  let bd = Infinity;
  for (const c of cands) {
    const d = Math.abs(c - x) + r.next() * 0.9;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
};
/** Chord-tone scale indexes (chord rooted on degree `d`, 7-note scale) inside [lo, hi]. */
const chordTones = (d: number, lo: number, hi: number, size = 3) => {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const rel = (((i - d) % 7) + 7) % 7;
    if (rel === 0 || rel === 2 || rel === 4 || (size > 3 && rel === 6)) out.push(i);
  }
  return out;
};

// ---------------------------------------------------------------- voice specs

/** A shared route for voices at one stereo position and reverb amount (no per-voice panner or send). */
interface Lane {
  dest: AudioNode;
  send: GainNode | null;
}

/** Where voices go: a dry destination, an optional reverb input, cached lanes, optional voice accounting. */
interface Out {
  dry: AudioNode;
  wet: AudioNode | null;
  lanes: Map<number, Lane>;
  track?: Voices;
}

interface Env {
  /** peak gain */
  g: number;
  /** attack, hold at peak, then decay to silence (all seconds; `d` is the time to -60 dB) */
  a?: number;
  h?: number;
  d: number;
  /** linear release instead of exponential (pads, bowed and blown notes) */
  lin?: boolean;
  pan?: number;
  wet?: number;
}

interface ToneSpec extends Env {
  type?: OscillatorType;
  f: number;
  /** pitch glide target (Hz), starting `at` seconds after the note, lasting `glide` seconds */
  to?: number;
  at?: number;
  glide?: number;
  det?: number;
  /** extra oscillators through the same filter and envelope: frequency ratio, detune, level */
  add?: { type?: OscillatorType; mul?: number; det?: number; g?: number }[];
  /** low-pass cutoff with an optional sweep to `lpTo` over `lpT` seconds */
  lp?: number;
  lpTo?: number;
  lpT?: number;
  q?: number;
  hp?: number;
  /** vibrato depth (cents), rate (Hz) and onset delay (s) */
  vib?: number;
  vibHz?: number;
  vibAt?: number;
}

interface NoiseSpec extends Env {
  type?: BiquadFilterType;
  f: number;
  to?: number;
  sweep?: number;
  q?: number;
  /** extra low-pass that tames the top end */
  lp?: number;
  rate?: number;
}

interface FmSpec extends Env {
  f: number;
  ratio: number;
  /** modulation index at the strike, falling to `index * idxEnd` over `idxT` seconds */
  index: number;
  idxT?: number;
  idxEnd?: number;
  det?: number;
  to?: number;
  glide?: number;
}

type CtxCtor = new (opts?: AudioContextOptions) => AudioContext;

// ---------------------------------------------------------------- engine

export class AudioEngine implements Audio {
  ctx: AudioContext | null = null;
  musicBus: GainNode | null = null;
  musicWet: GainNode | null = null;
  readonly musicVoices = new Voices();
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private sfxWet: GainNode | null = null;
  private duckDry: GainNode | null = null;
  private duckWet: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private sfxOut: Out | null = null;
  private readonly sfxVoices = new Voices();
  private readonly last = new Map<SfxName, number>();
  private sfxVol = 1;
  private musicVol = 1;
  private muted = false;
  private failed = false;
  private wantTheme: MusicTheme | null = null;
  private song: Song | null = null;
  private duckLevel = 1;
  private duckEnd = 0;
  private suspendedByHide = false;

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** True when music would be inaudible anyway: the scheduler keeps time but creates no voices. */
  get musicSilent(): boolean {
    return this.muted || this.musicVol <= 0.001;
  }

  unlock(): void {
    try {
      if (!this.ctx && !this.failed) this.init();
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state !== 'running' && !pageHidden()) {
        quiet(ctx.resume());
        this.poke();
      }
      if (this.wantTheme && !this.song) this.startMusic(this.wantTheme);
    } catch {
      /* audio is optional */
    }
  }

  private init(): void {
    const g = globalThis as unknown as { AudioContext?: CtxCtor; webkitAudioContext?: CtxCtor };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) {
      this.failed = true;
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      this.failed = true;
      return;
    }
    this.ctx = ctx;
    const gain = (v: number, to: AudioNode) => {
      const n = ctx.createGain();
      n.gain.value = v;
      n.connect(to);
      return n;
    };
    // A gentle safety compressor: catches the rare pile-up without pumping the music.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = gain(this.muted ? 0 : MASTER, comp);
    this.sfxBus = gain(this.sfxVol, this.master);
    this.duckDry = gain(1, this.master);
    this.musicBus = gain(this.musicVol * MUSIC_TRIM, this.duckDry);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.room();
    reverb.connect(gain(ROOM, this.master));
    this.sfxWet = gain(this.sfxVol, reverb);
    this.duckWet = gain(1, reverb);
    this.musicWet = gain(this.musicVol * MUSIC_TRIM, this.duckWet);
    this.sfxOut = { dry: this.sfxBus, wet: this.sfxWet, lanes: new Map(), track: this.sfxVoices };
    // Two seconds of white noise, looped and filtered into swishes, steam, shakers and breath.
    const sr = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => this.onVisibility());
    }
  }

  /** Impulse response of a small tiled kitchen: a few early reflections and a short, darkening tail. */
  private room(): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.4);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / sr;
        // Air absorption: a one-pole low-pass that closes as the tail decays (no harsh highs).
        lp += (0.08 + 0.5 * Math.exp(-x * 3.2)) * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-x * 4.6) * Math.min(1, x / 0.008);
      }
      const early = ch ? [[0.011, 0.34], [0.023, 0.22], [0.041, 0.14]] : [[0.007, 0.36], [0.019, 0.24], [0.033, 0.15]];
      for (const [sec, a] of early) d[Math.floor(sec * sr)] += a;
    }
    return buf;
  }

  /** Plays one silent frame: older iOS only unlocks audio once something starts inside the gesture. */
  private poke(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  }

  private onVisibility(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (pageHidden()) {
        if (ctx.state === 'running') {
          this.suspendedByHide = true;
          quiet(ctx.suspend());
        }
      } else if (this.suspendedByHide) {
        this.suspendedByHide = false;
        quiet(ctx.resume());
      }
    } catch {
      /* ignore */
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVol = clamp(finite(v, this.sfxVol), 0, 1);
    this.glideParam(this.sfxBus?.gain, this.sfxVol);
    this.glideParam(this.sfxWet?.gain, this.sfxVol);
  }

  setMusicVolume(v: number): void {
    this.musicVol = clamp(finite(v, this.musicVol), 0, 1);
    this.glideParam(this.musicBus?.gain, this.musicVol * MUSIC_TRIM);
    this.glideParam(this.musicWet?.gain, this.musicVol * MUSIC_TRIM);
  }

  setMuted(m: boolean): void {
    this.muted = !!m;
    this.glideParam(this.master?.gain, this.muted ? 0 : MASTER, 0.05);
  }

  /** A short linear ramp from wherever the parameter is now: no clicks, exact zero at the end. */
  private glideParam(p: AudioParam | undefined, v: number, sec = 0.03): void {
    const ctx = this.ctx;
    if (!ctx || !p) return;
    try {
      const now = ctx.currentTime;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(v, now + sec);
    } catch {
      /* ignore */
    }
  }

  duck(amount: number, sec: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.duckDry || !this.duckWet) return;
    if (!Number.isFinite(amount) || !Number.isFinite(sec)) return;
    const now = ctx.currentTime;
    let level = clamp(amount, 0, 1);
    let end = now + Math.max(0, sec);
    // Overlapping requests merge: the deeper level and the later end win.
    if (now < this.duckEnd) {
      level = Math.min(level, this.duckLevel);
      end = Math.max(end, this.duckEnd);
    }
    this.duckLevel = level;
    this.duckEnd = end;
    const down = now + 0.12;
    const hold = Math.max(down, end);
    for (const node of [this.duckDry, this.duckWet]) {
      const g = node.gain;
      try {
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(level, down);
        g.setValueAtTime(level, hold);
        g.linearRampToValueAtTime(1, hold + 0.9);
      } catch {
        /* ignore */
      }
    }
  }

  startMusic(theme: MusicTheme): void {
    if (!Object.prototype.hasOwnProperty.call(THEMES, theme)) return;
    this.wantTheme = theme;
    if (!this.ctx || !this.musicBus || !this.musicWet) return;
    if (this.song && this.song.theme === theme) return;
    try {
      this.song?.stop(CROSSFADE);
      this.song = null;
      this.song = new Song(this, theme, (Math.random() * 0xffffffff) >>> 0);
    } catch {
      this.song = null;
    }
  }

  stopMusic(fadeSec = 1): void {
    this.wantTheme = null;
    const s = this.song;
    this.song = null;
    try {
      s?.stop(Math.max(0.03, finite(fadeSec, 1)));
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- building blocks

  /**
   * Sends a voice to its destination and the shared room through a cached lane (pan in steps of 1/8,
   * reverb send in steps of 0.05), so a voice costs no panner or send node of its own.
   */
  private route(src: AudioNode, o: Out, e: Env): void {
    const ctx = this.ctx!;
    const pan = Math.round(clamp(finite(e.pan, 0), -1, 1) * 8) / 8;
    const wet = o.wet ? Math.round(clamp(finite(e.wet, 0), 0, 1) * 20) / 20 : 0;
    const key = pan * 100 + wet;
    let lane = o.lanes.get(key);
    if (!lane) {
      let dest: AudioNode = o.dry;
      if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        p.connect(o.dry);
        dest = p;
      }
      let send: GainNode | null = null;
      if (wet > 0 && o.wet) {
        send = ctx.createGain();
        send.gain.value = wet;
        send.connect(o.wet);
      }
      lane = { dest, send };
      o.lanes.set(key, lane);
    }
    src.connect(lane.dest);
    if (lane.send) src.connect(lane.send);
  }

  /** Attack, hold, then an exponential (or linear) fall to true silence. Returns the silent time. */
  private env(p: AudioParam, t: number, e: Env): number {
    const a = Math.max(0.001, finite(e.a, 0.004));
    const h = Math.max(0, finite(e.h, 0));
    const g = Math.max(1e-4, finite(e.g, 0));
    const end = t + a + h + Math.max(0.01, finite(e.d, 0.1));
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(g, t + a);
    if (h > 0) p.setValueAtTime(g, t + a + h);
    if (e.lin) p.linearRampToValueAtTime(0, end);
    else {
      p.exponentialRampToValueAtTime(g * 0.001, end);
      p.linearRampToValueAtTime(0, end + 0.01);
    }
    return end + 0.01;
  }

  /** Time at which a voice with this envelope falls silent (for voice accounting before creating it). */
  static endOf(t: number, e: Env): number {
    return t + Math.max(0.001, finite(e.a, 0.004)) + Math.max(0, finite(e.h, 0)) + Math.max(0.01, finite(e.d, 0.1)) + 0.01;
  }

  /** Oscillator voice (optionally several oscillators) with glide, filter sweep and vibrato. */
  tone(o: Out, t: number, s: ToneSpec): number {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const end = this.env(g.gain, t, s);
    let head: AudioNode = g;
    if (s.hp) {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = s.hp;
      f.connect(head);
      head = f;
    }
    if (s.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = s.q ?? 0.7;
      // Constant values stay off the automation timeline: cheaper (no per-sample coefficients).
      if (s.lpTo) {
        f.frequency.setValueAtTime(s.lp, t);
        f.frequency.exponentialRampToValueAtTime(s.lpTo, t + Math.max(0.01, s.lpT ?? (end - t) * 0.5));
      } else f.frequency.value = s.lp;
      f.connect(head);
      head = f;
    }
    let lfoGain: GainNode | null = null;
    let lfo: OscillatorNode | null = null;
    if (s.vib) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = s.vibHz ?? 5;
      lfoGain = ctx.createGain();
      const on = t + (s.vibAt ?? 0);
      lfoGain.gain.setValueAtTime(0, t);
      lfoGain.gain.setValueAtTime(0, on);
      lfoGain.gain.linearRampToValueAtTime(s.vib, on + 0.35);
      lfo.connect(lfoGain);
    }
    const parts = [{ type: s.type, mul: 1, det: s.det ?? 0, g: 1 }, ...(s.add ?? [])];
    for (const part of parts) {
      const osc = ctx.createOscillator();
      osc.type = part.type ?? 'sine';
      const mul = part.mul ?? 1;
      const fq = osc.frequency;
      if (s.to) {
        const t1 = t + (s.at ?? 0);
        fq.setValueAtTime(s.f * mul, t);
        if (s.at) fq.setValueAtTime(s.f * mul, t1);
        fq.exponentialRampToValueAtTime(s.to * mul, t1 + Math.max(0.005, s.glide ?? (end - t1) * 0.6));
      } else fq.value = s.f * mul;
      if (part.det) osc.detune.value = part.det;
      if (lfoGain) lfoGain.connect(osc.detune);
      if (part.g !== undefined && part.g !== 1) {
        const pg = ctx.createGain();
        pg.gain.value = part.g;
        osc.connect(pg);
        pg.connect(head);
      } else osc.connect(head);
      osc.start(t);
      osc.stop(end + 0.02);
    }
    if (lfo) {
      lfo.start(t);
      lfo.stop(end + 0.02);
    }
    this.route(g, o, s);
    o.track?.add(t, end);
    return end;
  }

  /** Filtered noise burst (swishes, steam, sizzle, shakers, brushes, breath). */
  noise(o: Out, t: number, s: NoiseSpec): number {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return t;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = s.rate ?? 1;
    const g = ctx.createGain();
    const end = this.env(g.gain, t, s);
    const f = ctx.createBiquadFilter();
    f.type = s.type ?? 'bandpass';
    f.Q.value = s.q ?? 1;
    if (s.to) {
      f.frequency.setValueAtTime(s.f, t);
      f.frequency.exponentialRampToValueAtTime(s.to, t + Math.max(0.01, s.sweep ?? end - t));
    } else f.frequency.value = s.f;
    src.connect(f);
    if (s.lp) {
      const l = ctx.createBiquadFilter();
      l.type = 'lowpass';
      l.frequency.value = s.lp;
      f.connect(l);
      l.connect(g);
    } else f.connect(g);
    this.route(g, o, s);
    src.start(t, Math.random() * 1.8);
    src.stop(end + 0.02);
    o.track?.add(t, end);
    return end;
  }

  /** Two-operator FM: bells, tines, mallets, electric piano. */
  fm(o: Out, t: number, s: FmSpec): number {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    const g = ctx.createGain();
    const end = this.env(g.gain, t, s);
    if (s.to) {
      const t1 = t + Math.max(0.005, s.glide ?? (end - t) * 0.5);
      car.frequency.setValueAtTime(s.f, t);
      mod.frequency.setValueAtTime(s.f * s.ratio, t);
      car.frequency.exponentialRampToValueAtTime(s.to, t1);
      mod.frequency.exponentialRampToValueAtTime(s.to * s.ratio, t1);
    } else {
      car.frequency.value = s.f;
      mod.frequency.value = s.f * s.ratio;
    }
    if (s.det) {
      car.detune.value = s.det;
      mod.detune.value = s.det;
    }
    const i0 = Math.max(0.01, s.f * s.index);
    mg.gain.setValueAtTime(i0, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.01, i0 * (s.idxEnd ?? 0.03)), t + Math.max(0.005, s.idxT ?? (end - t) * 0.5));
    mod.connect(mg);
    mg.connect(car.frequency);
    car.connect(g);
    this.route(g, o, s);
    car.start(t);
    mod.start(t);
    car.stop(end + 0.02);
    mod.stop(end + 0.02);
    o.track?.add(t, end);
    return end;
  }

  // ---------------------------------------------------------------- sfx

  play(name: SfxName, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    const out = this.sfxOut;
    if (!ctx || !out || ctx.state !== 'running' || this.muted || this.sfxVol <= 0.001) return;
    const o = opts ?? {};
    const v = clamp(finite(o.volume, 1), 0, 2);
    if (v <= 0.001) return;
    const now = ctx.currentTime;
    const gap = RATE[name];
    const prev = this.last.get(name);
    if (gap !== undefined && prev !== undefined && now - prev < gap) return;
    if (!IMPORTANT.has(name) && this.sfxVoices.count(now, now, now + 0.05) >= SFX_VOICES) return;
    this.last.set(name, now);
    try {
      this.sfx(name, now + 0.006, v, clamp(finite(o.pan, 0), -1, 1), clamp(finite(o.pitch, 1), 0.25, 4), out);
    } catch {
      /* never break the game because of audio */
    }
    // The fanfare gets the stage: the music steps back while it plays.
    if (name === 'win') this.duck(0.35, 2.1);
  }

  /** Marimba-like mallet: round fundamental plus the bar's quick woody overtone (~4x). */
  private mallet(o: Out, t: number, f: number, g: number, pan = 0, d = 0.6): void {
    this.tone(o, t, { f, g, a: 0.002, d, pan, wet: 0.2 });
    this.tone(o, t, { f: f * 3.93, g: g * 0.22, a: 0.001, d: Math.min(0.09, d * 0.3), pan, wet: 0.2 });
  }

  /** Struck bell: fundamental with a slowly beating twin, fast-fading upper partials, a metal tick. */
  private bell(o: Out, t: number, f: number, g: number, pan = 0, d = 1.6): void {
    this.tone(o, t, { f, g, a: 0.002, d, pan, wet: 0.35 });
    this.tone(o, t, { f: f * 1.0035, g: g * 0.45, a: 0.002, d: d * 0.8, pan, wet: 0.35 });
    this.tone(o, t, { f: f * 2.01, g: g * 0.28, a: 0.002, d: d * 0.42, pan, wet: 0.3 });
    this.tone(o, t, { f: f * 2.76, g: g * 0.2, a: 0.001, d: d * 0.2, pan, wet: 0.3 });
    this.noise(o, t, { type: 'highpass', f: 2500, g: g * 0.25, a: 0.001, d: 0.015, pan, lp: 7000 });
  }

  private sfx(name: SfxName, t: number, v: number, pan: number, P: number, o: Out): void {
    const jit = (a: number) => 1 + (Math.random() - 0.5) * a;
    switch (name) {
      case 'press': {
        // Fingertip on a wooden cutting board: a short "tok" plus the board's inharmonic ring.
        const f = 330 * P * jit(0.08);
        this.tone(o, t, { f, to: f * 0.84, glide: 0.035, g: 0.2 * v, a: 0.002, d: 0.09, pan, wet: 0.08 });
        this.tone(o, t, { f: f * 2.71, g: 0.04 * v, a: 0.001, d: 0.04, pan });
        this.noise(o, t, { f: 1500 * P, q: 1.4, g: 0.045 * v, a: 0.001, d: 0.025, pan, lp: 4000 });
        break;
      }
      case 'slide': {
        // A short airy swish rising as the tile slides away.
        const f = 850 * P * jit(0.15);
        this.noise(o, t, { f, to: f * 2.4, q: 0.9, g: 0.085 * v, a: 0.06, d: 0.17, pan, lp: 3200, wet: 0.1 });
        break;
      }
      case 'plop': {
        // Into the pot: a round "bloop" diving fast, a soft body under it, and usually a tiny bubble.
        const f = 560 * P * jit(0.04);
        this.tone(o, t, { f: f * 1.25, to: f * 0.5, glide: 0.075, g: 0.24 * v, a: 0.003, d: 0.16, pan, wet: 0.14 });
        this.tone(o, t, { f: 150 * P, to: 105 * P, glide: 0.06, g: 0.07 * v, a: 0.003, d: 0.1, pan });
        if (Math.random() < 0.8) {
          const b = f * 1.5 * jit(0.2);
          this.tone(o, t + 0.07 + Math.random() * 0.035, {
            f: b, to: b * 1.6, glide: 0.035, g: 0.045 * v, a: 0.002, d: 0.05, pan: clamp(pan + (Math.random() - 0.5) * 0.3, -1, 1), wet: 0.2,
          });
        }
        break;
      }
      case 'park': {
        // Into the side bowl: a light ceramic clink (two inharmonic partials) and a soft settle.
        const f = 1240 * P * jit(0.05);
        this.tone(o, t, { f, g: 0.09 * v, a: 0.001, d: 0.22, pan, wet: 0.22 });
        this.tone(o, t, { f: f * 2.37, g: 0.035 * v, a: 0.001, d: 0.1, pan, wet: 0.22 });
        this.noise(o, t, { f: 3200, q: 2, g: 0.022 * v, a: 0.001, d: 0.012, pan });
        this.tone(o, t, { f: 260 * P, to: 190 * P, glide: 0.04, g: 0.075 * v, a: 0.002, d: 0.06, pan });
        break;
      }
      case 'bowlOut': {
        // A small cork-like pop: a quick upward pitch flick with a puff of air.
        const f = 420 * P * jit(0.08);
        this.tone(o, t, { f, to: f * 2.3, glide: 0.03, g: 0.22 * v, a: 0.002, d: 0.07, pan, wet: 0.12 });
        this.noise(o, t, { f: 1400, q: 0.8, g: 0.065 * v, a: 0.001, d: 0.025, pan, lp: 3500 });
        break;
      }
      case 'blocked': {
        // A dull, soft wooden thunk and a quieter settle: "can't go".
        this.tone(o, t, { type: 'triangle', f: 165 * P, to: 110 * P, glide: 0.07, lp: 600, g: 0.17 * v, a: 0.003, d: 0.14, pan, wet: 0.06 });
        this.tone(o, t, { f: 430 * P, to: 340 * P, glide: 0.04, g: 0.1 * v, a: 0.002, d: 0.08, pan });
        this.noise(o, t, { f: 800, q: 1.2, g: 0.08 * v, a: 0.001, d: 0.035, pan, lp: 2000 });
        this.tone(o, t + 0.09, { type: 'triangle', f: 140 * P, to: 100 * P, glide: 0.05, lp: 500, g: 0.06 * v, a: 0.003, d: 0.1, pan });
        break;
      }
      case 'full': {
        // Two quick muted taps on a full ceramic bowl.
        for (const [dt, k] of [[0, 1], [0.1, 0.94]] as const) {
          const f = 980 * P * k;
          this.tone(o, t + dt, { f, g: 0.07 * v, a: 0.001, d: 0.07, pan, wet: 0.1 });
          this.tone(o, t + dt, { f: f * 2.21, g: 0.022 * v, a: 0.001, d: 0.035, pan });
          this.noise(o, t + dt, { type: 'lowpass', f: 1800, g: 0.03 * v, a: 0.001, d: 0.02, pan });
        }
        break;
      }
      case 'serve': {
        // "Ding!" — the service bell, then a soft sizzle with a few crackles.
        this.bell(o, t, 1318.5 * P, 0.085 * v, pan, 1.7);
        this.tone(o, t, { f: 1318.5 * P * 5.4, g: 0.008 * v, a: 0.001, d: 0.12, pan });
        this.noise(o, t + 0.05, { f: 4200, q: 0.6, g: 0.014 * v, a: 0.08, h: 0.12, d: 0.45, lp: 7000, pan: pan * 0.5, wet: 0.2 });
        for (let i = 0; i < 9; i++) {
          const dt = 0.06 + Math.random() * 0.6;
          this.noise(o, t + dt, {
            f: 2500 + Math.random() * 3000, q: 1.5, g: (0.012 + Math.random() * 0.018) * v * (1 - dt), a: 0.001, d: 0.02 + Math.random() * 0.02,
            pan: clamp(pan + (Math.random() - 0.5) * 0.6, -1, 1),
          });
        }
        break;
      }
      case 'lid': {
        // A pot lid lifting: inharmonic metal clank, a breath of steam, a short shimmer.
        const f = 520 * P * jit(0.04);
        this.fm(o, t, { f, ratio: 1.41, index: 2.4, idxT: 0.12, idxEnd: 0.1, g: 0.09 * v, a: 0.001, d: 0.45, pan, wet: 0.25 });
        this.fm(o, t + 0.012, { f: f * 2.13, ratio: 1.73, index: 1.4, idxT: 0.08, g: 0.04 * v, a: 0.001, d: 0.25, pan, wet: 0.25 });
        this.noise(o, t, { f: 2600, q: 1.2, g: 0.05 * v, a: 0.001, d: 0.04, pan, lp: 6000 });
        this.noise(o, t + 0.06, { f: 1200, to: 2600, q: 0.7, g: 0.025 * v, a: 0.1, d: 0.35, pan, lp: 5000, wet: 0.3 });
        [88, 92, 95].forEach((m, i) => this.fm(o, t + 0.16 + i * 0.06, { f: mtof(m) * P, ratio: 3.5, index: 0.4, g: 0.03 * v, d: 0.6, pan, wet: 0.45 }));
        break;
      }
      case 'reveal': {
        // The silver cloche lifts: a soft metallic "shing" sweeping up, ending in a light ping.
        const f = 1050 * P;
        this.tone(o, t, { f, to: f * 1.9, glide: 0.22, g: 0.045 * v, a: 0.04, d: 0.6, pan, wet: 0.45 });
        this.tone(o, t, { f: f * 2.76, to: f * 2.76 * 1.9, glide: 0.22, g: 0.016 * v, a: 0.04, d: 0.35, pan, wet: 0.45 });
        this.noise(o, t, { f: 1500, to: 4500, sweep: 0.25, q: 1.6, g: 0.022 * v, a: 0.14, d: 0.22, pan, lp: 6000, wet: 0.35 });
        this.fm(o, t + 0.2, { f: mtof(100) * P, ratio: 3.5, index: 0.3, g: 0.03 * v, d: 0.7, pan, wet: 0.5 });
        break;
      }
      case 'unlock': {
        // Kitchen timer: tick, tick, ding.
        for (const dt of [0, 0.12]) {
          this.noise(o, t + dt, { f: 3000, q: 3, g: 0.05 * v, a: 0.001, d: 0.015, pan });
          this.tone(o, t + dt, { f: 1900 * P, g: 0.03 * v, a: 0.001, d: 0.025, pan });
        }
        this.bell(o, t + 0.26, mtof(93) * P, 0.045 * v, pan, 0.9);
        break;
      }
      case 'link': {
        // Two tied ingredients: a gentle plucked-twine twang (resonant filter closing, pitch settling).
        const f = 196 * P * jit(0.03);
        this.tone(o, t, { type: 'sawtooth', f: f * 1.06, to: f, glide: 0.06, lp: 2600, lpTo: 380, lpT: 0.22, q: 5, g: 0.07 * v, a: 0.002, d: 0.45, pan, wet: 0.15 });
        this.tone(o, t + 0.045, {
          type: 'sawtooth', f: f * 1.5 * 1.05, to: f * 1.5, glide: 0.06, lp: 2400, lpTo: 420, lpT: 0.2, q: 5, g: 0.045 * v, a: 0.002, d: 0.4,
          pan: clamp(pan + 0.15, -1, 1), wet: 0.15,
        });
        break;
      }
      case 'thaw': {
        // Ice melting: a few glassy pings, a whisper of frost, then a droplet of meltwater.
        const notes = [84, 86, 88, 91, 93, 96];
        for (let i = 0; i < 4; i++) {
          const f = mtof(notes[Math.floor(Math.random() * notes.length)]) * P;
          const dt = i * 0.045 + Math.random() * 0.02;
          const pp = clamp(pan + (Math.random() - 0.5) * 0.5, -1, 1);
          this.tone(o, t + dt, { f, g: 0.035 * v, a: 0.001, d: 0.35, pan: pp, wet: 0.45 });
          this.tone(o, t + dt, { f: f * 2.71, g: 0.01 * v, a: 0.001, d: 0.08, pan: pp });
        }
        this.noise(o, t, { type: 'highpass', f: 3500, g: 0.01 * v, a: 0.02, d: 0.18, lp: 7000, pan, wet: 0.3 });
        const dr = 900 * P * jit(0.1);
        this.tone(o, t + 0.22, { f: dr, to: dr * 1.7, glide: 0.04, g: 0.05 * v, a: 0.002, d: 0.07, pan, wet: 0.25 });
        break;
      }
      case 'win': {
        const w = v * 0.7;
        // "Order up!": a marimba run, a "ta-daa", the order bell over a kalimba chord, two sparkles.
        [67, 72, 76, 79].forEach((m, i) => this.mallet(o, t + i * 0.09, mtof(m), 0.12 * w, -0.3 + i * 0.2));
        this.mallet(o, t + 0.4, mtof(81), 0.1 * w, 0.2, 0.3);
        this.mallet(o, t + 0.4, mtof(77), 0.07 * w, -0.2, 0.3);
        const hit = t + 0.56;
        [84, 79, 76].forEach((m) => this.mallet(o, hit, mtof(m), 0.08 * w, 0, 1));
        this.bell(o, hit + 0.02, mtof(91), 0.07 * w, 0.15, 1.6);
        [60, 67, 72, 76, 79].forEach((m, i) =>
          this.fm(o, hit + 0.05 + i * 0.045, { f: mtof(m), ratio: 5.4, index: 0.6, idxT: 0.1, g: 0.05 * w, d: 1.3, wet: 0.35, pan: (i - 2) * 0.15 }),
        );
        this.tone(o, hit, { type: 'triangle', f: mtof(48), lp: 700, g: 0.09 * w, a: 0.004, d: 1.2 });
        this.fm(o, hit + 0.55, { f: mtof(100), ratio: 3.5, index: 0.3, g: 0.022 * w, d: 0.9, wet: 0.6, pan: 0.4 });
        this.fm(o, hit + 0.8, { f: mtof(103), ratio: 3.5, index: 0.3, g: 0.018 * w, d: 0.9, wet: 0.6, pan: -0.4 });
        break;
      }
      case 'star': {
        // pitch 1, 1.12, 1.24 → the three stars climb a major triad: E6, G6, C7.
        const i = clamp(Math.round((P - 1) / 0.12), 0, 4);
        const f = mtof([88, 91, 96, 100, 103][i]);
        this.fm(o, t, { f, ratio: 3.5, index: 0.9, idxT: 0.15, g: 0.08 * v, d: 1.2, pan, wet: 0.45 });
        this.tone(o, t, { f: f * 2, g: 0.018 * v, d: 0.4, pan, wet: 0.5 });
        this.tone(o, t + 0.05, { f: f * 1.5, g: 0.022 * v, d: 0.6, pan: -pan, wet: 0.5 });
        if (i >= 2) this.fm(o, t + 0.12, { f: f * 2, ratio: 3.5, index: 0.3, g: 0.018 * v, d: 0.8, pan: -pan, wet: 0.6 });
        break;
      }
      case 'stuck': {
        // Kitchen jam: a soft descending "aww" (E5 → C5, the second note sagging a little).
        const a = mtof(76) * P;
        const b = mtof(72) * P;
        this.tone(o, t, { type: 'triangle', f: a, g: 0.022 * v, a: 0.03, h: 0.12, d: 0.25, lin: true, lp: 1800, vib: 12, vibHz: 5, vibAt: 0.05, pan, wet: 0.3 });
        this.tone(o, t + 0.3, {
          type: 'triangle', f: b, to: b * 0.94, at: 0.2, glide: 0.35, g: 0.024 * v, a: 0.04, h: 0.25, d: 0.4, lin: true, lp: 1600, vib: 18, vibHz: 4.5,
          vibAt: 0.1, pan, wet: 0.35,
        });
        this.tone(o, t + 0.3, { f: b / 2, g: 0.013 * v, a: 0.05, h: 0.2, d: 0.4, lin: true, pan });
        break;
      }
      case 'undo': {
        // A reversed swish: swells in, falls in pitch, stops short.
        this.noise(o, t, { f: 2000, to: 600, q: 1.1, g: 0.065 * v, a: 0.16, d: 0.06, pan, lp: 4000, wet: 0.15 });
        this.tone(o, t + 0.02, { f: 820 * P, to: 520 * P, glide: 0.16, g: 0.03 * v, a: 0.13, d: 0.06, pan, wet: 0.2 });
        break;
      }
      case 'hint': {
        // A soft twinkle: C6, G6, C7.
        [84, 91, 96].forEach((m, i) =>
          this.fm(o, t + i * 0.075, { f: mtof(m) * P, ratio: 3.5, index: 0.3 - i * 0.07, idxT: 0.1, g: (0.045 - i * 0.008) * v, d: 0.9, pan: clamp(pan + (i - 1) * 0.2, -1, 1), wet: 0.5 }),
        );
        this.noise(o, t + 0.05, { type: 'highpass', f: 4000, g: 0.006 * v, a: 0.05, d: 0.3, lp: 7000, pan, wet: 0.4 });
        break;
      }
      case 'button': {
        // A soft cushioned pop.
        const f = 620 * P * jit(0.04);
        this.tone(o, t, { f: f * 1.3, to: f, glide: 0.02, g: 0.13 * v, a: 0.002, d: 0.06, pan, wet: 0.05 });
        this.noise(o, t, { f: 2200, q: 1.2, g: 0.022 * v, a: 0.001, d: 0.012, pan, lp: 5000 });
        break;
      }
      case 'newMechanic': {
        // "Hm? What's this?": kalimba notes climbing, the last one lifting like a question.
        for (const [m, dt] of [[79, 0], [81, 0.11], [84, 0.22], [86, 0.4]] as const) {
          this.fm(o, t + dt, { f: mtof(m) * P, ratio: 5.4, index: 0.55, idxT: 0.08, g: 0.045 * v, d: 0.7, pan, wet: 0.35 });
        }
        this.tone(o, t + 0.4, { f: mtof(86) * P, to: mtof(88) * P, at: 0.08, glide: 0.18, g: 0.02 * v, a: 0.01, d: 0.6, pan, wet: 0.4 });
        this.tone(o, t, { type: 'triangle', f: mtof(55) * P, lp: 800, g: 0.04 * v, a: 0.01, d: 0.6, pan });
        break;
      }
      case 'map': {
        // A plate set down: soft knock and a ceramic clink.
        const f = 1050 * P * jit(0.04);
        this.tone(o, t, { f, g: 0.06 * v, a: 0.001, d: 0.3, pan, wet: 0.25 });
        this.tone(o, t, { f: f * 2.48, g: 0.022 * v, a: 0.001, d: 0.13, pan, wet: 0.25 });
        this.tone(o, t, { f: f * 4.1, g: 0.007 * v, a: 0.001, d: 0.05, pan });
        this.tone(o, t, { f: 380 * P, to: 300 * P, glide: 0.03, g: 0.05 * v, a: 0.002, d: 0.05, pan });
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- music

/** Everything a theme needs to know about the bar being played. */
interface Bar {
  /** bar index since the song started, and its position in the current 8-bar section */
  n: number;
  pos: number;
  /** the section's variant (A or B), fixed for the whole section; the first section is always A */
  alt: boolean;
  /** seconds per beat and per scheduler step */
  beat: number;
  step: number;
  /** random stream seeded by this bar */
  r: Rand;
}

interface ThemeRun {
  /** Called for every step (with swing already applied to `t`). */
  step(p: Song, b: Bar, s: number, t: number): void;
}

interface ThemeSpec {
  bpm: number;
  beats: number;
  /** scheduler steps per beat */
  sub: number;
  /** delay of every odd step, as a fraction of a step */
  swing: number;
  level: number;
  make(): ThemeRun;
}

type Stroke = 'na' | 'tin' | 'ti' | 'ge' | 'gew' | 'ka';

/** One playing theme: a lookahead scheduler plus the instruments its arrangement plays. */
class Song {
  private readonly spec: ThemeSpec;
  private readonly run: ThemeRun;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly out: Out;
  private readonly voices = new Voices();
  private readonly stepDur: number;
  private readonly per: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next: number;
  private k = 0;
  private bar: Bar | null = null;
  private stopAt = 0;
  private dead = false;

  constructor(private readonly eng: AudioEngine, readonly theme: MusicTheme, private readonly seed: number) {
    const ctx = eng.ctx!;
    this.spec = THEMES[theme];
    this.run = this.spec.make();
    this.stepDur = 60 / this.spec.bpm / this.spec.sub;
    this.per = this.spec.beats * this.spec.sub;
    const now = ctx.currentTime;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    for (const g of [this.dry, this.wet]) {
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(this.spec.level, now + 1.5);
    }
    this.dry.connect(eng.musicBus!);
    this.wet.connect(eng.musicWet!);
    this.out = { dry: this.dry, wet: this.wet, lanes: new Map() };
    this.next = now + 0.1;
    this.timer = setInterval(() => this.pump(), TICK_MS);
    this.pump();
  }

  private pump(): void {
    const ctx = this.eng.ctx;
    if (!ctx || this.dead) return;
    const now = ctx.currentTime;
    if (this.stopAt && now >= this.stopAt) return this.dispose();
    // A starved timer (busy main thread) skips ahead instead of bursting a backlog of notes.
    if (this.next < now - 0.25) {
      const skip = Math.ceil((now - this.next) / this.stepDur);
      this.next += skip * this.stepDur;
      this.k += skip;
    }
    for (let guard = 0; this.next < now + LOOKAHEAD && guard < 64; guard++) {
      const t = this.next;
      const k = this.k;
      this.next += this.stepDur;
      this.k++;
      try {
        this.tick(t, k);
      } catch {
        /* a bad note must not stop the music */
      }
    }
  }

  private tick(t: number, k: number): void {
    const s = k % this.per;
    const n = Math.floor(k / this.per);
    if (!this.bar || this.bar.n !== n) {
      const sec = Math.floor(n / 8);
      this.bar = {
        n,
        pos: n % 8,
        alt: sec > 0 && new Rand(hash(this.seed, 0x5eed + sec)).chance(0.5),
        beat: 60 / this.spec.bpm,
        step: this.stepDur,
        r: new Rand(hash(this.seed, n)),
      };
    }
    if (this.eng.musicSilent) return;
    const swing = this.spec.swing && s % 2 === 1 ? this.spec.swing * this.stepDur : 0;
    this.run.step(this, this.bar, s, t + swing);
  }

  /** Fades out (click-free), schedules nothing past the fade, then disconnects. */
  stop(fade: number): void {
    const ctx = this.eng.ctx;
    if (!ctx || this.dead || this.stopAt) return;
    const now = ctx.currentTime;
    this.stopAt = now + fade;
    for (const g of [this.dry, this.wet]) {
      const p = g.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + fade);
    }
    setTimeout(() => this.dispose(), (fade + LOOKAHEAD + 0.5) * 1000);
  }

  private dispose(): void {
    if (this.dead) return;
    this.dead = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    try {
      this.dry.disconnect();
      this.wet.disconnect();
    } catch {
      /* ignore */
    }
  }

  /** Reserves a voice for a note; false (skip the note) when the caps are full or the song is fading. */
  private admit(t: number, e: Env): boolean {
    const end = AudioEngine.endOf(t, e);
    const now = this.eng.ctx!.currentTime;
    if (this.stopAt && t >= this.stopAt) return false;
    if (this.voices.count(now, t, end) >= SONG_VOICES) return false;
    if (this.eng.musicVoices.count(now, t, end) >= MUSIC_VOICES) return false;
    this.voices.add(t, end);
    this.eng.musicVoices.add(t, end);
    return true;
  }

  // ---------------------------------------------------------------- instruments

  /** Music box / celesta tine: a bright "tink" melting into a pure tone. */
  musicBox(t: number, m: number, vel: number, pan = 0): void {
    const e: Env = { g: 0.06 * vel, a: 0.002, d: 1.4, pan, wet: 0.4 };
    if (this.admit(t, e)) this.eng.fm(this.out, t, { ...e, f: mtof(m), ratio: 7, index: 0.5, idxT: 0.06, idxEnd: 0.01 });
  }

  /** Warm slow pad: two detuned triangles per note, the whole chord through one soft low-pass (one voice). */
  pad(t: number, ms: number[], len: number, vel: number): void {
    const e: Env = { g: 0.028 * vel, a: Math.min(0.6, len * 0.3), h: len * 0.4, d: len * 0.5, lin: true, wet: 0.5 };
    if (!this.admit(t, e)) return;
    const f = mtof(ms[0]);
    const add = ms.flatMap((m, i) => {
      const mul = mtof(m) / f;
      return i ? [{ type: 'triangle' as const, mul, det: -6 }, { type: 'triangle' as const, mul, det: 6 }] : [{ type: 'triangle' as const, det: 6 }];
    });
    this.eng.tone(this.out, t, { ...e, type: 'triangle', f, det: -6, add, lp: 1100 });
  }

  /** Round soft bass. */
  softBass(t: number, m: number, len: number, vel: number): void {
    const e: Env = { g: 0.06 * vel, a: 0.02, d: len, wet: 0.1 };
    if (this.admit(t, e)) this.eng.tone(this.out, t, { ...e, type: 'triangle', f: mtof(m), lp: 700, add: [{ g: 0.6 }] });
  }

  /**
   * Mandolin pick; tremolo is many short picks in a row. Each stroke hits one string of the pair, a few
   * cents apart, which gives the course its shimmer with a single oscillator per stroke (cheap).
   */
  mandolin(t: number, m: number, vel: number, ring: number, pan = 0, det = 0): void {
    const e: Env = { g: 0.034 * vel, a: 0.002, d: ring, pan, wet: 0.25 };
    if (this.admit(t, e)) this.eng.tone(this.out, t, { ...e, type: 'sawtooth', f: mtof(m), det, lp: 2400, q: 1.2 });
  }

  /** Accordion chord: per note a square and a saw reed a few cents apart (musette), one bellows (one voice). */
  accordion(t: number, ms: number[], len: number, vel: number): void {
    const e: Env = { g: 0.015 * vel, a: 0.035, h: Math.max(0.02, len - 0.12), d: 0.12, lin: true, wet: 0.3 };
    if (!this.admit(t, e)) return;
    const f = mtof(ms[0]);
    const add = ms.flatMap((m, i) => {
      const mul = mtof(m) / f;
      const saw = { type: 'sawtooth' as const, mul, det: 12 };
      return i ? [{ type: 'square' as const, mul }, saw] : [saw];
    });
    this.eng.tone(this.out, t, { ...e, type: 'square', f, add, lp: 1400, q: 0.5 });
  }

  /** Accordion bass button. */
  accBass(t: number, m: number, len: number, vel: number): void {
    const e: Env = { g: 0.032 * vel, a: 0.012, h: len * 0.4, d: len * 0.6, lin: true, wet: 0.15 };
    if (this.admit(t, e)) this.eng.tone(this.out, t, { ...e, type: 'square', f: mtof(m), add: [{ type: 'triangle', g: 1.2 }], lp: 520 });
  }

  /** Koto: plucked silk string, a bright twang over a round body; can bend up after the pluck (oshide). */
  koto(t: number, m: number, vel: number, pan = 0, bendTo?: number, d = 1.6): void {
    const e: Env = { g: 0.06 * vel, a: 0.002, d, pan, wet: 0.45 };
    if (!this.admit(t, e)) return;
    this.eng.tone(this.out, t, {
      ...e, type: 'triangle', f: mtof(m), add: [{ type: 'sawtooth', g: 0.35 }], lp: 3200, lpTo: 900, lpT: 0.12, q: 2.5,
      to: bendTo === undefined ? undefined : mtof(bendTo), at: 0.22, glide: 0.12,
    });
  }

  /** Shakuhachi-like flute: scooped attack, breath noise, vibrato that blooms late. */
  flute(t: number, m: number, len: number, vel: number, pan = 0): void {
    const f = mtof(m);
    const e: Env = { g: 0.05 * vel, a: 0.14, h: Math.max(0.05, len - 0.2), d: 0.3, lin: true, pan, wet: 0.5 };
    if (!this.admit(t, e)) return;
    this.eng.tone(this.out, t, { ...e, f: f * 0.95, to: f, glide: 0.12, add: [{ type: 'triangle', g: 0.25 }], lp: 2400, vib: 16, vibHz: 4.8, vibAt: Math.min(0.5, len * 0.4) });
    this.eng.noise(this.out, t, { f: Math.min(3000, f * 2.2), q: 1.4, g: 0.011 * vel, a: 0.05, h: Math.max(0.05, len - 0.15), d: 0.25, lin: true, lp: 5000, pan, wet: 0.4 });
    this.eng.noise(this.out, t, { f: 1800, q: 0.8, g: 0.018 * vel, a: 0.01, d: 0.12, pan, wet: 0.3 });
  }

  /** Soft pitched drum with a falling head: far taiko, kotsuzumi "pon". */
  drum(t: number, f0: number, f1: number, vel: number, d: number): void {
    const e: Env = { g: 0.09 * vel, a: 0.003, d, wet: 0.3 };
    if (this.admit(t, e)) this.eng.tone(this.out, t, { ...e, type: 'triangle', f: f0, to: f1, glide: d * 0.4, lp: 900 });
  }

  /** Marimba bar: round fundamental, quick woody overtone at ~4x, optional mallet tick; `lite` = roll repeats. */
  marimba(t: number, m: number, vel: number, pan = 0, d = 0.6, click = true, lite = false): void {
    const f = mtof(m);
    const e: Env = { g: 0.08 * vel, a: 0.002, d, pan, wet: 0.2 };
    if (!this.admit(t, e)) return;
    this.eng.tone(this.out, t, { ...e, f });
    if (lite) return;
    this.eng.tone(this.out, t, { f: f * 3.94, g: e.g * 0.25, a: 0.001, d: Math.min(0.1, d * 0.25), pan });
    if (click) this.eng.noise(this.out, t, { type: 'lowpass', f: 2600, g: 0.018 * vel, a: 0.001, d: 0.012, pan });
  }

  /** Two low marimba bars struck together (the vamp): one voice, two plain sines. */
  dyad(t: number, ms: number[], vel: number, pan = 0): void {
    const e: Env = { g: 0.05 * vel, a: 0.002, d: 0.32, pan, wet: 0.15 };
    if (!this.admit(t, e)) return;
    const f = mtof(ms[0]);
    this.eng.tone(this.out, t, { ...e, f, add: ms.slice(1).map((x) => ({ mul: mtof(x) / f })) });
  }

  /** Guitarrón: deep, round, slightly buzzy pluck. */
  guitarron(t: number, m: number, vel: number): void {
    const f = mtof(m);
    const e: Env = { g: 0.085 * vel, a: 0.003, d: 0.7, wet: 0.12 };
    if (!this.admit(t, e)) return;
    this.eng.tone(this.out, t, { ...e, type: 'triangle', f: f * 1.012, to: f, glide: 0.04, add: [{ type: 'sawtooth', g: 0.35 }], lp: 1300, lpTo: 450, lpT: 0.15, q: 1.2 });
  }

  shaker(t: number, vel: number, pan = 0): void {
    const e: Env = { g: 0.014 * vel, a: 0.012, d: 0.08, pan, wet: 0.08 };
    if (this.admit(t, e)) this.eng.noise(this.out, t, { ...e, f: 4500, q: 0.9, lp: 8000 });
  }

  /** Upright bass: a thumpy pluck with a short bloom. */
  upright(t: number, m: number, len: number, vel: number): void {
    const f = mtof(m);
    const e: Env = { g: 0.06 * vel, a: 0.005, h: 0.04, d: Math.min(0.9, len * 1.3), wet: 0.08 };
    if (this.admit(t, e)) this.eng.tone(this.out, t, { ...e, f: f * 1.02, to: f, glide: 0.03, add: [{ type: 'triangle', g: 0.5 }], lp: 900 });
  }

  /** Electric piano (FM 1:1): a warm bark that mellows. */
  epiano(t: number, ms: number[], len: number, vel: number): void {
    for (const m of ms) {
      const e: Env = { g: 0.05 * vel, a: 0.004, d: clamp(len * 1.2 + 0.15, 0.35, 1.6), pan: (m - 64) * 0.03, wet: 0.25 };
      if (this.admit(t, e)) this.eng.fm(this.out, t, { ...e, f: mtof(m), ratio: 1, index: 1.1, idxT: 0.4, idxEnd: 0.15 });
    }
  }

  /** Vibraphone: a soft mallet on a metal bar. */
  vibes(t: number, m: number, vel: number, pan = 0): void {
    const e: Env = { g: 0.06 * vel, a: 0.002, d: 1.5, pan, wet: 0.4 };
    if (this.admit(t, e)) this.eng.fm(this.out, t, { ...e, f: mtof(m), ratio: 4, index: 0.35, idxT: 0.12, idxEnd: 0.05 });
  }

  /** Brush tap on the snare (beats 2 and 4). */
  brush(t: number, vel: number, pan = 0): void {
    const e: Env = { g: 0.03 * vel, a: 0.002, d: 0.16, pan, wet: 0.12 };
    if (this.admit(t, e)) this.eng.noise(this.out, t, { ...e, f: 1900, q: 0.7, lp: 6000 });
  }

  /** Brush stirring circles on the snare head. */
  sweep(t: number, len: number, vel: number): void {
    const e: Env = { g: 0.009 * vel, a: len * 0.5, d: len * 0.5, lin: true, pan: -0.2, wet: 0.1 };
    if (this.admit(t, e)) this.eng.noise(this.out, t, { ...e, f: 2400, to: 3400, q: 0.5, lp: 6000 });
  }

  ride(t: number, vel: number): void {
    const e: Env = { g: 0.011 * vel, a: 0.001, d: 0.12, pan: 0.3, wet: 0.15 };
    if (this.admit(t, e)) this.eng.noise(this.out, t, { ...e, f: 5200, q: 3, lp: 8000 });
  }

  kick(t: number, vel: number): void {
    const e: Env = { g: 0.045 * vel, a: 0.003, d: 0.25 };
    if (this.admit(t, e)) this.eng.tone(this.out, t, { ...e, f: 90, to: 52, glide: 0.06 });
  }

  /** Tanpura string: two detuned saws, the bridge buzz (jawari) sweeping down after each pluck. */
  tanpura(t: number, m: number, vel: number): void {
    const e: Env = { g: 0.03 * vel, a: 0.03, d: 3.4, wet: 0.35 };
    if (!this.admit(t, e)) return;
    this.eng.tone(this.out, t, { ...e, type: 'sawtooth', f: mtof(m), det: -4, add: [{ type: 'sawtooth', det: 5 }], lp: 2200, lpTo: 600, lpT: 1.6, q: 2 });
  }

  /** Sitar-ish pluck: resonant twang; `from` slides into the note (meend from below, a grace from above). */
  sitar(t: number, m: number, len: number, vel: number, from?: number, pan = 0): void {
    const e: Env = { g: 0.07 * vel, a: 0.002, d: clamp(len + 0.8, 0.6, 2.2), pan, wet: 0.4 };
    if (!this.admit(t, e)) return;
    const f = mtof(m);
    const slide = from !== undefined && from !== m;
    const up = slide && from! < m;
    this.eng.tone(this.out, t, {
      ...e, type: 'sawtooth', f: slide ? mtof(from!) : f, to: slide ? f : undefined, at: up ? 0.07 : 0.02, glide: up ? 0.2 : 0.05,
      lp: 3200, lpTo: 1100, lpT: 0.4, q: 4,
    });
  }

  /** Tabla: the right drum rings at Sa; the left one booms, and sometimes swoops up. */
  tabla(t: number, stroke: Stroke, vel: number, sa: number): void {
    const f = mtof(sa);
    const o = this.out;
    const eng = this.eng;
    const e: Env = { g: 0.06 * vel, a: 0.001, d: 0.5, pan: 0.15, wet: 0.2 };
    if (!this.admit(t, e)) return;
    switch (stroke) {
      case 'na':
        eng.tone(o, t, { ...e, f: f * 1.03, to: f, glide: 0.02, add: [{ mul: 2, g: 0.35 }, { mul: 3, g: 0.15 }] });
        eng.noise(o, t, { f: 2800, q: 1.2, g: 0.014 * vel, a: 0.001, d: 0.01, pan: 0.15 });
        break;
      case 'tin':
        eng.tone(o, t, { ...e, g: 0.045 * vel, d: 0.35, f, add: [{ mul: 2, g: 0.15 }] });
        break;
      case 'ti':
        eng.tone(o, t, { ...e, g: 0.028 * vel, d: 0.08, f: f * 2 });
        eng.noise(o, t, { f: 3200, q: 1.5, g: 0.012 * vel, a: 0.001, d: 0.012, pan: 0.15 });
        break;
      case 'ge':
        eng.tone(o, t, { ...e, g: 0.1 * vel, d: 0.45, type: 'triangle', f: 150, to: 98, glide: 0.1, lp: 800, pan: -0.15 });
        break;
      case 'gew':
        eng.tone(o, t, { ...e, g: 0.09 * vel, d: 0.6, type: 'triangle', f: 90, to: 135, at: 0.05, glide: 0.25, lp: 800, pan: -0.15 });
        break;
      case 'ka':
        eng.noise(o, t, { type: 'lowpass', f: 700, g: 0.04 * vel, a: 0.001, d: 0.05, pan: -0.15 });
        break;
    }
  }

  /** Light harp-like pluck (swarmandal shimmer). */
  harp(t: number, m: number, vel: number, pan = 0, d = 0.9): void {
    const e: Env = { g: 0.028 * vel, a: 0.002, d, pan, wet: 0.5 };
    if (this.admit(t, e)) this.eng.fm(this.out, t, { ...e, f: mtof(m), ratio: 2, index: 0.8, idxT: 0.08 });
  }

  /** Guzheng: a bright ringing pluck; optional press-bend up from `bendFrom`, vibrato, or a light (gliss) variant. */
  guzheng(t: number, m: number, vel: number, pan = 0, d = 1.8, bendFrom?: number, vib = 0, lite = false): void {
    const e: Env = { g: 0.055 * vel, a: 0.002, d, pan, wet: 0.45 };
    if (!this.admit(t, e)) return;
    const f = mtof(m);
    const bend = bendFrom !== undefined && bendFrom !== m;
    this.eng.tone(this.out, t, {
      ...e, type: 'triangle', f: bend ? mtof(bendFrom!) : f, to: bend ? f : undefined, at: 0.1, glide: 0.14,
      add: lite ? [] : [{ type: 'sawtooth', g: 0.18 }, { mul: 2, det: 3, g: 0.3 }], lp: 3600, lpTo: 1300, lpT: 0.25, q: 1.2,
      vib, vibHz: 5.5, vibAt: 0.3,
    });
  }

  /** Erhu-like bowed line: slow bow attack, portamento from the previous note, singing vibrato. */
  erhu(t: number, m: number, len: number, vel: number, from?: number, pan = 0): void {
    const e: Env = { g: 0.048 * vel, a: 0.18, h: Math.max(0.05, len - 0.25), d: 0.3, lin: true, pan, wet: 0.45 };
    if (!this.admit(t, e)) return;
    const f = mtof(m);
    const slide = from !== undefined && from !== m;
    this.eng.tone(this.out, t, {
      ...e, f: slide ? mtof(from!) : f, to: slide ? f : undefined, glide: 0.14, add: [{ type: 'sawtooth', g: 0.12 }], lp: 1800, q: 0.9,
      vib: 22, vibHz: 5.6, vibAt: 0.22,
    });
  }

  /** Woodblock: a short hollow tock, high or low. */
  woodblock(t: number, hi: boolean, vel: number): void {
    const f = hi ? 1180 : 800;
    const e: Env = { g: 0.055 * vel, a: 0.001, d: 0.09, pan: hi ? 0.25 : -0.15, wet: 0.2 };
    if (!this.admit(t, e)) return;
    this.eng.tone(this.out, t, { ...e, f: f * 1.08, to: f, glide: 0.008 });
    this.eng.noise(this.out, t, { f: f * 1.6, q: 3, g: 0.018 * vel, a: 0.001, d: 0.02, pan: e.pan });
  }
}

// ---------------------------------------------------------------- themes

/** Closest voicing of pitch classes `pcs` to the previous voicing, lowest note in [lo, lo + 12). */
function voiceLead(prev: number[], pcs: number[], lo: number): number[] {
  let best = prev;
  let bd = Infinity;
  for (let inv = 0; inv < pcs.length; inv++) {
    const v = [fold(pcs[inv], lo)];
    for (let i = 1; i < pcs.length; i++) {
      const pc = pcs[(inv + i) % pcs.length];
      const last = v[v.length - 1];
      v.push(last + ((((pc - last) % 12) + 12) % 12 || 12));
    }
    let dist = 0;
    for (let i = 0; i < Math.min(v.length, prev.length); i++) dist += Math.abs(v[i] - prev[i]);
    if (dist < bd) {
      bd = dist;
      best = v;
    }
  }
  return best;
}

/** Lullaby in F major, 3/4: a music box plays broken chords and a simple tune over a warm pad. */
const menu: ThemeSpec = {
  bpm: 66, beats: 3, sub: 2, swing: 0.06, level: 1,
  make() {
    const root = 65; // F4
    const A = [0, 5, 3, 4, 0, 5, 1, 4]; // I vi IV V I vi ii V
    const B = [3, 0, 1, 4, 3, 0, 4, 0]; // IV I ii V IV I V I
    const RHY = [[0, 2, 4], [0, 3, 4], [0, 2, 3, 4], [0, 4]];
    let mel = 9; // scale index above F4 (7 = F5)
    let rhythm = RHY[0];
    let twinkle = -1;
    return {
      step(p, b, s, t) {
        const r = b.r;
        const d = (b.alt ? B : A)[b.pos];
        const third = deg(MAJOR, d + 2) - deg(MAJOR, d);
        const fifth = deg(MAJOR, d + 4) - deg(MAJOR, d);
        const base = fold(root + deg(MAJOR, d), 53);
        if (s === 0) {
          const bar = b.beat * 3;
          p.softBass(t, base - 12, bar * 0.9, 0.9);
          p.pad(t, [fold(base + third, 57), fold(base + fifth, 57)], bar, 0.8);
          rhythm = b.pos % 4 === 3 ? r.pick([[0], [0, 4]]) : r.pick(RHY);
          if (b.alt && b.pos === 0 && r.chance(0.5)) rhythm = []; // a breath
          twinkle = r.chance(0.14) ? 2 + r.int(4) : -1;
        }
        // Low broken chord, 1-5-10-5-10-5, with the odd note left out.
        const arp = [0, fifth, third + 12, fifth, third + 12, fifth];
        if (s === 0 || !r.chance(0.12)) p.musicBox(t, base + arp[s], s === 0 ? 0.7 : 0.45, -0.2);
        if (rhythm.includes(s)) {
          if (s === 0) mel = nearest(mel + r.pick([-2, -1, 0, 1, 2]), chordTones(d, 5, 13), r);
          else mel = clamp(mel + r.pick([-2, -1, -1, 1, 1, 2]), 5, 13);
          p.musicBox(t, root + deg(MAJOR, mel), s === 0 ? 0.85 : 0.65, 0.2);
        }
        if (s === twinkle) p.musicBox(t, root + 24 + r.pick([0, 4, 7, 12]), 0.3, -0.35); // a high tine, now and then
      },
    };
  },
};

/** Italian trattoria waltz in G: accordion oom-pah-pah, mandolin tremolo melody (often in thirds). */
const italy: ThemeSpec = {
  bpm: 96, beats: 3, sub: 6, swing: 0, level: 1.25,
  make() {
    const root = 67; // G4
    const A = [0, 3, 4, 0, 5, 1, 4, 0]; // I IV V7 I vi ii V7 I
    const B = [0, 4, 4, 0, 3, 0, 4, 0]; // I V7 V7 I IV I V7 I
    // melody rhythms: [beat, length in beats, tremolo]
    const RHY: [number, number, boolean][][] = [
      [[0, 3, true]],
      [[0, 2, true], [2, 1, false]],
      [[0, 1, false], [1, 1, false], [2, 1, true]],
      [[0, 1, false], [1, 2, true]],
      [[0, 0.5, false], [0.5, 0.5, false], [1, 2, true]],
    ];
    let mel = 2; // scale index above G4
    let plan = RHY[0];
    let trem: { m: number; m2: number; until: number } | null = null;
    let up = false;
    let voicing = [59, 62, 67];
    return {
      step(p, b, s, t) {
        const r = b.r;
        const d = (b.alt ? B : A)[b.pos];
        const dom = d === 4;
        const cad = b.pos % 4 === 3;
        if (s === 0) {
          plan = cad ? [[0, 3, true]] : r.pick(RHY);
          // "oom": the root, or the fifth on every other bar
          const bassDeg = b.n % 2 === 1 && !cad ? d + 4 : d;
          p.accBass(t, fold(root + deg(MAJOR, bassDeg) - 24, 41), b.beat * 0.9, 0.9);
          const pcs = [d, d + 2, dom ? d + 6 : d + 4].map((x) => (root + deg(MAJOR, x)) % 12);
          voicing = voiceLead(voicing, pcs, 55);
        }
        // "pah-pah" on beats two and three; the last bar of a phrase holds the chord instead.
        if (s === 6 || s === 12) {
          if (!cad) p.accordion(t, voicing, b.beat * 0.55, s === 6 ? 0.8 : 0.7);
          else if (s === 6) p.accordion(t, voicing, b.beat * 1.9, 0.75);
        }
        for (const [bt, len, tr] of plan) {
          if (Math.round(bt * 6) !== s) continue;
          if (bt === 0) mel = nearest(mel + r.pick([-2, -1, 0, 1, 2]), chordTones(d, -3, 8, dom ? 4 : 3), r);
          else mel = clamp(mel + r.pick([-2, -1, -1, 1, 1, 2]), -3, 8);
          const m = root + deg(MAJOR, mel);
          const m2 = r.chance(0.4) ? root + deg(MAJOR, mel - 2) : 0;
          if (tr) trem = { m, m2, until: t + len * b.beat - 0.03 };
          else {
            trem = null;
            p.mandolin(t, m, 0.85, 0.5, 0.1);
            if (m2) p.mandolin(t, m2, 0.5, 0.45, -0.1);
          }
        }
        if (trem && t < trem.until) {
          up = !up;
          const v = (up ? 0.55 : 0.75) * r.range(0.85, 1.1);
          const det = up ? 6 : -4;
          p.mandolin(t, trem.m, v, 0.17, 0.1, det);
          if (trem.m2) p.mandolin(t, trem.m2, v * 0.6, 0.17, -0.1, -det);
        }
      },
    };
  },
};

/** Japanese garden: koto plucks on the miyako-bushi scale (E F A B C), a breathy flute, rare soft drums. */
const japan: ThemeSpec = {
  bpm: 60, beats: 4, sub: 2, swing: 0, level: 1.3,
  make() {
    const root = 64; // E4
    const SC = [0, 1, 5, 7, 8];
    const BASS_A = [0, 0, 2, 3, 4, 2, 1, 0]; // E E A B C A F E
    const BASS_B = [0, 2, 0, 4, 3, 2, 1, 0]; // E A E C B A F E
    const ARP = [[2, 3, 5], [1, 2, 4, 6], [2, 5], [3, 5, 6], [2, 4, 5, 7]];
    const FLUTE: [number, number][][] = [[[0, 6]], [[0, 3], [4, 4]], [[2, 6]], [[0, 2], [2, 6]]];
    let arp = ARP[0];
    let fl = 5; // flute scale index above E4 (5 = E5)
    let flute: [number, number][] = [];
    return {
      step(p, b, s, t) {
        const r = b.r;
        const bi = (b.alt ? BASS_B : BASS_A)[b.pos];
        const low = root - 12 + deg(SC, bi);
        const hum = r.range(-0.012, 0.012);
        if (s === 0) {
          arp = r.pick(ARP);
          if (b.pos === 0 && r.chance(0.6)) {
            // a quick upward sweep into the downbeat
            for (let i = 0; i < 4; i++) p.koto(t + i * 0.045, low + deg(SC, i), 0.5 + i * 0.12, -0.3 + i * 0.15, undefined, 1.4);
          } else p.koto(t, low, 0.9, -0.15, undefined, 2.2);
          const fb = b.pos % 4;
          flute = (fb === 1 || fb === 2) && !(b.alt && b.pos >= 4) ? r.pick(FLUTE) : [];
          if (b.pos % 4 === 0) p.drum(t, 110, 62, 0.6, 0.7);
        }
        if (s === 1 && r.chance(0.45)) p.koto(t + hum, low + 12, 0.5, 0.1, undefined, 1.4);
        if (arp.includes(s)) {
          const idx = bi + r.pick([2, 3, 4, 5, 7]);
          const m = root - 12 + deg(SC, idx);
          const above = root - 12 + deg(SC, idx + 1);
          const bend = r.chance(0.18) && above - m <= 2 ? above : undefined;
          p.koto(t + hum, m, r.range(0.45, 0.7), r.range(-0.4, 0.4), bend, 1.5);
        }
        for (const [st, len] of flute) {
          if (st !== s) continue;
          fl = clamp(fl + r.pick([-2, -1, 1, 2]), 2, 8);
          p.flute(t, root + deg(SC, fl), len * b.step, 0.8, 0.1);
        }
        if (s === 6 && b.pos % 2 === 1 && r.chance(0.35)) p.drum(t, 330, 200, 0.35, 0.35); // kotsuzumi "pon"
      },
    };
  },
};

/** Mexican fiesta in C: marimba in parallel thirds with rolls, guitarrón, shaker; 6/8 against 3/4. */
const mexico: ThemeSpec = {
  bpm: 100, beats: 2, sub: 3, swing: 0, level: 1.25,
  make() {
    const root = 60; // C4
    const A = [0, 3, 4, 0, 0, 3, 4, 0]; // I IV V7 I I IV V7 I
    const B = [0, 5, 3, 4, 0, 5, 1, 4]; // I vi IV V7 I vi ii V7
    // melody rhythms on the six-step bar: [step, length in steps, roll]
    const SIX: [number, number, boolean][][] = [
      [[0, 1, false], [1, 1, false], [2, 1, false], [3, 1, false], [4, 1, false], [5, 1, false]],
      [[0, 2, false], [2, 1, false], [3, 2, false], [5, 1, false]],
      [[0, 3, true], [3, 3, true]],
      [[0, 1, false], [1, 1, false], [2, 1, false], [3, 3, true]],
    ];
    const THREE: [number, number, boolean][][] = [
      [[0, 2, false], [2, 2, false], [4, 2, false]],
      [[0, 2, true], [2, 1, false], [3, 1, false], [4, 2, false]],
      [[0, 1, false], [1, 1, false], [2, 2, false], [4, 2, true]],
    ];
    let mel = 9; // scale index above C4 (7 = C5)
    let plan = SIX[0];
    let roll: { m: number; m2: number; until: number } | null = null;
    return {
      step(p, b, s, t) {
        const r = b.r;
        const d = (b.alt ? B : A)[b.pos];
        const dom = d === 4;
        const three = b.n % 2 === 1; // sesquialtera: a bar of 6/8, then a bar of 3/4
        if (s === 0) {
          plan = b.pos % 4 === 3 ? [[0, 6, true]] : r.pick(three ? THREE : SIX);
          if (b.alt && b.pos === 4 && r.chance(0.5)) plan = [];
        }
        // guitarrón: the root on one, then the fifth (6/8) or third and fifth (3/4)
        const bi = (three ? [0, 2, 4] : [0, 3]).indexOf(s);
        if (bi >= 0) {
          const which = bi === 0 ? d : three && bi === 1 ? d + 2 : d + 4;
          p.guitarron(t, fold(root + deg(MAJOR, which) - 24, 38), bi === 0 ? 1 : 0.75);
        }
        // the vamp: third and fifth on the off-steps
        if ((three ? [1, 3, 5] : [1, 2, 4, 5]).includes(s)) {
          const lo = fold(root + deg(MAJOR, d + 2), 57);
          p.dyad(t, [lo, lo + deg(MAJOR, d + 4) - deg(MAJOR, d + 2)], s % 2 ? 0.5 : 0.42, -0.25);
        }
        const accent = three ? s % 2 === 0 : s % 3 === 0;
        p.shaker(t, accent ? 1 : 0.55, 0.3);
        if (r.chance(0.4)) p.shaker(t + b.step / 2, 0.3, 0.35);
        for (const [st, len, rl] of plan) {
          if (st !== s) continue;
          if (st === 0 || (!three && st === 3)) mel = nearest(mel + r.pick([-2, -1, 0, 1, 2]), chordTones(d, 7, 14, dom ? 4 : 3), r);
          else mel = clamp(mel + r.pick([-2, -1, -1, 1, 1, 2]), 7, 14);
          const m = root + deg(MAJOR, mel);
          const m2 = root + deg(MAJOR, mel - 2); // the second mallet a third below
          if (rl) roll = { m, m2, until: t + len * b.step - 0.03 };
          else {
            roll = null;
            p.marimba(t, m, 0.8, 0.2, 0.55);
            if (r.chance(0.75)) p.marimba(t, m2, 0.55, -0.1, 0.5, false);
          }
        }
        if (roll) {
          for (let j = 0; j < 3; j++) {
            const tt = t + (j * b.step) / 3;
            if (tt >= roll.until) break;
            p.marimba(tt, roll.m, j === 0 ? 0.65 : 0.5, 0.2, 0.14, j === 0, j > 0);
            p.marimba(tt, roll.m2, j === 0 ? 0.45 : 0.35, -0.1, 0.14, false, true);
          }
        }
      },
    };
  },
};

/** 1950s diner jukebox in C: walking bass, electric-piano comping, vibes licks, brushes; swung. */
const usa: ThemeSpec = {
  bpm: 112, beats: 4, sub: 2, swing: 0.3, level: 1.2,
  make() {
    interface Chord { root: number; third: number; v: number[] }
    const CH: Record<string, Chord> = {
      C6: { root: 48, third: 4, v: [64, 67, 69] },
      Am7: { root: 45, third: 3, v: [60, 64, 67] },
      Dm7: { root: 50, third: 3, v: [60, 65, 69] },
      G7: { root: 43, third: 4, v: [59, 65, 67] },
      C7: { root: 48, third: 4, v: [64, 67, 70] },
      F6: { root: 41, third: 4, v: [57, 62, 65] },
      Fm6: { root: 41, third: 3, v: [56, 62, 65] },
      A7: { root: 45, third: 4, v: [61, 64, 67] },
    };
    const A = ['C6', 'Am7', 'Dm7', 'G7', 'C6', 'Am7', 'Dm7', 'G7'];
    const B = ['C6', 'C7', 'F6', 'Fm6', 'C6', 'A7', 'Dm7', 'G7'];
    // comping rhythms: [eighth step, length in beats]; step 7 anticipates the next chord
    const COMP: [number, number][][] = [[[0, 1.2], [3, 0.45]], [[1, 0.45], [5, 0.45]], [[2, 0.45], [6, 0.45]], [[0, 2.5], [7, 0.4]]];
    const PENT = [0, 2, 4, 7, 9];
    let comp = COMP[0];
    let lead: number[] = [];
    let li = 6; // pentatonic index above C4 (5 = C5)
    let bass = 48;
    return {
      step(p, b, s, t) {
        const r = b.r;
        const prog = b.alt ? B : A;
        const ch = CH[prog[b.pos]];
        const nx = CH[prog[(b.pos + 1) % 8]];
        if (s === 0) {
          comp = r.pick(COMP);
          const plays = b.pos % 4 < 2 !== b.alt; // call and response with the comping
          lead = [];
          if (plays) for (let i = 0; i < 8; i++) if (r.chance(i % 2 ? 0.45 : 0.3)) lead.push(i);
        }
        if (s % 2 === 0) {
          // walking bass: root, chord tone, chord tone, then an approach to the next root
          const beat = s / 2;
          const near = (x: number) => x + 12 * Math.round((bass - x) / 12);
          let m =
            beat === 0 ? near(ch.root)
            : beat === 1 ? near(ch.root + r.pick([ch.third, 7, 2]))
            : beat === 2 ? near(ch.root + r.pick([7, ch.third, 9]))
            : near(nx.root) + r.pick([-1, 1, -5, 2]);
          while (m < 38) m += 12;
          while (m > 55) m -= 12;
          bass = m;
          p.upright(t, m, b.beat, beat === 0 ? 0.95 : 0.8);
        }
        if (s === 7 && r.chance(0.12)) p.upright(t, bass, b.beat * 0.4, 0.4); // a ghosted skip note
        for (const [st, len] of comp) if (st === s) p.epiano(t, st === 7 ? nx.v : ch.v, len * b.beat, st === 0 ? 0.75 : 0.6);
        if (lead.includes(s)) {
          li = clamp(li + r.pick([-2, -1, -1, 1, 1, 2]), 3, 10);
          const m = 60 + deg(PENT, li);
          if (m % 12 === 4 && r.chance(0.35)) p.vibes(t - 0.05, m - 1, 0.35, 0.25); // blue-note grace into E
          p.vibes(t, m, s % 2 ? 0.6 : 0.75, 0.25);
        }
        if (s === 0 || s === 4) {
          p.kick(t, s === 0 ? 0.8 : 0.55);
          p.sweep(t, b.beat * 2, 0.7);
        }
        if (s === 2 || s === 6) p.brush(t, 0.8, 0.15);
        if (s !== 1 && s !== 5) p.ride(t, s === 3 || s === 7 ? 0.45 : s === 2 || s === 6 ? 0.8 : 0.6);
      },
    };
  },
};

/** Indian evening (raga Yaman on D): tanpura drone, sitar phrases with slides, soft tabla in keherwa. */
const india: ThemeSpec = {
  bpm: 64, beats: 4, sub: 2, swing: 0.05, level: 1.8,
  make() {
    const sa = 62; // D4
    const Y = [0, 2, 4, 6, 7, 9, 11];
    const TAN = [45, 50, 50, 38]; // Pa, Sa, Sa, low Sa
    const THEKA = ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhi', 'na'] as const;
    const RHY: [number, number][][] = [
      [[0, 2], [3, 1], [4, 2], [6, 2]],
      [[0, 3], [3, 1], [4, 4]],
      [[1, 1], [2, 2], [4, 1], [5, 3]],
      [[0, 4], [4, 4]],
      [[0, 2], [2, 2], [4, 2], [6, 1], [7, 1]],
    ];
    const REST = [0, 2, 4, 6]; // Sa, Ga, Pa, Ni: notes a phrase likes to settle on
    let mel = 2; // Yaman index above Sa
    let plan: [number, number][] = [];
    let taan = false;
    return {
      step(p, b, s, t) {
        const r = b.r;
        if (s % 2 === 0) p.tanpura(t + r.range(0, 0.03), TAN[s / 2], s === 6 ? 0.85 : 0.7);
        // tabla
        if (b.pos % 4 === 3 && s >= 6) {
          p.tabla(t, 'ti', 0.6, sa);
          p.tabla(t + b.step / 2, 'ti', 0.45, sa);
        } else if ((s === 1 || s === 5) && r.chance(0.12)) p.tabla(t, 'gew', 0.7, sa);
        else {
          const st = THEKA[s];
          if (st === 'dha' || st === 'dhi') {
            p.tabla(t, st === 'dha' ? 'na' : 'tin', 0.75, sa);
            p.tabla(t, 'ge', 0.7, sa);
          } else if (st !== 'ge' || r.chance(0.7)) p.tabla(t, st, s % 2 ? 0.5 : 0.6, sa);
        }
        // sitar
        if (s === 0) {
          const rest = (b.pos % 4 === 3 && r.chance(0.6)) || b.n === 0;
          taan = !rest && b.pos % 4 === 2 && r.chance(0.2);
          plan = rest ? [] : r.pick(RHY).filter(([st]) => !taan || st < 6);
          if (b.pos === 0 && (b.alt || r.chance(0.3))) {
            for (let i = 0; i < 8; i++) p.harp(t + 0.02 + i * 0.04, sa + 12 + deg(Y, i), 0.6 + i * 0.04, -0.4 + i * 0.1, 0.8);
          }
        }
        for (const [st, len] of plan) {
          if (st !== s) continue;
          let next = clamp(mel + r.pick([-2, -1, -1, 1, 1, 2, 3]), -3, 9);
          if (st === plan[plan.length - 1][0] && !REST.includes(((next % 7) + 7) % 7)) next = clamp(next + (r.chance(0.5) ? 1 : -1), -3, 9);
          const m = sa + deg(Y, next);
          let from: number | undefined;
          if (next > mel && r.chance(0.4)) from = sa + deg(Y, next - 1); // meend: pulled up from below
          else if (r.chance(0.15)) from = sa + deg(Y, next + 1); // kan: a touch of the note above
          p.sitar(t, m, len * b.step, 0.8, from, 0.1);
          mel = next;
        }
        if (taan && s >= 6) {
          // a quick run (sixteenths) down to the phrase's resting note
          for (let j = 0; j < 2; j++) p.sitar(t + (j * b.step) / 2, sa + deg(Y, mel + 3 - (s - 6) * 2 - j), 0.25, 0.6, undefined, 0.1);
        }
      },
    };
  },
};

/** Chinese teahouse on D major pentatonic: guzheng with glissandi, erhu line, soft woodblock. */
const china: ThemeSpec = {
  bpm: 70, beats: 4, sub: 2, swing: 0, level: 1.3,
  make() {
    const root = 62; // D4
    const P5 = [0, 2, 4, 7, 9];
    const BASS_A = [0, -3, 2, -5, 0, -3, -5, 0]; // D B E A D B A D
    const BASS_B = [0, 4, -3, 2, 0, -3, -5, 0]; // D F# B E D B A D
    const ERHU: [number, number][][] = [[[0, 8]], [[0, 4], [4, 4]], [[0, 3], [3, 1], [4, 4]], [[0, 6], [6, 2]]];
    const ZHENG = [[0, 2, 3, 4, 6], [1, 2, 4, 6, 7], [0, 3, 4, 6], [0, 1, 2, 4, 5, 6]];
    const FLOW = [0, 7, 12, 7, 19, 7, 12, 7]; // rolling fifth and octave above the bass
    let mel = 6; // pentatonic index above D4 (5 = D5)
    let prev: number | undefined;
    let plan: [number, number][] = [];
    let zplan: number[] = [];
    return {
      step(p, b, s, t) {
        const r = b.r;
        const low = root - 12 + (b.alt ? BASS_B : BASS_A)[b.pos];
        const erhuBars = b.alt ? b.pos >= 4 : b.pos < 4;
        if (s === 0) {
          plan = erhuBars ? r.pick(ERHU) : [];
          zplan = erhuBars ? [] : r.pick(ZHENG);
          if (!erhuBars) prev = undefined;
          p.guzheng(t, low, 0.85, -0.2, 2.2);
          p.woodblock(t, true, 0.7);
        }
        if (s > 0 && (erhuBars || s % 2 === 0)) p.guzheng(t, low + FLOW[s], erhuBars ? 0.38 : 0.32, r.range(-0.3, 0.3), 0.9, undefined, 0, true);
        for (const [st, len] of plan) {
          if (st !== s) continue;
          mel = clamp(mel + r.pick([-2, -1, -1, 1, 1, 2]), 3, 10);
          if (b.pos % 4 === 3 && st === plan[plan.length - 1][0]) mel = nearest(mel, [3, 5, 8, 10], r); // settle on A or D
          const m = root + deg(P5, mel);
          p.erhu(t, m, len * b.step, 0.85, prev !== undefined && r.chance(0.6) ? prev : undefined, 0.15);
          prev = m;
        }
        if (zplan.includes(s)) {
          mel = clamp(mel + r.pick([-2, -1, -1, 1, 1, 2]), 3, 10);
          const m = root + deg(P5, mel);
          const bend = r.chance(0.2) ? root + deg(P5, mel - 1) : undefined; // pressed up from the string below
          p.guzheng(t, m, 0.7, 0.2, 1.4, bend, s === zplan[zplan.length - 1] ? 14 : 0);
        }
        // a glissando sweeping into the next phrase
        if (s === 7 && b.pos % 4 === 3 && r.chance(0.65)) {
          const down = r.chance(0.6);
          const start = t + b.step - 7 * 0.045;
          for (let i = 0; i < 7; i++) {
            p.guzheng(start + i * 0.045, root - 12 + deg(P5, down ? 12 - i : 2 + i), 0.3 + 0.04 * i, down ? 0.3 - i * 0.08 : -0.3 + i * 0.08, 0.45, undefined, 0, true);
          }
        }
        if (s === 4 && r.chance(0.7)) p.woodblock(t, false, 0.5);
        if (s === 6 && r.chance(0.3)) p.woodblock(t, true, 0.35);
        if (s === 7 && r.chance(0.2)) p.woodblock(t, false, 0.3);
      },
    };
  },
};

const THEMES: Record<MusicTheme, ThemeSpec> = { menu, italy, japan, mexico, usa, india, china };

export const audio: Audio = new AudioEngine();
