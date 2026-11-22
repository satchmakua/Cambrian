import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/engine/rng';
import { genomeOfMorphotype } from '../../src/engine/random';
import { createPlanet, release, stepWorld, worldHash, DAY_LENGTH, STEP, type Creature, type World } from '../../src/sim/world';
import { starterCast } from '../../src/sim/cast';
import { planetSurface, type PlanetSurface } from '../../src/sim/planetSurface';
import { heightOn } from '../../src/sim/planetGround';
import { arc, fibonacci, randomPlace, type Vec3 } from '../../src/sim/sphere';
import type { Place } from '../../src/sim/surface';

const R = 100;
const SPEC = { seed: 5, radius: R, relief: 14, land: 0.5 };
const S: PlanetSurface = planetSurface(SPEC);
const rng = mulberry32(17);
const place = (): Place => {
  const u = randomPlace(rng);
  return { x: u[0] * R, y: u[1] * R, z: u[2] * R };
};
const rad = (p: Place) => Math.hypot(p.x, p.y ?? 0, p.z);
const near = (a: Place, b: Place, eps: number) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z) < eps;

describe('the planet as a surface', () => {
  it('keeps every place it makes on the sphere of its sea', () => {
    for (let i = 0; i < 300; i++) {
      const p = place(), q = place();
      for (const m of [S.around(p, rng() * 7, rng() * 40), S.away(p, q, 10), S.offset(p, rng() * 9 - 4, rng() * 9 - 4), S.mid(p, q), S.pull(p, q, 0.5, 0.7), S.anywhere(rng, 1), S.edge(rng() * 7), S.cellCenter(Math.floor(rng() * S.cells))]) {
        expect(Math.abs(rad(m) - R)).toBeLessThan(1e-9);
      }
    }
  });

  it('measures over the ground, and goes the way it measured', () => {
    for (let i = 0; i < 300; i++) {
      const p = place(), q = place();
      expect(Math.abs(S.dist(p, q) - S.dist(q, p))).toBeLessThan(1e-9);
      // around a place, at the bearing toward another and the distance to it: there
      expect(near(S.around(p, S.bearing(p, q), S.dist(p, q)), q, 1e-6 * R)).toBe(true);
      const d = rng() * 30;
      expect(Math.abs(S.dist(p, S.around(p, rng() * 7, d)) - d)).toBeLessThan(1e-9);
      const dx = rng() * 10 - 5, dz = rng() * 10 - 5;
      expect(Math.abs(S.dist(p, S.offset(p, dx, dz)) - Math.hypot(dx, dz))).toBeLessThan(1e-9);
    }
  });

  it('finds the living near a place as a search of them all would', () => {
    const w = { creatures: [] as Creature[], buckets: new Map() } as unknown as World;
    for (let i = 0; i < 400; i++) w.creatures.push({ ...place(), id: i, alive: true } as Creature);
    S.index(w);
    for (let k = 0; k < 60; k++) {
      const p = place(), r = 5 + rng() * 90;
      const got = new Set(S.nearby(w, p, r, []).map((c) => c.id));
      const want = new Set(w.creatures.filter((c) => S.dist(p, c) <= r + 1e-9).map((c) => c.id));
      expect([...got].sort()).toEqual([...want].sort());
    }
  });

  it('lays its fields out over the cube-sphere: each cell its own middle', () => {
    for (let k = 0; k < S.cells; k += 97) expect(S.cellOf(S.cellCenter(k))).toBe(k);
  });

  it('turns a body toward a goal and carries its heading flat on the ground as it moves', () => {
    const c = { ...place(), heading: 0, fx: 0, fy: 0, fz: 0 } as Creature;
    S.faceAnywhere(c, rng);
    const goal = S.around(c, 1.3, 25);
    for (let i = 0; i < 40; i++) S.turnToward(c, goal, 0.2);
    // (facing it now: a stride ahead is nearer the goal by about the stride)
    const stride = S.ahead(c, 0, 1);
    expect(S.dist(stride, goal)).toBeLessThan(S.dist(c, goal) - 0.99);
    for (let i = 0; i < 200; i++) {
      S.moveTo(c, S.ahead(c, rng() - 0.5, 2));
      S.tidy(c);
      const u: Vec3 = [c.x / R, c.y / R, c.z / R];
      const f: Vec3 = [c.fx!, c.fy!, c.fz!];
      expect(Math.abs(rad(c) - R)).toBeLessThan(1e-9);
      expect(Math.abs(Math.hypot(...f) - 1)).toBeLessThan(1e-9);
      expect(Math.abs(u[0] * f[0] + u[1] * f[1] + u[2] * f[2])).toBeLessThan(1e-9);
    }
  });

  it('has its sun go round once a day: half the world in the dark at any hour', () => {
    for (const t of [0, 0.3, 0.55, 0.8].map((f) => f * DAY_LENGTH)) {
      let dark = 0;
      const n = 2000;
      for (let i = 0; i < n; i++) {
        const u = fibonacci(i, n);
        if (S.night({ x: u[0] * R, y: u[1] * R, z: u[2] * R }, t)) dark++;
      }
      expect(dark / n).toBeGreaterThan(0.44);
      expect(dark / n).toBeLessThan(0.52);
    }
    // noon at the homeland is at the valley's noon (a quarter through its day)
    const home = { x: S.home[0] * R, y: S.home[1] * R, z: S.home[2] * R };
    expect(S.night(home, DAY_LENGTH * 0.25)).toBe(false);
    expect(S.night(home, DAY_LENGTH * 0.75)).toBe(true);
  });

  it('starts life in a homeland on land, with water in reach', () => {
    expect(heightOn(S.ground, S.home)).toBeGreaterThan(0);
    let wet = 0;
    for (let i = 0; i < 400; i++) if (S.height(S.anywhere(rng, 1)) < 0) wet++;
    expect(wet).toBeGreaterThan(20);
    expect(wet).toBeLessThan(250);
    // (and a cap about the valley's size for the largest numbers it starts with)
    expect(S.homeArc * R).toBeGreaterThan(60);
    expect(S.homeArc).toBeLessThan(Math.PI / 2);
  });
});

