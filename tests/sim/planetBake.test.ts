import { describe, it, expect } from 'vitest';
import { bakePlanet, LAKE, LAND, RIVER, SEA, SWIM_FLOW, type Bake } from '../../src/sim/planetBake';
import { cellCentre } from '../../src/sim/cubeGrid';
import { biomeOn, makePlanetGround } from '../../src/sim/planetGround';
import { createPlanet } from '../../src/sim/world';
import { canStand } from '../../src/sim/model';
import type { Traits } from '../../src/sim/traits';

/** a planet's terrain, baked (src/sim/planetBake.ts): plates, the rivers' carving, lakes, rivers, waters */
describe('a baked planet', () => {
  const spec = { seed: 7, radius: 160, relief: 30, land: 0.6 };
  const b = bakePlanet(spec);
  const n = b.grid.count;
  const nbrs = (k: number) => [...b.grid.nbr.subarray(k * 8, k * 8 + 8)].filter((q) => q >= 0);

  it('drains: every drop of rain on dry ground runs on to a lake or the sea, never round in a ring', () => {
    for (let k = 0; k < n; k++) {
      if (b.kind[k] === SEA || b.kind[k] === LAKE) continue;
      let c = k, steps = 0;
      while (b.kind[c] !== SEA && b.kind[c] !== LAKE) {
        c = b.recv[c];
        expect(c).toBeGreaterThanOrEqual(0);
        expect(++steps).toBeLessThan(n);
      }
    }
  });

  it('holds its lakes level at their brims, each walled by dry ground no lower than its water', () => {
    const lakes = b.bodies.filter((x) => x.kind === 'lake');
    expect(lakes.length).toBeGreaterThan(0);
    for (let k = 0; k < n; k++) {
      if (b.kind[k] !== LAKE) continue;
      const lake = b.bodies[b.body[k]];
      expect(b.level[k]).toBeCloseTo(lake.level, 4);
      expect(b.h[k]).toBeLessThan(b.level[k]);
      for (const q of nbrs(k)) if (b.kind[q] === LAND) expect(b.h[q]).toBeGreaterThanOrEqual(lake.level - 1e-4);
    }
  });

  it('gathers its rivers downstream, their water falling toward the sea and lying in their channels', () => {
    let rivers = 0;
    for (let k = 0; k < n; k++) {
      if (b.kind[k] !== RIVER) continue;
      rivers++;
      const r = b.recv[k];
      expect(b.h[k]).toBeLessThan(b.level[k]);
      if (b.kind[r] === RIVER) {
        expect(b.flow[r]).toBeGreaterThanOrEqual(b.flow[k] - 1e-3);
        expect(b.level[r]).toBeLessThanOrEqual(b.level[k] + 1e-4);
      } else if (b.kind[r] === LAKE) expect(b.level[k]).toBeGreaterThanOrEqual(b.bodies[b.body[r]].level - 1e-4);
      else expect(b.kind[r]).toBe(SEA);
    }
    expect(rivers).toBeGreaterThan(100);
  });

  it('is the same planet for the same spec, and another for another seed', () => {
    expect(bakePlanet(spec).checksum).toBe(b.checksum);
    expect(bakePlanet({ ...spec, seed: 8 }).checksum).not.toBe(b.checksum);
    expect(bakePlanet({ ...spec, continents: 0.9 }).checksum).not.toBe(b.checksum);
  });

  it('lets a fish along the rivers a swimmer can use, and keeps it out of the streams', () => {
    const w = createPlanet(spec);
    const fish = { habitat: 'water', walk: 0 } as Traits;
    const R = spec.radius;
    let swim = 0, stream = 0;
    const g = (w.surface as unknown as { ground: { bake: Bake } }).ground.bake;
    for (let k = 0; k < g.grid.count; k++) {
      if (g.kind[k] !== RIVER) continue;
      const u = cellCentre(g.grid.N, k);
      const ok = canStand(w, fish, { x: u[0] * R, y: u[1] * R, z: u[2] * R });
      if (g.flow[k] >= SWIM_FLOW) {
        expect(ok).toBe(true);
        swim++;
      } else {
        expect(ok).toBe(false);
        stream++;
      }
    }
    expect(swim).toBeGreaterThan(0);
    expect(stream).toBeGreaterThan(0);
    // (and a lake whose way out no fish can make is its own reach)
    for (const x of g.bodies) if (x.kind === 'lake' && !x.swim && !g.bodies.some((y) => y.swim && y.to === x.id)) expect(x.reach).toBe(x.id);
  });
});

