/**
 * Weather — showers and snowfalls, as a pure function of the world's seed and the time.
 *
 * The sky is cut into half-day spells. Each spell is wet or dry by a hash of (seed, spell), with the
 * odds set by the season (a wet spring and autumn, a dry summer); a wet spell has its own strength
 * and clouds over, rains (or, in the cold, snows) through its middle and clears again. Because it is
 * a function and not state, a saved world needs nothing extra and every replay sees the same skies.
 */
import { unitHash } from '../engine/rng';
import { DAY_LENGTH, climate, seasonal } from './world';

/** a spell lasts half a day (a function, not a constant: world.ts imports this module, so its values
 *  can only be read once both have loaded) */
export const spell = (): number => DAY_LENGTH / 2;

export interface Weather {
  /** 0 clear … 1 heavy overcast */
  cloud: number;
  /** 0 dry … 1 a downpour (or a heavy snowfall, when `snow`) */
  rain: number;
  /** cold enough that it falls as snow */
  snow: boolean;
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function weatherAt(seed: number, time: number): Weather {
  const S = spell();
  const k = Math.floor(time / S);
  const f = time / S - k; // 0..1 through the spell
  const odds = seasonal((k + 0.5) * S, [0.38, 0.16, 0.42, 0.4]);
  const wet = unitHash(seed, k, 0x7e7) < odds;
  const snow = climate(time).cold > 0.62;
  if (!wet) return { cloud: 0, rain: 0, snow };
  const peak = 0.35 + 0.65 * unitHash(seed, k, 0x7e8);
  const cloud = peak * smooth(0, 0.12, f) * (1 - smooth(0.88, 1, f));
  const rain = peak * smooth(0.12, 0.3, f) * (1 - smooth(0.7, 0.88, f));
  return { cloud: Math.min(1, cloud * 1.25), rain, snow };
}

/** A word for the HUD: '' when fair. */
export function weatherWord(w: Weather): string {
  if (w.rain > 0.08) return w.snow ? (w.rain > 0.6 ? 'heavy snow' : 'snow') : w.rain > 0.6 ? 'downpour' : 'rain';
  if (w.cloud > 0.25) return 'overcast';
  return '';
}
