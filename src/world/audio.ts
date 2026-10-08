/**
 * The World's sound — all synthesized with Web Audio (no recordings): a bed of wind, birdsong by
 * day and crickets by night, and creature CALLS spatialised from where they happen relative to the
 * camera. Each creature's voice is read off its body the way its traits are: big bodies call low and
 * slow, small ones high and quick; a fanged maw growls (noisy, low-passed), a beak chirps (pure,
 * swooping), a grazer's mouth lows, mandibles click. Calls fire on moments worth hearing — bolting in
 * alarm, closing on prey, courting, being bitten, hatching — rate-limited per creature and overall.
 *
 * The context starts suspended until the user turns sound on (browsers require a gesture).
 */
import type { Traits } from '../sim/traits';

export type Call = 'alarm' | 'hunt' | 'court' | 'hurt' | 'young';

interface Voice {
  pitch: number; // base frequency (Hz)
  noisy: number; // 0 pure … 1 rasping
  swoop: number; // pitch glide (×)
  click: boolean; // percussive (mandibles)
}

export function voiceOf(t: Traits): Voice {
  const size = Math.cbrt(Math.max(0.05, t.mass));
  const pitch = 820 / Math.pow(size, 1.2);
  switch (t.mouth) {
    case 'fanged':
    case 'maw':
      return { pitch: pitch * 0.45, noisy: 0.7, swoop: 0.85, click: false };
    case 'beak':
      return { pitch: pitch * 2.2, noisy: 0.05, swoop: 1.6, click: false };
    case 'herbivore':
    case 'trunk':
      return { pitch: pitch * 0.6, noisy: 0.25, swoop: 0.9, click: false };
    case 'mandibles':
      return { pitch: pitch * 2.5, noisy: 0.9, swoop: 1, click: true };
    default:
      return { pitch: pitch * 1.1, noisy: 0.4, swoop: 1.2, click: false };
  }
}