/** the lands of a baked planet: dry ground joined cell to cell, each as a share of all the land */
function landsOf(b: Bake): number[] {
  const n = b.grid.count, seen = new Uint8Array(n), out: number[] = [];
  let all = 0;
  for (let k = 0; k < n; k++) if (b.kind[k] !== SEA) all += b.grid.area[k];
  for (let k = 0; k < n; k++) {
    if (b.kind[k] === SEA || seen[k]) continue;
    let a = 0;
    const stack = [k];
    seen[k] = 1;
    while (stack.length) {
      const s = stack.pop()!;
      a += b.grid.area[s];
      for (let e = 0; e < 8; e++) {
        const q = b.grid.nbr[s * 8 + e];
        if (q >= 0 && b.kind[q] !== SEA && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    out.push(a / all);
  }
  return out.sort((a, c) => c - a);
}

describe('a hundred baked planets', () => {
  it('each without a NaN, its land as asked, its waters drained, and ground of many kinds on every one', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const spec = { seed, radius: 70, relief: 30, land: 0.6, continents: (seed % 5) / 4, rugged: (seed % 3) / 2 };
      const g = makePlanetGround(spec);
      const b = g.bake;
      const n = b.grid.count;
      let landA = 0, all = 0;
      for (let k = 0; k < n; k++) {
        for (const f of [b.h, b.level, b.moist, b.rain, b.flow]) expect(Number.isFinite(f[k])).toBe(true);
        all += b.grid.area[k];
        if (b.kind[k] !== SEA) landA += b.grid.area[k];
      }
      expect(Math.abs(landA / all - 0.6)).toBeLessThan(0.03);
      // every dry cell drains to a lake or the sea (each path walked once: a cell met again is known to)
      const drains = new Uint8Array(n);
      for (let k = 0; k < n; k++) {
        const path: number[] = [];
        let c = k;
        while (b.kind[c] !== SEA && b.kind[c] !== LAKE && !drains[c]) {
          path.push(c);
          c = b.recv[c];
          expect(c).toBeGreaterThanOrEqual(0);
          expect(path.length).toBeLessThan(n);
        }
        for (const p of path) drains[p] = 1;
      }
      // the sea's deep and its shallows, a shore, and lands of half a dozen kinds or more
      const biomes = new Set<string>();
      for (let k = 0; k < n; k += 3) biomes.add(biomeOn(g, cellCentre(b.grid.N, k)));
      for (const kind of ['deep', 'shallow', 'sand']) expect(biomes).toContain(kind);
      expect([...biomes].filter((x) => x !== 'deep' && x !== 'shallow').length).toBeGreaterThanOrEqual(6);
    }
  }, 120_000);

  it('makes one great land, or lets the sea in along the plates’ seams for many', () => {
    // (three parts in five land join up into one by themselves: only the seas between plates part it)
    for (const seed of [1, 2, 3]) {
      const one = landsOf(bakePlanet({ seed, radius: 200, relief: 30, land: 0.6, continents: 0 }));
      const many = landsOf(bakePlanet({ seed, radius: 200, relief: 30, land: 0.6, continents: 1 }));
      expect(one[0]).toBeGreaterThan(0.95);
      expect(many[0]).toBeLessThan(0.85);
      expect(many.filter((x) => x >= 0.02).length).toBeGreaterThanOrEqual(2);
    }
  }, 60_000);
});
