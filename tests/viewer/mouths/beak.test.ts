import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { defaultGenome } from '../../../src/engine/genome';
import type { Vec3 } from '../../../src/engine/genome';
import { randomGenome } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt } from '../../../src/viewer/bodyField';
import { buildBeak, type BeakBuild } from '../../../src/viewer/mouths/beak';

// On-surface tolerance for the socket ring + seat (ray-trace is 1e-4; Newton fallback looser).
const ON_SURFACE = 6e-3;

/** Force the first mouth node into the beak band (the builder reads style off the node). */
function forceBeak(p: Phenotype, style = 0.3): number {
  const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
  if (idx >= 0) {
    const n = p.nodes[idx];
    n.part = { kind: n.part?.kind ?? 'maw', style };
  }
  return idx;
}

function beakOn(p: Phenotype, style = 0.3, recessed = false): BeakBuild | null {
  const idx = forceBeak(p, style);
  return idx < 0 ? null : buildBeak(p, idx, [], recessed);
}

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm3 = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

const GEOS = ['collar', 'upper', 'lower', 'interior'] as const;

describe('beak mouth (mouth overhaul)', () => {
  it('returns null when the node is not a mouth', () => {
    const p = grow(defaultGenome());
    expect(p.nodes[0].terminal).not.toBe('mouth');
    expect(buildBeak(p, 0, [], false)).toBeNull();
  });

  it('is deterministic: identical builds produce identical geometry and paths', () => {
    let checked = 0;
    for (const p of [grow(defaultGenome()), grow(randomGenome(5))]) {
      const idx = forceBeak(p);
      if (idx < 0) continue;
      const a = buildBeak(p, idx, [], false)!;
      const b = buildBeak(p, idx, [], false)!;
      for (const key of GEOS) {
        expect(Array.from(a[key].getAttribute('position').array)).toEqual(Array.from(b[key].getAttribute('position').array));
      }
      expect(a.upperPath).toEqual(b.upperPath);
      expect(a.lowerPath).toEqual(b.lowerPath);
      expect(a.hook).toBe(b.hook);
      expect(a.ring).toEqual(b.ring);
      checked++;
    }
    expect(checked).toBeGreaterThan(0); // the default genome always has a face mouth
  });

  it('every geometry attribute value is finite', () => {
    let checked = 0;
    for (const p of [grow(defaultGenome()), grow(randomGenome(3)), grow(randomGenome(9))]) {
      const built = beakOn(p);
      if (!built) continue;
      for (const key of GEOS) {
        const pos = built[key].getAttribute('position');
        for (let i = 0; i < pos.count * 3; i++) {
          expect(Number.isFinite((pos.array as Float32Array)[i])).toBe(true);
        }
        expect(built[key].getIndex()!.count % 3).toBe(0);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(1);
  });

  it('the cere ring and the interior seat sit on the true skin', () => {
    let checked = 0;
    for (let s = 0; s < 10; s++) {
      const p = grow(randomGenome(s));
      const built = beakOn(p);
      if (!built) continue;
      const o = built.spec.node.pos;
      const f = buildFieldPrims(p, 'body');
      for (const sm of built.ring) {
        expect(Math.abs(fieldAt(f, sm.p[0] + o[0], sm.p[1] + o[1], sm.p[2] + o[2]))).toBeLessThan(ON_SURFACE);
      }
      expect(Math.abs(fieldAt(f, built.seat.p[0] + o[0], built.seat.p[1] + o[1], built.seat.p[2] + o[2]))).toBeLessThan(ON_SURFACE);
      checked++;
    }
    expect(checked).toBeGreaterThan(4); // the bauplan guarantees faces — most creatures have mouths
  });

  it('is exactly bilaterally symmetric on the default genome', () => {
    const p = grow(defaultGenome());
    const built = beakOn(p);
    expect(built).not.toBeNull();
    if (!built) return;
    expect(Math.abs(built.spec.node.pos[0])).toBeLessThan(1e-6); // the face mouth sits on X=0
    // ring samples mirror pairwise: t ↦ 1 − t (mod the turn) is the X-mirror, i.e. i ↦ 3n/2 − i
    const n = built.ring.length;
    for (let i = 0; i < n; i++) {
      const a = built.ring[i];
      const b = built.ring[((3 * n) / 2 - i) % n];
      expect(a.p[0]).toBeCloseTo(-b.p[0], 4);
      expect(a.p[1]).toBeCloseTo(b.p[1], 4);
      expect(a.p[2]).toBeCloseTo(b.p[2], 4);
    }
    // both loft spines live ON the midline plane — no asymmetric jitter in X, by construction
    for (const path of [built.upperPath, built.lowerPath]) {
      for (const q of path) expect(q[0]).toBeCloseTo(0, 4);
    }
    // and the blade cross-sections straddle it: X extents mirror
    for (const key of ['upper', 'lower'] as const) {
      const pos = built[key].getAttribute('position');
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      expect(minX + maxX).toBeCloseTo(0, 3);
    }
  });

  it('the upper mandible stays under 1.5r forward with an accelerating 0.25r–0.45r hook', () => {
    let checked = 0;
    for (const p of [grow(defaultGenome()), grow(randomGenome(2)), grow(randomGenome(7))]) {
      const built = beakOn(p);
      if (!built) continue;
      const { r, seat, spec } = built;
      const pos = built.upper.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const v: Vec3 = [pos.getX(i) - seat.p[0], pos.getY(i) - seat.p[1], pos.getZ(i) - seat.p[2]];
        expect(dot3(v, spec.aim)).toBeLessThan(1.5 * r);
      }
      // the tip protrudes visibly, and the hook lands in the specified band
      const tip = built.upperPath[built.upperPath.length - 1];
      expect(dot3(sub3(tip, seat.p), spec.aim)).toBeGreaterThan(0.5 * r);
      expect(built.hook).toBeGreaterThanOrEqual(0.25 * r - 1e-9);
      expect(built.hook).toBeLessThanOrEqual(0.45 * r + 1e-9);
      // acceleration: half-way along the spine the drop is still well under half the full hook
      const dropAt = (k: number): number => -dot3(sub3(built.upperPath[k], built.upperPath[0]), spec.up);
      expect(dropAt(8)).toBeCloseTo(built.hook, 6);
      expect(dropAt(4)).toBeGreaterThan(0.05 * built.hook);
      expect(dropAt(4)).toBeLessThan(0.35 * built.hook);
      checked++;
    }
    expect(checked).toBeGreaterThan(1);
  });

  it('the lower mandible is a 0.75-scale counter-piece hanging open below the upper', () => {
    const p = grow(defaultGenome());
    const built = beakOn(p);
    expect(built).not.toBeNull();
    if (!built) return;
    expect(built.upperPath.length).toBe(9);
    expect(built.lowerPath.length).toBe(9);
    expect(built.lowerLen).toBeCloseTo(0.75 * built.upperLen, 9);
    const up = built.spec.up;
    // roots below the upper's, spine pitched down off the aim by the gape — the beak hangs open
    expect(dot3(sub3(built.lowerPath[0], built.upperPath[0]), up)).toBeLessThan(0);
    const dirL = norm3(sub3(built.lowerPath[8], built.lowerPath[0]));
    expect(dot3(dirL, up)).toBeLessThan(-0.01);
    // structure: a closed 20-sample collar ring, two capped 9×10 lofts, no teeth anywhere
    expect(built.ring.length).toBe(20);
    expect(built.collar.getAttribute('position').count).toBe(20 * 8);
    expect(built.upper.getAttribute('position').count).toBe(9 * 10 + 2);
    expect(built.lower.getAttribute('position').count).toBe(9 * 10 + 2);
  });

  it('style position inside the band changes length and hook — beaks evolve visibly', () => {
    const p = grow(defaultGenome());
    const lo = beakOn(p, 0.255);
    const hi = beakOn(p, 0.372);
    expect(lo).not.toBeNull();
    expect(hi).not.toBeNull();
    if (!lo || !hi) return;
    expect(hi.upperLen - lo.upperLen).toBeGreaterThan(0.2 * lo.r); // slenderness: longer up-band
    expect(hi.hook).toBeGreaterThan(lo.hook); // and more hooked
  });

  it('recessed sinks the interior wedge into the cavity; the capsule kit keeps it a hair proud', () => {
    const p = grow(defaultGenome());
    const idx = forceBeak(p);
    expect(idx).toBeGreaterThanOrEqual(0);
    const proud = buildBeak(p, idx, [], false)!;
    const rec = buildBeak(p, idx, [], true)!;
    const throat = (b: BeakBuild): Vec3 => {
      const a = b.interior.getAttribute('position'); // vertex 4 is the throat point
      return [a.getX(4), a.getY(4), a.getZ(4)];
    };
    const nrm = proud.seat.n;
    const r = proud.r;
    const dProud = dot3(sub3(throat(proud), proud.seat.p), nrm);
    const dRec = dot3(sub3(throat(rec), rec.seat.p), nrm);
    expect(dProud).toBeGreaterThan(0.005 * r); // never hidden inside the body
    expect(dProud).toBeLessThan(0.03 * r);
    expect(dRec).toBeLessThan(-0.3 * r); // sunk into the real carve
    expect(dRec).toBeGreaterThan(-0.9 * r);
  });
});
