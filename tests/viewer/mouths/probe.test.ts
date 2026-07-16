import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { defaultGenome } from '../../../src/engine/genome';
import { randomGenome } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt } from '../../../src/viewer/bodyField';
import { mouthSpec } from '../../../src/viewer/mouthLine';
import { mouthVariant } from '../../../src/viewer/partStyles';
import { buildProbe, type ProbeBuild } from '../../../src/viewer/mouths/probe';

// styles inside each band — the builder reads node.part.style, so this reliably picks the variant
const PROBOSCIS_STYLE = 0.89;
const TRUNK_STYLE = 0.96;

/** Force the probe band onto a grown phenotype's first mouth node; −1 if it has no mouth. */
function forceMouth(p: Phenotype, style: number): number {
  const i = p.nodes.findIndex((n) => n.terminal === 'mouth');
  if (i < 0) return -1;
  const n = p.nodes[i];
  n.part = { kind: n.part?.kind ?? 'maw', style };
  return i;
}

function positions(b: ProbeBuild, key: 'collar' | 'tube'): number[] {
  return Array.from(b[key].getAttribute('position').array as ArrayLike<number>);
}

const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('probe mouths (proboscis + trunk)', () => {
  it('the build is deterministic — identical geometry, path, and accents', () => {
    const p = grow(randomGenome(3));
    const idx = forceMouth(p, TRUNK_STYLE);
    expect(idx).toBeGreaterThanOrEqual(0);
    const a = buildProbe(p, idx, [], false)!;
    const b = buildProbe(p, idx, [], false)!;
    expect(positions(a, 'tube')).toEqual(positions(b, 'tube'));
    expect(positions(a, 'collar')).toEqual(positions(b, 'collar'));
    expect(a.path).toEqual(b.path);
    expect(a.ring).toEqual(b.ring);
    expect(a.tipFace).toEqual(b.tipFace);
    expect(a.nostrils).toEqual(b.nostrils);
  });

  it('every geometry value is finite for both variants across random genomes', () => {
    let checked = 0;
    for (let s = 0; s < 12; s++) {
      for (const style of [PROBOSCIS_STYLE, TRUNK_STYLE]) {
        const p = grow(randomGenome(s));
        const idx = forceMouth(p, style);
        if (idx < 0) continue;
        const b = buildProbe(p, idx, [], false);
        expect(b).not.toBeNull();
        expect([...positions(b!, 'collar'), ...positions(b!, 'tube')].every(Number.isFinite)).toBe(true);
        for (const pt of b!.path) expect(pt.every(Number.isFinite)).toBe(true);
        if (b!.tipCap) expect(b!.tipCap.pos.every(Number.isFinite)).toBe(true);
        for (const n of b!.nostrils) {
          expect(n.pos.every(Number.isFinite)).toBe(true);
          expect(n.quat.every(Number.isFinite)).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(8); // the bauplan guarantees faces — most creatures have mouths
  });

  it('the collar ring sits on the true body surface', () => {
    let rings = 0;
    for (let s = 0; s < 10; s++) {
      const p = grow(randomGenome(s));
      const idx = forceMouth(p, s % 2 ? TRUNK_STYLE : PROBOSCIS_STYLE);
      if (idx < 0) continue;
      const b = buildProbe(p, idx, [], false)!;
      const f = buildFieldPrims(p, 'body');
      const o = p.nodes[idx].pos; // ring samples are node-relative — add the origin back
      for (const sm of b.ring) {
        expect(Math.abs(fieldAt(f, sm.p[0] + o[0], sm.p[1] + o[1], sm.p[2] + o[2]))).toBeLessThan(6e-3);
      }
      rings++;
    }
    expect(rings).toBeGreaterThan(4);
  });

  it('a midline mouth builds mirror-true across X=0 (M18)', () => {
    for (const style of [PROBOSCIS_STYLE, TRUNK_STYLE]) {
      const p = grow(defaultGenome());
      const idx = forceMouth(p, style);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(Math.abs(p.nodes[idx].pos[0])).toBeLessThan(1e-6); // the face mouth sits on X=0
      const b = buildProbe(p, idx, [], false)!;
      // the centerline never leaves the X=0 plane — droop bends along up only, never right
      for (const pt of b.path) expect(Math.abs(pt[0])).toBeLessThan(1e-3);
      // ring samples mirror pairwise: t ↦ 1 − t under the X-mirror is index i ↦ (n/2 − i) mod n
      const n = b.ring.length;
      for (let i = 0; i < n; i++) {
        const m = b.ring[(n / 2 - i + n) % n];
        expect(b.ring[i].p[0]).toBeCloseTo(-m.p[0], 4);
        expect(b.ring[i].p[1]).toBeCloseTo(m.p[1], 4);
        expect(b.ring[i].p[2]).toBeCloseTo(m.p[2], 4);
      }
      // the swept tube's X extent mirrors too
      const xs = positions(b, 'tube').filter((_, j) => j % 3 === 0);
      expect(Math.max(...xs)).toBeCloseTo(-Math.min(...xs), 3);
      if (b.variant === 'trunk') {
        const [l, r] = b.nostrils;
        expect(l.pos[0]).toBeCloseTo(-r.pos[0], 4);
        expect(l.pos[1]).toBeCloseTo(r.pos[1], 4);
        expect(l.pos[2]).toBeCloseTo(r.pos[2], 4);
        expect(l.r).toBeCloseTo(r.r, 8); // twins match exactly
      }
    }
  });

  it('proboscis: a 10-point drooping tube, dark tip cap, no nostrils, protrusion under 2.2r', () => {
    const p = grow(defaultGenome());
    const idx = forceMouth(p, PROBOSCIS_STYLE);
    expect(mouthVariant(PROBOSCIS_STYLE)).toBe('proboscis');
    const spec = mouthSpec(p, idx)!;
    const b = buildProbe(p, idx, [], false)!;
    expect(b.variant).toBe('proboscis');
    expect(b.path.length).toBe(10);
    expect(b.tipCap).not.toBeNull();
    expect(b.tipFace).toBeNull();
    expect(b.nostrils.length).toBe(0);
    const base = b.path[0];
    const fwd = b.path.map((pt) => dot(sub(pt, base), spec.aim));
    expect(Math.max(...fwd)).toBeLessThanOrEqual(2.2 * b.r + 1e-9);
    expect(Math.max(...fwd)).toBeGreaterThan(1.5 * b.r); // it really protrudes
    // the tip always ends up below the root axis (net droop, whatever the seeded phase)
    const tip = b.path[b.path.length - 1];
    expect(dot(sub(base, tip), spec.up)).toBeGreaterThan(0.1 * b.r);
    // 10 path points × 10 radial + 2 cap centers; collar = 20 ring samples × 10 radial (closed)
    expect(b.tube.getAttribute('position').count).toBe(10 * 10 + 2);
    expect(b.collar.getAttribute('position').count).toBe(20 * 10);
  });

  it('trunk: a 12-point curling tube with a flat tip face + mirrored nostrils inside 2.5r', () => {
    const p = grow(defaultGenome());
    const idx = forceMouth(p, TRUNK_STYLE);
    expect(mouthVariant(TRUNK_STYLE)).toBe('trunk');
    const spec = mouthSpec(p, idx)!;
    const b = buildProbe(p, idx, [], false)!;
    expect(b.variant).toBe('trunk');
    expect(b.path.length).toBe(12);
    expect(b.tipCap).toBeNull();
    expect(b.tipFace).not.toBeNull();
    expect(b.nostrils.length).toBe(2);
    const base = b.path[0];
    const fwd = b.path.map((pt) => dot(sub(pt, base), spec.aim));
    expect(Math.max(...fwd)).toBeLessThanOrEqual(2.5 * b.r);
    expect(Math.max(...fwd)).toBeGreaterThan(0.9 * b.r);
    // accelerating droop: the tip hangs well below the root
    const tip = b.path[b.path.length - 1];
    expect(dot(sub(base, tip), spec.up)).toBeGreaterThan(0.8 * b.r);
    // prehensile: the last two segments curl back toward the body (forward coordinate falls)
    expect(fwd[11]).toBeLessThan(fwd[10]);
    expect(fwd[10]).toBeLessThan(fwd[9]);
    expect(b.tube.getAttribute('position').count).toBe(12 * 12 + 2);
  });

  it('recessed is accepted but changes nothing — probe mouths carve no cavity', () => {
    const p = grow(randomGenome(5));
    const idx = forceMouth(p, TRUNK_STYLE);
    expect(idx).toBeGreaterThanOrEqual(0);
    const a = buildProbe(p, idx, [], false)!;
    const b = buildProbe(p, idx, [], true)!;
    expect(a.path).toEqual(b.path);
    expect(positions(a, 'tube')).toEqual(positions(b, 'tube'));
    expect(positions(a, 'collar')).toEqual(positions(b, 'collar'));
  });

  it('returns null on a non-mouth node', () => {
    const p = grow(defaultGenome());
    const i = p.nodes.findIndex((n) => n.terminal !== 'mouth');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(buildProbe(p, i, [], false)).toBeNull();
  });
});
