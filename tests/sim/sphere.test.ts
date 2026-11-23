import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/engine/rng';
import {
  arc,
  cross,
  cubeToSphere,
  dot,
  FACE_COUNT,
  fibonacci,
  randomHeading,
  randomPlace,
  settle,
  slide,
  sphereToCube,
  step,
  toward,
  turn,
  type Vec3,
} from '../../src/sim/sphere';

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const near = (a: Vec3, b: Vec3, eps = 1e-9) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < eps;

describe('moving over a sphere', () => {
  it('keeps a walker on the sphere with its heading flat on the ground, near the poles and the seams too', () => {
    const rng = mulberry32(7);
    for (let k = 0; k < 200; k++) {
      // (a quarter of the walkers start within a few degrees of a pole)
      let p = k % 4 === 0 ? settle([0.02 * (rng() - 0.5), k % 8 === 0 ? 1 : -1, 0.02 * (rng() - 0.5)], [1, 0, 0]).p : randomPlace(rng);
      let f = randomHeading(p, rng);
      for (let i = 0; i < 50; i++) {
        f = turn(p, f, (rng() - 0.5) * 0.8);
        const s = step(p, f, rng() * 0.05);
        ({ p, f } = settle(s.p, s.f));
        expect(Number.isFinite(p[0] + p[1] + p[2] + f[0] + f[1] + f[2])).toBe(true);
        expect(Math.abs(len(p) - 1)).toBeLessThan(1e-12);
        expect(Math.abs(len(f) - 1)).toBeLessThan(1e-12);
        expect(Math.abs(dot(p, f))).toBeLessThan(1e-12);
      }
    }
  });

  it('goes straight round a great circle and comes home, facing the way it set out', () => {
    const rng = mulberry32(11);
    for (let k = 0; k < 20; k++) {
      const p0 = randomPlace(rng);
      const f0 = randomHeading(p0, rng);
      let p = p0, f = f0;
      // (in a thousand small steps, the way a creature walks: no drift worth the name)
      for (let i = 0; i < 1000; i++) ({ p, f } = step(p, f, (Math.PI * 2) / 1000));
      expect(near(p, p0, 1e-9)).toBe(true);
      expect(near(f, f0, 1e-9)).toBe(true);
    }
  });

  it('walks over a pole without its heading spinning', () => {
    // heading north from the equator, over the pole, and down the far side: still facing along the walk
    let p: Vec3 = [1, 0, 0], f: Vec3 = [0, 1, 0];
    for (let i = 0; i < 400; i++) {
      const next = step(p, f, Math.PI / 400);
      // the heading only ever turns with the ground: it stays in the plane of the walk, facing the way the
      // walker goes
      expect(Math.abs(next.f[2])).toBeLessThan(1e-12);
      expect(dot(f, [next.p[0] - p[0], next.p[1] - p[1], next.p[2] - p[2]])).toBeGreaterThan(0);
      ({ p, f } = next);
    }
    expect(near(p, [-1, 0, 0], 1e-9)).toBe(true);
    expect(near(f, [0, -1, 0], 1e-9)).toBe(true);
  });

  it('turns about the up, toward +X for a positive angle, as the valley does', () => {
    // (on top of the world: up +Y, facing +Z — a quarter turn faces +X)
    expect(near(turn([0, 1, 0], [0, 0, 1], Math.PI / 2), [1, 0, 0])).toBe(true);
    expect(near(cross([0, 1, 0], [0, 0, 1]), [1, 0, 0])).toBe(true);
  });

  it('heads toward a place and reaches it after the arc between them', () => {
    const rng = mulberry32(3);
    for (let k = 0; k < 200; k++) {
      const p = randomPlace(rng), q = randomPlace(rng);
      const got = step(p, toward(p, q), arc(p, q)).p;
      expect(near(got, q, 1e-9)).toBe(true);
    }
  });

  it('measures the arc between neighbours as exactly as between opposites', () => {
    const p: Vec3 = [0, 0, 1];
    const q = step(p, [1, 0, 0], 1e-7).p;
    expect(Math.abs(arc(p, q) - 1e-7)).toBeLessThan(1e-15);
    expect(Math.abs(arc(p, [0, 0, -1]) - Math.PI)).toBeLessThan(1e-15);
  });

  it('slides sideways carrying a heading unturned', () => {
    const rng = mulberry32(5);
    for (let k = 0; k < 100; k++) {
      const p = randomPlace(rng);
      const h = randomHeading(p, rng);
      const dir = turn(p, h, Math.PI / 2);
      const { p: q, v } = slide(p, dir, rng() * 2, h);
      // still on the sphere, the heading still flat on the ground there, and still at right angles to the
      // way it slid (it was carried, not turned)
      expect(Math.abs(len(q) - 1)).toBeLessThan(1e-12);
      expect(Math.abs(dot(v, q))).toBeLessThan(1e-12);
      const moved = toward(q, p); // back the way it came
      expect(Math.abs(dot(v, moved))).toBeLessThan(1e-9);
    }
  });

  it('spreads the Fibonacci lattice over the sphere', () => {
    let sum: Vec3 = [0, 0, 0];
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const p = fibonacci(i, n);
      expect(Math.abs(len(p) - 1)).toBeLessThan(1e-12);
      sum = [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]];
    }
    // (evenly spread, the places balance about the centre)
    expect(len(sum) / n).toBeLessThan(1e-3);
  });
});

