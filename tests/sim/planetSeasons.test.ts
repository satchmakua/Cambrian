import { describe, it, expect } from 'vitest';
import { frontsAt, localTime, swingAt, warmthNow, weatherOf } from '../../src/sim/planetSeasons';
import { climate, DAY_LENGTH, seasonal, YEAR_DAYS } from '../../src/sim/model';
import { createPlanet } from '../../src/sim/world';
import { cellCentre } from '../../src/sim/cubeGrid';
import { tempOn } from '../../src/sim/planetGround';
import type { PlanetSurface } from '../../src/sim/planetSurface';

/** a planet's seasons and weather (src/sim/planetSeasons.ts) */
const YEAR = DAY_LENGTH * YEAR_DAYS;
/** the middle of the north's summer, and of its winter */
const SUMMER = YEAR * 0.375, WINTER = YEAR * 0.875;
const lat45 = Math.SQRT1_2;

describe('a planet’s seasons', () => {
  it('turns summer in the north into winter in the south, half a year apart', () => {
    const a = swingAt(0.5, lat45);
    expect(warmthNow(12, a, SUMMER, lat45)).toBeGreaterThan(20);
    expect(warmthNow(12, a, SUMMER, -lat45)).toBeLessThan(2);
    expect(warmthNow(12, a, WINTER, lat45)).toBeLessThan(2);
    expect(warmthNow(12, a, WINTER, -lat45)).toBeGreaterThan(20);
    expect(localTime(SUMMER, -lat45) - SUMMER).toBe(YEAR / 2);
  });

  it('has none at the equator, nor on a planet whose axis does not lean, and harsher ones toward the poles', () => {
    for (const t of [0, YEAR * 0.25, YEAR * 0.5, YEAR * 0.75]) {
      expect(warmthNow(25, swingAt(0.5, 0), t, 0)).toBeCloseTo(25, 9);
      expect(warmthNow(10, swingAt(0, lat45), t, lat45)).toBeCloseTo(10, 9);
    }
    expect(swingAt(0.5, 0.95)).toBeGreaterThan(swingAt(0.5, lat45));
    expect(swingAt(1, lat45)).toBeCloseTo(2 * swingAt(0.5, lat45), 9);
  });

  it('gives a place at 45° on an Earth’s tilt the valley’s own year', () => {
    expect(swingAt(0.5, lat45)).toBeCloseTo(1, 9);
    // (its grass, season by season, is the valley's: the swing times the year's own shape about its mean)
    for (let t = 0; t < YEAR; t += YEAR / 16) {
      const mean = (1.45 + 1.05 + 0.78 + 0.45) / 4;
      expect(mean + 1 * (seasonal(localTime(t, lat45), [1.45, 1.05, 0.78, 0.45]) - mean)).toBeCloseTo(climate(t).grass, 9);
    }
  });

  it('carries its fronts along their bands: east in the westerlies, west in the trades', () => {
    let east = 0, west = 0;
    for (let t = 0; t < YEAR; t += DAY_LENGTH / 2) {
      const a = frontsAt(7, 300, t), b = frontsAt(7, 300, t + 1);
      a.forEach((f, i) => {
        const g = b[i];
        if (f.strength <= 0 || g.strength <= 0 || Math.abs(f.at[1] - g.at[1]) > 1e-9) return;
        const lon = (v: number[]) => Math.atan2(-v[2], v[0]);
        let d = lon(g.at) - lon(f.at);
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const lat = Math.abs(Math.asin(f.at[1]));
        if (lat > 0.6 && lat < 0.95) expect(d).toBeGreaterThan(0);
        if (lat > 0.1 && lat < 0.45) expect(d).toBeLessThan(0);
        if (d > 0) east++;
        else if (d < 0) west++;
      });
    }
    expect(east).toBeGreaterThan(10);
    expect(west).toBeGreaterThan(10);
    // …and where a strong one is, the sky is overcast
    const f = frontsAt(7, 300, YEAR / 3).sort((x, y) => y.strength - x.strength)[0];
    expect(weatherOf([f], f.at).cloud).toBeGreaterThan(0.6);
  });
});

describe('a planet world’s seasons', () => {
  const w = createPlanet({ seed: 7, radius: 160, relief: 30, land: 0.6, tilt: 0.5 });
  const S = w.surface as PlanetSurface;
  const N = Math.round(Math.sqrt(S.cells / 6));

  it('grows its grass by each hemisphere’s own season, and snows only where it is cold', () => {
    w.time = WINTER;
    const now = S.seasonsNow!(w);
    let north = 0, nN = 0, south = 0, nS = 0;
    for (let k = 0; k < S.cells; k++) {
      const u = cellCentre(N, k);
      if (now.snowing[k]) expect(warmthNow(tempOn(S.ground, u), swingAt(0.5, u[1]), WINTER, u[1])).toBeLessThan(0.5);
      if (Math.abs(Math.abs(u[1]) - lat45) > 0.08 || tempOn(S.ground, u) < 2) continue;
      if (u[1] > 0) (north += now.grass[k]), nN++;
      else (south += now.grass[k]), nS++;
    }
    expect(nN).toBeGreaterThan(20);
    expect(nS).toBeGreaterThan(20);
    // (the north's winter, the south's summer)
    expect(north / nN).toBeLessThan(0.75 * (south / nS));
    w.time = SUMMER;
    const later = S.seasonsNow!(w);
    let n2 = 0, s2 = 0;
    for (let k = 0; k < S.cells; k++) {
      const u = cellCentre(N, k);
      if (Math.abs(Math.abs(u[1]) - lat45) > 0.08 || tempOn(S.ground, u) < 2) continue;
      if (u[1] > 0) n2 += later.grass[k];
      else s2 += later.grass[k];
    }
    expect(n2 / nN).toBeGreaterThan(s2 / nS);
  });
});
