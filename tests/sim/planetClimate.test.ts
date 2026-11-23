import { describe, it, expect } from 'vitest';
import { climateOn, lushness, npp, VALLEY_CLIMATE, waterLushness } from '../../src/sim/planetClimate';
import { LAKE, SEA } from '../../src/sim/planetBake';
import { cellCentre } from '../../src/sim/cubeGrid';
import { biomeOn, foodOn, kindOn, makePlanetGround, type PlanetGround } from '../../src/sim/planetGround';
import type { Biome } from '../../src/sim/terrain';

/** a planet's climate (src/sim/planetClimate.ts) and what grows on it (src/sim/planetGround.ts) */
const spec = { seed: 7, radius: 160, relief: 30, land: 0.6 };

/** each kind of ground's share of a planet's land (its cells read at their middles) */
function landShares(g: PlanetGround): Map<Biome, number> {
  const N = g.bake.grid.N, out = new Map<Biome, number>();
  let all = 0;
  for (let k = 0; k < g.bake.grid.count; k += 2) {
    const b = biomeOn(g, cellCentre(N, k));
    if (b === 'deep' || b === 'shallow') continue;
    out.set(b, (out.get(b) ?? 0) + 1);
    all++;
  }
  for (const [b, n] of out) out.set(b, n / all);
  return out;
}

describe('a planet’s climate', () => {
  const g = makePlanetGround(spec);
  const b = g.bake, n = b.grid.count, pt = b.grid.pt;
  const latOf = (k: number) => (Math.abs(Math.asin(pt[k * 3 + 1])) * 180) / Math.PI;

  it('is colder toward the poles, and colder up the mountains', () => {
    // the land's mean warmth, band by band from the equator
    const bands = [0, 15, 30, 45, 60, 75, 90].slice(0, -1).map((lo) => {
      let s = 0, c = 0;
      for (let k = 0; k < n; k++) if (b.kind[k] !== SEA && latOf(k) >= lo && latOf(k) < lo + 15) (s += b.T[k]), c++;
      return c ? s / c : NaN;
    });
    for (let i = 1; i < bands.length; i++) if (!Number.isNaN(bands[i]) && !Number.isNaN(bands[i - 1])) expect(bands[i]).toBeLessThan(bands[i - 1]);
    // …and within a band, the high ground colder than the low
    for (const lo of [0, 20, 40]) {
      const cells: number[] = [];
      for (let k = 0; k < n; k++) if (b.kind[k] !== SEA && latOf(k) >= lo && latOf(k) < lo + 20) cells.push(k);
      cells.sort((x, y) => b.h[x] - b.h[y]);
      const q = Math.floor(cells.length / 4);
      const mean = (ks: number[]) => ks.reduce((s, k) => s + b.T[k], 0) / ks.length;
      expect(mean(cells.slice(-q))).toBeLessThan(mean(cells.slice(0, q)) - 3);
    }
  });

  it('leaves the lee of a range drier than its windward side', () => {
    const sea = new Uint8Array(n);
    for (let k = 0; k < n; k++) sea[k] = b.kind[k] === SEA ? 1 : 0;
    const c = climateOn(b.grid, b.h, sea, { radius: spec.radius, relief: spec.relief, temperature: 0, wetness: 0, salt: 1 });
    // walk ten cells with the wind and ten against it: rising ground downwind is a windward slope, falling a lee
    const walk = (k: number, sign: number) => {
      let at = k;
      for (let i = 0; i < 10; i++) {
        let best = at, most = 0;
        for (let e = 0; e < 8; e++) {
          const q = b.grid.nbr[at * 8 + e];
          if (q < 0) continue;
          const d = (pt[q * 3] - pt[at * 3]) * c.wind[at * 3] + (pt[q * 3 + 1] - pt[at * 3 + 1]) * c.wind[at * 3 + 1] + (pt[q * 3 + 2] - pt[at * 3 + 2]) * c.wind[at * 3 + 2];
          if (sign * d > most) [best, most] = [q, sign * d];
        }
        at = best;
      }
      return at;
    };
    let wind = 0, windN = 0, lee = 0, leeN = 0;
    for (let k = 0; k < n; k++) {
      if (sea[k] || Math.hypot(c.wind[k * 3], c.wind[k * 3 + 1], c.wind[k * 3 + 2]) < 0.5) continue;
      const up = walk(k, -1), down = walk(k, 1);
      if (sea[up] || sea[down]) continue;
      const rise = b.h[down] - b.h[up];
      if (rise > 8) (wind += c.P[k]), windN++;
      else if (rise < -8) (lee += c.P[k]), leeN++;
    }
    expect(windN).toBeGreaterThan(50);
    expect(leeN).toBeGreaterThan(50);
    expect(wind / windN).toBeGreaterThan(1.15 * (lee / leeN));
  });

  it('grows, at the valley’s own climate, what the valley grows', () => {
    expect(lushness(VALLEY_CLIMATE.T, VALLEY_CLIMATE.P)).toBeCloseTo(1, 12);
    expect(waterLushness(VALLEY_CLIMATE.T)).toBeCloseTo(1, 12);
    // a desert a fifth or so as much, a rainforest about twice, the tundra a third; never a cliff between
    expect(lushness(22, 150)).toBeLessThan(0.3);
    expect(lushness(26, 2500)).toBeGreaterThan(1.8);
    expect(lushness(-5, 300)).toBeLessThan(0.4);
    for (let t = -20; t < 30; t += 1) for (let p = 0; p < 3000; p += 50) {
      expect(Math.abs(npp(t + 1, p) - npp(t, p))).toBeLessThan(120);
      expect(Math.abs(npp(t, p + 50) - npp(t, p))).toBeLessThan(120);
    }
  });

  it('feeds the shallows and the lakes, and leaves the open sea beyond the shelf barren', () => {
    let deepSea = 0, shelf = 0, lake = 0;
    for (let k = 0; k < n; k += 3) {
      const p = cellCentre(b.grid.N, k);
      const bm = biomeOn(g, p), f = foodOn(g, p), kind = kindOn(g, p);
      if (bm === 'deep' && kind === SEA) {
        expect(f.algae).toBe(0);
        deepSea++;
      } else if (bm === 'shallow') {
        expect(f.algae).toBeGreaterThan(0.3);
        shelf++;
      } else if (bm === 'deep' && kind === LAKE) {
        expect(f.algae).toBeGreaterThan(0.2);
        lake++;
      }
      if (bm === 'ice' || bm === 'rock') expect(f.grass).toBe(0);
    }
    expect(deepSea).toBeGreaterThan(0);
    expect(shelf).toBeGreaterThan(0);
  });
});

