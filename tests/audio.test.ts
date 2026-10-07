import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, audio, type MusicTheme, type SfxName } from '../src/audio/audio';

// Every name is listed once; the Record type makes the compiler catch missing or unknown names.
const SFX_NAMES: Record<SfxName, true> = {
  press: true, slide: true, plop: true, park: true, bowlOut: true, blocked: true, full: true, serve: true, lid: true,
  reveal: true, unlock: true, link: true, thaw: true, win: true, star: true, stuck: true, undo: true, hint: true,
  button: true, newMechanic: true, map: true,
};
const THEME_NAMES: Record<MusicTheme, true> = { menu: true, italy: true, japan: true, mexico: true, usa: true, india: true, china: true };
const SFX = Object.keys(SFX_NAMES) as SfxName[];
const THEMES = Object.keys(THEME_NAMES) as MusicTheme[];

// ---------------------------------------------------------------- a small validating fake of Web Audio
// The engine swallows exceptions so audio can never break the game; the fake therefore records every
// misuse a browser would reject (non-finite values, exponential ramps through zero, double start...).

const errors: string[] = [];
function fail(msg: string): never {
  errors.push(msg);
  throw new Error(msg);
}
function finite(v: unknown, what: string): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what}: non-finite ${String(v)}`);
}

type Ev = { kind: 'set' | 'lin' | 'exp' | 'target'; v: number; t: number };

class FakeParam {
  events: Ev[] = [];
  private v: number;
  constructor(v: number) {
    this.v = v;
  }
  get value(): number {
    return this.v;
  }
  set value(v: number) {
    finite(v, 'AudioParam.value');
    this.v = v;
  }
  private push(ev: Ev): this {
    finite(ev.v, `${ev.kind} value`);
    finite(ev.t, `${ev.kind} time`);
    if (ev.t < 0) fail(`${ev.kind} at negative time ${ev.t}`);
    this.events.push(ev);
    return this;
  }
  setValueAtTime(v: number, t: number) {
    return this.push({ kind: 'set', v, t });
  }
  linearRampToValueAtTime(v: number, t: number) {
    return this.push({ kind: 'lin', v, t });
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (v === 0) fail('exponential ramp to zero');
    const prev = this.events.length ? this.events[this.events.length - 1].v : this.v;
    if (prev === 0 || Math.sign(prev) !== Math.sign(v)) fail(`exponential ramp from ${prev} to ${v} never moves`);
    return this.push({ kind: 'exp', v, t });
  }
  setTargetAtTime(v: number, t: number, c: number) {
    finite(c, 'time constant');
    if (c < 0) fail('negative time constant');
    return this.push({ kind: 'target', v, t });
  }
  cancelScheduledValues(t: number) {
    finite(t, 'cancel time');
    this.events = this.events.filter((e) => e.t < t);
    return this;
  }
}

class FakeNode {
  outputs: unknown[] = [];
  constructor(readonly ctx: FakeCtx, readonly kind: string) {
    ctx.nodes.push(this);
  }
  connect(dst: unknown): unknown {
    if (!(dst instanceof FakeNode) && !(dst instanceof FakeParam)) fail(`${this.kind}.connect(${String(dst)})`);
    if (dst instanceof FakeNode && dst.ctx !== this.ctx) fail('connect across contexts');
    this.outputs.push(dst);
    return dst;
  }
  disconnect(): void {
    this.outputs = [];
  }
}

class FakeSource extends FakeNode {
  readonly createdAt: number;
  startAt: number | null = null;
  stopAt: number | null = null;
  onended: unknown = null;
  constructor(ctx: FakeCtx, kind: string) {
    super(ctx, kind);
    this.createdAt = ctx.currentTime;
  }
  start(t = 0, offset?: number): void {
    finite(t, 'start time');
    if (t < 0) fail('start at negative time');
    if (offset !== undefined) finite(offset, 'start offset');
    if (this.startAt !== null) fail(`${this.kind} started twice`);
    this.startAt = t;
  }
  stop(t = 0): void {
    finite(t, 'stop time');
    if (this.startAt === null) fail(`${this.kind} stopped before start`);
    if (this.stopAt !== null) fail(`${this.kind} stopped twice`);
    this.stopAt = t;
  }
}

const OSC_TYPES = ['sine', 'square', 'sawtooth', 'triangle'];
class FakeOsc extends FakeSource {
  private t = 'sine';
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  constructor(ctx: FakeCtx) {
    super(ctx, 'oscillator');
  }
  get type(): string {
    return this.t;
  }
  set type(v: string) {
    if (!OSC_TYPES.includes(v)) fail(`bad oscillator type ${v}`);
    this.t = v;
  }
}

class FakeBuffer {
  private readonly data: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    if (!(numberOfChannels >= 1 && length >= 1 && sampleRate > 0)) fail('bad buffer shape');
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(i: number): Float32Array {
    if (!this.data[i]) fail(`no channel ${i}`);
    return this.data[i];
  }
}

class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  playbackRate = new FakeParam(1);
  constructor(ctx: FakeCtx) {
    super(ctx, 'bufferSource');
  }
  override start(t = 0, offset?: number): void {
    if (!this.buffer) fail('buffer source started without a buffer');
    super.start(t, offset);
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
  constructor(ctx: FakeCtx) {
    super(ctx, 'gain');
  }
}

const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'];
class FakeFilter extends FakeNode {
  private t = 'lowpass';
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
  gain = new FakeParam(0);
  detune = new FakeParam(0);
  constructor(ctx: FakeCtx) {
    super(ctx, 'biquad');
  }
  get type(): string {
    return this.t;
  }
  set type(v: string) {
    if (!FILTER_TYPES.includes(v)) fail(`bad filter type ${v}`);
    this.t = v;
  }
}

class FakeConvolver extends FakeNode {
  buffer: FakeBuffer | null = null;
  normalize = true;
  constructor(ctx: FakeCtx) {
    super(ctx, 'convolver');
  }
}

class FakePanner extends FakeNode {
  pan = new FakeParam(0);
  constructor(ctx: FakeCtx) {
    super(ctx, 'panner');
  }
  override connect(dst: unknown): unknown {
    if (this.pan.value < -1 || this.pan.value > 1) fail(`pan out of range ${this.pan.value}`);
    return super.connect(dst);
  }
}

class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
  reduction = 0;
  constructor(ctx: FakeCtx) {
    super(ctx, 'compressor');
  }
}

class FakeCtx {
  static instances: FakeCtx[] = [];
  currentTime = 0;
  readonly sampleRate = 48000;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly nodes: FakeNode[] = [];
  readonly destination: FakeNode;
  constructor(_opts?: unknown) {
    FakeCtx.instances.push(this);
    this.destination = new FakeNode(this, 'destination');
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  createGain() {
    return new FakeGain(this);
  }
  createOscillator() {
    return new FakeOsc(this);
  }
  createBufferSource() {
    return new FakeBufferSource(this);
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return new FakeBuffer(channels, length, sampleRate);
  }
  createBiquadFilter() {
    return new FakeFilter(this);
  }
  createConvolver() {
    return new FakeConvolver(this);
  }
  createStereoPanner() {
    return new FakePanner(this);
  }
  createDynamicsCompressor() {
    return new FakeCompressor(this);
  }
  sources(): FakeSource[] {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
  }
}

const g = globalThis as unknown as { AudioContext?: unknown };

function installFake(): void {
  g.AudioContext = FakeCtx;
}

/** A fresh engine on a fresh fake context, unlocked and running. */
function unlocked(): { eng: AudioEngine; ctx: FakeCtx } {
  installFake();
  const eng = new AudioEngine();
  eng.unlock();
  const ctx = FakeCtx.instances[FakeCtx.instances.length - 1];
  return { eng, ctx };
}

/** Advances audio time and the scheduler's timers together, in 50 ms ticks. */
function run(ctx: FakeCtx, sec: number): void {
  for (let i = 0; i < Math.round(sec / 0.05); i++) {
    ctx.currentTime += 0.05;
    vi.advanceTimersByTime(50);
  }
}

/** Highest number of sources (oscillators + noise) sounding at once among `list`. */
function maxOverlap(list: FakeSource[]): number {
  const edges: [number, number][] = [];
  for (const s of list) {
    if (s.startAt === null || s.stopAt === null) continue;
    edges.push([s.startAt, 1], [s.stopAt, -1]);
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let max = 0;
  for (const [, d] of edges) max = Math.max(max, (cur += d));
  return max;
}

afterEach(() => {
  delete g.AudioContext;
  FakeCtx.instances = [];
  errors.length = 0;
  vi.useRealTimers();
});

describe('audio without Web Audio', () => {
  it('imports and every method is a silent no-op', () => {
    delete g.AudioContext;
    expect(() => {
      audio.play('plop');
      audio.startMusic('italy');
      audio.unlock();
      for (const name of SFX) audio.play(name, { pitch: 1.1, volume: 0.7, pan: 0.3 });
      for (const theme of THEMES) audio.startMusic(theme);
      audio.stopMusic();
      audio.stopMusic(0);
      audio.setSfxVolume(0.4);
      audio.setMusicVolume(0.2);
      audio.setMuted(true);
      audio.setMuted(false);
      audio.duck(0.3, 2);
    }).not.toThrow();
    expect(audio.ready).toBe(false);
  });
});

describe('audio with a mocked AudioContext', () => {
  it('creates nothing before unlock, then builds the graph lazily', () => {
    installFake();
    const eng = new AudioEngine();
    eng.play('press');
    eng.startMusic('menu');
    eng.setSfxVolume(0.5);
    eng.duck(0.2, 1);
    expect(FakeCtx.instances).toHaveLength(0);
    expect(eng.ready).toBe(false);
    eng.unlock();
    expect(FakeCtx.instances).toHaveLength(1);
    expect(eng.ready).toBe(true);
    eng.unlock(); // a second gesture reuses the same context
    expect(FakeCtx.instances).toHaveLength(1);
    eng.stopMusic(0);
    expect(errors).toEqual([]);
  });

  it('plays every sound, respecting options, without API misuse', () => {
    const { eng, ctx } = unlocked();
    for (const name of SFX) {
      ctx.currentTime += 1; // clear every rate limit
      const before = ctx.nodes.length;
      eng.play(name, { pitch: 1.1, volume: 0.8, pan: -0.4 });
      expect(ctx.nodes.length, name).toBeGreaterThan(before);
      eng.play(name);
      eng.play(name, { pitch: 0.8, volume: 1.2, pan: 1 });
    }
    for (const pitch of [1, 1.12, 1.24]) {
      ctx.currentTime += 0.33;
      eng.play('star', { pitch });
    }
    ctx.currentTime += 1;
    eng.play('plop', { pitch: Number.NaN, volume: Number.POSITIVE_INFINITY, pan: 7 });
    ctx.currentTime += 1;
    const before = ctx.nodes.length;
    eng.play('plop', { volume: 0 });
    expect(ctx.nodes.length).toBe(before);
    // every voice is started and stopped (the one-frame unlock blip simply ends by itself)
    const blip = (s: FakeSource) => s instanceof FakeBufferSource && s.buffer?.length === 1;
    for (const s of ctx.sources().filter((x) => !blip(x))) {
      expect(s.startAt).not.toBeNull();
      expect(s.stopAt!).toBeGreaterThan(s.startAt!);
    }
    expect(errors).toEqual([]);
  });

  it('rate-limits the frequent sounds', () => {
    const { eng, ctx } = unlocked();
    for (const name of ['press', 'slide', 'plop', 'park'] as const) {
      ctx.currentTime += 1;
      eng.play(name);
      const n = ctx.nodes.length;
      ctx.currentTime += 0.01;
      eng.play(name);
      expect(ctx.nodes.length, name).toBe(n);
      ctx.currentTime += 0.1;
      eng.play(name);
      expect(ctx.nodes.length, name).toBeGreaterThan(n);
    }
    expect(errors).toEqual([]);
  });

  it('respects mute and the SFX volume', () => {
    const { eng, ctx } = unlocked();
    eng.setMuted(true);
    ctx.currentTime += 1;
    let n = ctx.nodes.length;
    eng.play('serve');
    expect(ctx.nodes.length).toBe(n);
    eng.setMuted(false);
    eng.setSfxVolume(0);
    ctx.currentTime += 1;
    eng.play('serve');
    expect(ctx.nodes.length).toBe(n);
    eng.setSfxVolume(0.6);
    ctx.currentTime += 1;
    n = ctx.nodes.length;
    eng.play('serve');
    expect(ctx.nodes.length).toBeGreaterThan(n);
    eng.setMusicVolume(Number.NaN);
    eng.setSfxVolume(5);
    expect(errors).toEqual([]);
  });

  it('plays every theme from a short lookahead, within a voice budget, and stops cleanly', () => {
    vi.useFakeTimers();
    const { eng, ctx } = unlocked();
    for (const theme of THEMES) {
      const first = ctx.nodes.length;
      eng.startMusic(theme);
      run(ctx, 40);
      const fresh = ctx.sources().filter((s) => ctx.nodes.indexOf(s) >= first);
      expect(fresh.length, theme).toBeGreaterThan(100);
      for (const s of fresh) {
        // scheduled just ahead of time (a glissando or a roll may reach a little further), never late
        expect(s.startAt! - s.createdAt, theme).toBeLessThan(0.75);
        expect(s.startAt! - s.createdAt, theme).toBeGreaterThan(-0.06);
        expect(s.stopAt!, theme).toBeGreaterThan(s.startAt!);
      }
      // past the crossfade: one song only
      const steady = fresh.filter((s) => s.startAt! > ctx.currentTime - 30);
      expect(maxOverlap(steady), theme).toBeLessThanOrEqual(40);
    }
    // the same theme again does not restart it
    const n = ctx.nodes.length;
    eng.startMusic('china');
    expect(ctx.nodes.length).toBe(n);
    eng.stopMusic(0);
    run(ctx, 3);
    expect(vi.getTimerCount()).toBe(0);
    const after = ctx.nodes.length;
    run(ctx, 2);
    expect(ctx.nodes.length).toBe(after);
    expect(errors).toEqual([]);
  });

  it('crossfades between themes without cutting the old one', () => {
    vi.useFakeTimers();
    const { eng, ctx } = unlocked();
    const songGains = () => ctx.nodes.filter((nd): nd is FakeGain => nd instanceof FakeGain && nd.outputs.includes(eng.musicBus));
    eng.startMusic('italy');
    run(ctx, 5);
    const [old] = songGains();
    eng.startMusic('japan');
    const now = ctx.currentTime;
    const fade = old.gain.events[old.gain.events.length - 1];
    expect(fade.kind).toBe('lin');
    expect(fade.v).toBe(0);
    expect(fade.t - now).toBeGreaterThan(0.5);
    const fresh = songGains().filter((x) => x !== old);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].gain.events[0]).toMatchObject({ kind: 'set', v: 0 });
    run(ctx, 4);
    eng.stopMusic(0); // even "now" ramps over a few milliseconds
    const stop = fresh[0].gain.events[fresh[0].gain.events.length - 1];
    expect(stop.v).toBe(0);
    expect(stop.t - ctx.currentTime).toBeGreaterThan(0.029);
    expect(errors).toEqual([]);
  });

  it('keeps time but creates no voices while the music is muted', () => {
    vi.useFakeTimers();
    const { eng, ctx } = unlocked();
    eng.startMusic('mexico');
    run(ctx, 2);
    eng.setMusicVolume(0);
    run(ctx, 1);
    const n = ctx.sources().length;
    run(ctx, 5);
    expect(ctx.sources().length).toBe(n);
    eng.setMusicVolume(0.8);
    run(ctx, 2);
    expect(ctx.sources().length).toBeGreaterThan(n);
    eng.stopMusic();
    expect(errors).toEqual([]);
  });

  it('starts the wanted theme on unlock and ducks without errors', () => {
    vi.useFakeTimers();
    installFake();
    const eng = new AudioEngine();
    eng.startMusic('usa');
    eng.unlock();
    const ctx = FakeCtx.instances[0];
    run(ctx, 2);
    expect(ctx.sources().length).toBeGreaterThan(0);
    eng.duck(0.3, 2);
    eng.duck(0.5, 1); // merges with the deeper, longer duck
    ctx.currentTime += 1;
    eng.play('win');
    eng.duck(Number.NaN, 1);
    eng.stopMusic(0.5);
    run(ctx, 2);
    expect(errors).toEqual([]);
  });
});