describe('the cube-sphere', () => {
  it('maps every face out onto the sphere and back', () => {
    const rng = mulberry32(9);
    for (let face = 0; face < FACE_COUNT; face++) {
      for (let k = 0; k < 200; k++) {
        const s = 2 * rng() - 1, t = 2 * rng() - 1;
        const p = cubeToSphere(face, s, t);
        expect(Math.abs(len(p) - 1)).toBeLessThan(1e-12);
        const back = sphereToCube(p);
        expect(back.face).toBe(face);
        expect(Math.abs(back.s - s)).toBeLessThan(1e-9);
        expect(Math.abs(back.t - t)).toBeLessThan(1e-9);
      }
    }
  });

  it('covers the sphere: every place falls on a face, and maps back to itself', () => {
    const rng = mulberry32(13);
    for (let k = 0; k < 2000; k++) {
      const p = randomPlace(rng);
      const { face, s, t } = sphereToCube(p);
      expect(Math.abs(s)).toBeLessThanOrEqual(1 + 1e-12);
      expect(Math.abs(t)).toBeLessThanOrEqual(1 + 1e-12);
      expect(near(cubeToSphere(face, s, t), p, 1e-9)).toBe(true);
    }
  });

  it('meets itself at the corners: each face corner is a corner of the cube', () => {
    const k = 1 / Math.sqrt(3);
    for (let face = 0; face < FACE_COUNT; face++) {
      for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = cubeToSphere(face, s, t);
        for (const c of p) expect(Math.abs(Math.abs(c) - k)).toBeLessThan(1e-12);
      }
    }
  });

  it('winds every face counter-clockwise seen from outside', () => {
    for (let face = 0; face < FACE_COUNT; face++) {
      const a = cubeToSphere(face, 0, 0), b = cubeToSphere(face, 0.1, 0), c = cubeToSphere(face, 0, 0.1);
      const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
      expect(dot(n, a)).toBeGreaterThan(0);
    }
  });

  it('keeps its cells within √2 of one another in area', () => {
    // the areas of a 48 × 48 grid's cells on one face (each face is the same); the plain normalized cube's
    // would differ about 5.2 times, centre to corner
    const N = 48;
    let lo = Infinity, hi = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const s0 = -1 + (2 * i) / N, s1 = -1 + (2 * (i + 1)) / N, t0 = -1 + (2 * j) / N, t1 = -1 + (2 * (j + 1)) / N;
        const a = cubeToSphere(0, s0, t0), b = cubeToSphere(0, s1, t0), c = cubeToSphere(0, s1, t1), d = cubeToSphere(0, s0, t1);
        const tri = (x: Vec3, y: Vec3, z: Vec3) => len(cross([y[0] - x[0], y[1] - x[1], y[2] - x[2]], [z[0] - x[0], z[1] - x[1], z[2] - x[2]])) / 2;
        const area = tri(a, b, c) + tri(a, c, d);
        lo = Math.min(lo, area);
        hi = Math.max(hi, area);
      }
    }
    expect(hi / lo).toBeLessThan(Math.SQRT2 * 1.02);
    expect(hi / lo).toBeGreaterThan(1.3);
  });
});