describe('what grows where', () => {
  it('has every kind of ground the climate makes, on planets enough', () => {
    const seen = new Set<Biome>();
    for (const seed of [1, 2, 3]) for (const b of landShares(makePlanetGround({ ...spec, seed })).keys()) seen.add(b);
    for (const b of ['ice', 'tundra', 'taiga', 'wood', 'meadow', 'desert', 'savanna', 'jungle', 'rock', 'sand', 'marsh'] as Biome[]) expect(seen).toContain(b);
  });

  it('turns to ice as it cools, and from desert to forest as it wets', () => {
    const at = (o: object) => landShares(makePlanetGround({ ...spec, ...o }));
    const base = at({});
    const cold = at({ temperature: -1 }), warm = at({ temperature: 1 });
    expect(cold.get('ice') ?? 0).toBeGreaterThan((base.get('ice') ?? 0) + 0.1);
    expect(warm.get('ice') ?? 0).toBeLessThan(base.get('ice') ?? 0);
    const dry = at({ wetness: -1 }), wet = at({ wetness: 1 });
    const forest = (m: Map<Biome, number>) => (m.get('wood') ?? 0) + (m.get('jungle') ?? 0) + (m.get('taiga') ?? 0);
    expect(dry.get('desert') ?? 0).toBeGreaterThan((base.get('desert') ?? 0) + 0.1);
    expect(forest(wet)).toBeGreaterThan(forest(base) + 0.1);
  }, 60_000);
});
