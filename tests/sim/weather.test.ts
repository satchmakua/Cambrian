import { describe, it, expect } from 'vitest';
import { weatherAt, weatherWord, spell } from '../../src/sim/weather';
import { DAY_LENGTH, YEAR_DAYS, seasonOf } from '../../src/sim/world';

describe('weather', () => {
  it('is a pure function of seed and time', () => {
    for (let t = 0; t < DAY_LENGTH * 6; t += 37) expect(weatherAt(5, t)).toEqual(weatherAt(5, t));
  });

  it('rains some spells and not others; summer is the dry season; winter falls as snow', () => {
    const wetBy: Record<string, number> = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    const spellsBy: Record<string, number> = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    let snowed = false, rained = false;
    for (let seed = 1; seed <= 20; seed++) {
      for (let k = 0; k < (YEAR_DAYS * DAY_LENGTH) / spell(); k++) {
        const mid = (k + 0.5) * spell();
        const w = weatherAt(seed, mid);
        const s = seasonOf(mid);
        spellsBy[s]++;
        if (w.rain > 0) {
          wetBy[s]++;
          if (w.snow) snowed = true;
          else rained = true;
          expect(s === 'winter' || !w.snow).toBe(true);
        }
      }
    }
    expect(rained && snowed).toBe(true);
    const frac = (s: string) => wetBy[s] / spellsBy[s];
    expect(frac('summer')).toBeLessThan(frac('spring'));
    expect(frac('summer')).toBeLessThan(frac('autumn'));
    expect(frac('spring')).toBeGreaterThan(0.15);
  });

  it('a wet spell clouds over before it rains and clears after', () => {
    let k = 0;
    while (weatherAt(3, (k + 0.5) * spell()).rain === 0) k++;
    const at = (f: number) => weatherAt(3, (k + f) * spell());
    expect(at(0.05).rain).toBe(0);
    expect(at(0.05).cloud).toBeGreaterThan(0);
    expect(at(0.5).rain).toBeGreaterThan(0);
    expect(at(0.95).rain).toBe(0);
    expect(weatherWord(at(0.5))).not.toBe('');
  });
});