describe('a planet with life on it', () => {
  const run = (days: number) => {
    const w = createPlanet(SPEC);
    starterCast('standard').forEach(([kind, n], i) => release(w, genomeOfMorphotype((w.seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
    for (let i = 0; i < (days * DAY_LENGTH) / STEP; i++) stepWorld(w);
    return w;
  };

  it('lives: two days on, its animals are on the sphere, facing along it, and breeding', () => {
    const w = run(2);
    const live = w.creatures.filter((c) => c.alive);
    expect(live.length).toBeGreaterThan(40);
    expect(w.tally.births).toBeGreaterThan(0);
    for (const c of live) {
      expect(Math.abs(Math.hypot(c.x, c.y, c.z) - R)).toBeLessThan(1e-6);
      const f = [c.fx!, c.fy!, c.fz!];
      expect(Math.abs(Math.hypot(f[0], f[1], f[2]) - 1)).toBeLessThan(1e-6);
      expect(Math.abs((c.x * f[0] + c.y * f[1] + c.z * f[2]) / R)).toBeLessThan(1e-6);
      expect(Number.isFinite(c.ground!)).toBe(true);
    }
    // (they are where they can be: a walker on dry ground, give or take a wade)
    const walkersInDeep = live.filter((c) => c.traits.habitat === 'land' && c.alt <= 0.45 && w.surface.height(c) < -1.5).length;
    expect(walkersInDeep).toBe(0);
    // (and they have begun to spread from where they were set down)
    const S2 = w.surface as PlanetSurface;
    const out = Math.max(...live.map((c) => arc(S2.home, [c.x, c.y, c.z])));
    expect(out).toBeGreaterThan(0);
  });

  it('is the same planet for the same seed, step for step', () => {
    expect(worldHash(run(0.5))).toBe(worldHash(run(0.5)));
  });
});
