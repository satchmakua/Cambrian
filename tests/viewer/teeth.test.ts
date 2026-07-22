import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { defaultGenome } from '../../src/engine/genome';
import { randomGenome } from '../../src/engine/random';
import { buildFieldPrims, fieldAt } from '../../src/viewer/bodyField';
import { buildMouthLine, mouthSpecs } from '../../src/viewer/mouthLine';
import { fangGeometry, toothRow, toothRing, type ToothProfile } from '../../src/viewer/teeth';

const PROFILE: ToothProfile = {
  count: 7,
  len: (u) => 0.22 + 0.3 * u * u, // corner canines
  width: 0.3,
  curl: 0.25,
  jitterLen: 0.2,
  jitterRock: 0.15,
  sink: 0.3,
  margin: 0.15,
  salt: 3,
};

describe('teeth (mouth overhaul)', () => {
  it('roots stay within sink-depth of the true skin — floating teeth are impossible', () => {
    let rows = 0;
    for (let s = 0; s < 16; s++) {
      const p = grow(randomGenome(s));
      const spec = mouthSpecs(p)[0];
      if (!spec) continue;
      const line = buildMouthLine(p, spec);
      const f = buildFieldPrims(p, 'body');
      for (const tooth of toothRow(line.upper, PROFILE, spec.r, p.genomeRef.seed)) {
        // the root was pulled back from an on-surface point by sink·len, so its distance to the
        // skin can never exceed that pull-back (plus the on-surface tolerance)
        const d = Math.abs(fieldAt(f, tooth.pos[0], tooth.pos[1], tooth.pos[2]));
        expect(d).toBeLessThanOrEqual(tooth.len * PROFILE.sink + 6e-3);
        expect(Number.isFinite(tooth.quat[0] + tooth.quat[1] + tooth.quat[2] + tooth.quat[3])).toBe(true);
      }
      rows++;
    }
    expect(rows).toBeGreaterThan(6);
  });

  it('rows are bilaterally symmetric: twins mirror in X with identical lengths', () => {
    const p = grow(defaultGenome());
    const spec = mouthSpecs(p)[0]!;
    const line = buildMouthLine(p, spec);
    const teeth = toothRow(line.upper, PROFILE, spec.r, p.genomeRef.seed);
    expect(teeth.length).toBe(PROFILE.count);
    const n = teeth.length;
    for (let i = 0; i < n; i++) {
      const a = teeth[i];
      const b = teeth[n - 1 - i];
      expect(a.pos[0]).toBeCloseTo(-b.pos[0], 4);
      expect(a.pos[1]).toBeCloseTo(b.pos[1], 4);
      expect(a.pos[2]).toBeCloseTo(b.pos[2], 4);
      expect(a.len).toBeCloseTo(b.len, 6); // mirrored jitter — twins match
    }
  });

  it('an interlocked lower row sits at the gaps of the upper row', () => {
    const p = grow(defaultGenome());
    const spec = mouthSpecs(p)[0]!;
    const line = buildMouthLine(p, spec);
    const upper = toothRow(line.upper, PROFILE, spec.r, p.genomeRef.seed);
    const lower = toothRow(line.lower, PROFILE, spec.r, p.genomeRef.seed, true);
    expect(lower.length).toBe(PROFILE.count - 1); // midpoints — one fewer, never a collision
    // no lower tooth shares an X with an upper tooth (they interleave)
    for (const lo of lower) {
      const nearest = Math.min(...upper.map((up) => Math.abs(up.pos[0] - lo.pos[0])));
      expect(nearest).toBeGreaterThan(0.001);
    }
  });

  it('placement is deterministic', () => {
    const p = grow(randomGenome(11));
    const spec = mouthSpecs(p)[0];
    expect(spec).toBeDefined();
    if (!spec) return;
    const line = buildMouthLine(p, spec);
    const a = toothRow(line.upper, PROFILE, spec.r, p.genomeRef.seed);
    const b = toothRow(line.upper, PROFILE, spec.r, p.genomeRef.seed);
    expect(a).toEqual(b);
  });

  it('tooth rings place the requested count with finite frames', () => {
    const p = grow(defaultGenome());
    const spec = mouthSpecs(p)[0]!;
    const line = buildMouthLine(p, spec);
    const ring = toothRing(line.upper, 9, 0.3, spec.r, p.genomeRef.seed, 5, [0, 0, -1]);
    expect(ring.length).toBe(9);
    for (const t of ring) {
      expect(t.pos.every(Number.isFinite)).toBe(true);
      expect(t.len).toBeGreaterThan(0);
    }
  });

  it('EVEN-count ring teeth are bilaterally symmetric — length included (the M18 wrinkle)', () => {
    // Even counts land mirror-partner teeth on X=0-symmetric positions, so their SIZES must match
    // too — keying jitter on the raw index broke that. (Odd counts are placed rotationally and are
    // deliberately ragged — a lamprey rasp, not a machined gear — so they are not asserted here.)
    const n = 20;
    const ring = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return {
        t: -1 + (2 * i) / n,
        p: [Math.cos(a), Math.sin(a) * 0.6, 0] as [number, number, number],
        n: [0, 0, 1] as [number, number, number],
        tan: [-Math.sin(a), Math.cos(a), 0] as [number, number, number],
        away: [Math.cos(a), Math.sin(a), 0] as [number, number, number],
      };
    });
    for (const count of [6, 8, 12]) {
      const teeth = toothRing(ring, count, 0.2, 1, 77, 3, [0, 0, -1]);
      for (const t of teeth) {
        // every tooth has a partner at mirrored x with the same length (itself, if on the X=0 plane)
        const best = Math.min(...teeth.map((u) => Math.hypot(t.pos[0] + u.pos[0], t.pos[1] - u.pos[1]) + Math.abs(t.len - u.len)));
        expect(best).toBeLessThan(1e-6);
      }
    }
  });

  it('ring teeth spread evenly around a CLOSED ring — no bunching at the wrap segment', () => {
    // a perfect synthetic ring (closed convention: last sample does not repeat the first)
    const n = 20;
    const ring = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return {
        t: -1 + (2 * i) / n,
        p: [Math.cos(a), Math.sin(a), 0] as [number, number, number],
        n: [0, 0, 1] as [number, number, number],
        tan: [-Math.sin(a), Math.cos(a), 0] as [number, number, number],
        away: [Math.cos(a), Math.sin(a), 0] as [number, number, number],
      };
    });
    const teeth = toothRing(ring, 8, 0.2, 1, 42, 3, [0, 0, -1]);
    // neighboring angular gaps (including last→first) must be near-uniform
    const angles = teeth.map((t) => Math.atan2(t.pos[1], t.pos[0])).sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 0; i < angles.length; i++) {
      const nx = angles[(i + 1) % angles.length];
      gaps.push(i === angles.length - 1 ? nx + Math.PI * 2 - angles[i] : nx - angles[i]);
    }
    const maxGap = Math.max(...gaps);
    const minGap = Math.min(...gaps);
    expect(maxGap / minGap).toBeLessThan(1.35); // was ~2× before the ring-aware interpolation
  });

  it('the fang geometry is a finite, indexed, vertex-colored crown', () => {
    const g = fangGeometry();
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    expect(pos.count).toBeGreaterThan(20);
    expect(col.count).toBe(pos.count);
    expect(g.getIndex()!.count % 3).toBe(0);
    for (let i = 0; i < pos.count * 3; i++) {
      expect(Number.isFinite((pos.array as Float32Array)[i])).toBe(true);
    }
    // root at the origin plane, crown rising to +Y ≈ 1
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    expect(minY).toBeCloseTo(0, 3);
    expect(maxY).toBeGreaterThan(0.95);
  });
});
