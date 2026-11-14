import { describe, it, expect } from 'vitest';
import { weatherAt, weatherWord, spell, droughtOf, DROUGHT_ODDS } from '../../src/sim/weather';
import { DAY_LENGTH, YEAR_DAYS, seasonOf, createWorld, stepWorld, STEP } from '../../src/sim/world';

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

// (every year was the same year: the valley settled into one balance and stayed there)
describe('dry years', () => {
  const YEAR = DAY_LENGTH * YEAR_DAYS;
  it('about one year in four runs dry, never a valley\'s first, and how dry is fixed by the seed and year', () => {
    let dry = 0, years = 0;
    for (let seed = 1; seed <= 60; seed++) {
      expect(droughtOf(seed, YEAR * 0.5)).toBe(0);
      for (let y = 1; y <= 8; y++) {
        const d = droughtOf(seed, (y + 0.3) * YEAR);
        expect(d).toBe(droughtOf(seed, (y + 0.9) * YEAR)); // the whole year alike
        if (d > 0) {
          dry++;
          expect(d).toBeGreaterThanOrEqual(0.5);
          expect(d).toBeLessThanOrEqual(1);
        }
        years++;
      }
    }
    expect(dry / years).toBeGreaterThan(DROUGHT_ODDS - 0.08);
    expect(dry / years).toBeLessThan(DROUGHT_ODDS + 0.08);
  });

  it('a dry year has fewer showers', () => {
    let wetDry = 0, spellsDry = 0, wetWet = 0, spellsWet = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (let y = 1; y <= 6; y++) {
        const isDry = droughtOf(seed, y * YEAR) > 0;
        for (let k = 0; k < YEAR / spell(); k++) {
          const t = y * YEAR + (k + 0.5) * spell();
          const rained = weatherAt(seed, t).rain > 0;
          if (isDry) { spellsDry++; if (rained) wetDry++; } else { spellsWet++; if (rained) wetWet++; }
        }
      }
    }
    expect(wetDry / spellsDry).toBeLessThan(0.8 * (wetWet / spellsWet));
  });

  it("a dry year's grass comes back slower, and the journal tells of it at its first dawn", () => {
    // a valley whose second year runs dry, and one whose second year doesn't
    const find = (want: boolean) => {
      for (let seed = 1; seed < 500; seed++) if ((droughtOf(seed, YEAR * 1.5) > 0.7) === want && (want || droughtOf(seed, YEAR * 1.5) === 0)) return seed;
      throw new Error('none');
    };
    const regrowth = (seed: number) => {
      const w = createWorld(seed);
      w.time = YEAR - STEP * 2; // the last moments of the first year
      for (let k = 0; k < w.grass.length; k++) w.grass[k] = w.grassCap[k] * 0.2;
      const before = w.grass.reduce((a, b) => a + b, 0);
      for (let i = 0; i < DAY_LENGTH / STEP; i++) stepWorld(w);
      return { gain: (w.grass.reduce((a, b) => a + b, 0) - before) / Math.max(1e-9, w.grassCap.reduce((a, b) => a + b, 0)), told: w.events.some((e) => e.kind === 'climate') };
    };
    const dry = regrowth(find(true));
    const wet = regrowth(find(false));
    expect(dry.told).toBe(true);
    expect(wet.told).toBe(false);
    expect(dry.gain).toBeLessThan(0.75 * wet.gain);
  });
});