class Engine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private rain: { hiss: GainNode; patter: GainNode } | null = null;
  private night = 0;
  private recent = 0; // calls in the last second (global limiter)
  private lastTick = 0;
  private nextAmbient = 0;

  start(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      this.startWind();
      this.startRain();
    }
    void this.ctx.resume();
  }

  stop(): void {
    if (this.ctx) void this.ctx.suspend();
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startWind(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    this.wind = { gain, filter };
  }

  /** Rain: a broad high hiss (the shower on the leaves) over a softer low patter — two filtered
   *  noise beds, silent until a shower turns them up. */
  private startRain(): void {
    const ctx = this.ctx!;
    const bed = (type: BiquadFilterType, f: number, q: number): GainNode => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = 0.7 + Math.random() * 0.6; // decorrelate the two beds
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = f;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master!);
      src.start();
      return gain;
    };
    this.rain = { hiss: bed('highpass', 2400, 0.4), patter: bed('bandpass', 700, 0.8) };
  }

  /** Per-frame: move the listener with the camera, breathe the wind, sprinkle ambient voices. */
  tick(cam: { x: number; y: number; z: number; fx: number; fy: number; fz: number }, night: boolean, cold: number, rain = 0): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.x, now, 0.05);
      L.positionY.setTargetAtTime(cam.y, now, 0.05);
      L.positionZ.setTargetAtTime(cam.z, now, 0.05);
      L.forwardX.setTargetAtTime(cam.fx, now, 0.05);
      L.forwardY.setTargetAtTime(cam.fy, now, 0.05);
      L.forwardZ.setTargetAtTime(cam.fz, now, 0.05);
    }
    if (now - this.lastTick > 0.25) {
      this.lastTick = now;
      this.recent = Math.max(0, this.recent - 1);
      // gusting wind, stronger in winter
      if (this.wind) {
        const gust = 0.035 + 0.03 * (0.5 + 0.5 * Math.sin(now * 0.31) * Math.sin(now * 0.17)) + 0.03 * cold;
        this.wind.gain.gain.setTargetAtTime(gust, now, 0.8);
        this.wind.filter.frequency.setTargetAtTime(320 + 260 * Math.sin(now * 0.23) ** 2, now, 1);
      }
      this.night += ((night ? 1 : 0) - this.night) * 0.1;
      if (this.rain) {
        this.rain.hiss.gain.setTargetAtTime(0.09 * rain, now, 1.2);
        this.rain.patter.gain.setTargetAtTime(0.06 * rain * (0.8 + 0.2 * Math.sin(now * 0.7)), now, 1.2);
      }
    }
    // the birds fall quiet in a downpour
    if (now > this.nextAmbient && rain > 0.5) this.nextAmbient = now + 2;
    if (now > this.nextAmbient) {
      // a far-off bird by day, a cricket chorus by night (fewer in the cold)
      if (this.night < 0.5) this.chirp(1700 + Math.random() * 1600, 0.025 * (1 - cold));
      else this.cricket(0.02 * (1 - cold * 0.8));
      this.nextAmbient = now + (this.night < 0.5 ? 1.2 + Math.random() * 3.5 : 0.35 + Math.random() * 0.6);
    }
  }

  private chirp(f: number, vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t0 = t + i * 0.13;
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * (1.3 + Math.random() * 0.4), t0 + 0.07);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      o.connect(g).connect(this.master!);
      o.start(t0);
      o.stop(t0 + 0.12);
    }
  }

  private cricket(vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 4200 + Math.random() * 600;
    const am = ctx.createGain();
    const g = ctx.createGain();
    g.gain.value = 0;
    for (let i = 0; i < 4; i++) {
      g.gain.setValueAtTime(vol, t + i * 0.045);
      g.gain.setValueAtTime(0, t + i * 0.045 + 0.022);
    }
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    o.connect(hp).connect(am).connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** A creature's call at a world position (respecting the per-second limiter). */
  call(kind: Call, v: Voice, pos: { x: number; y: number; z: number }): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.recent > 4) return;
    this.recent++;
    const t = ctx.currentTime;
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 6;
    pan.rolloffFactor = 1.2;
    pan.maxDistance = 200;
    if (pan.positionX) {
      pan.positionX.value = pos.x;
      pan.positionY.value = pos.y;
      pan.positionZ.value = pos.z;
    }
    const out = ctx.createGain();
    out.connect(pan).connect(this.master!);
    // call shapes: [duration, pitch ×, glide ×, volume, repeats]
    const shape: Record<Call, [number, number, number, number, number]> = {
      alarm: [0.18, 1.5, v.swoop * 1.2, 0.5, 2],
      hunt: [0.55, 0.8, 0.8, 0.45, 1],
      court: [0.35, 1.15, v.swoop, 0.3, 2],
      hurt: [0.22, 1.7, 0.7, 0.55, 1],
      young: [0.12, 2.4, 1.3, 0.25, 3],
    };
    const [dur, pm, glide, vol, reps] = shape[kind];
    for (let i = 0; i < reps; i++) {
      const t0 = t + i * (dur * 1.25);
      const f0 = v.pitch * pm * (0.95 + Math.random() * 0.1);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(vol, t0 + (v.click ? 0.004 : 0.03));
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + (v.click ? dur * 0.3 : dur));
      env.connect(out);
      // the tonal body
      const o = ctx.createOscillator();
      o.type = v.noisy > 0.5 ? 'sawtooth' : 'triangle';
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f0 * glide), t0 + dur);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = f0 * (2 + 4 * (1 - v.noisy));
      o.connect(lp).connect(env);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
      // a rasp of noise for the growlers and the clickers
      if (v.noisy > 0.3 && this.noise) {
        const n = ctx.createBufferSource();
        n.buffer = this.noise;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f0 * 1.5;
        bp.Q.value = 1.2;
        const ng = ctx.createGain();
        ng.gain.value = v.noisy * 0.9;
        n.connect(bp).connect(ng).connect(env);
        n.start(t0, Math.random());
        n.stop(t0 + dur + 0.05);
      }
    }
    setTimeout(() => out.disconnect(), (reps * dur * 1.25 + 0.5) * 1000);
  }
}

export const SOUND = new Engine();
