import { describe, it, expect } from 'vitest';
import type { BufferGeometry } from 'three';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { defaultGenome } from '../../../src/engine/genome';
import { randomGenome } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt, fieldAtCarved } from '../../../src/viewer/bodyField';
import { mouthCarves, mouthSpec } from '../../../src/viewer/mouthLine';
import { buildRing, type RingBuild } from '../../../src/viewer/mouths/ring';

// The overhaul's invariant: ring traces sit ON the true skin (ray tolerance 1e-4; the Newton
// fallback can be looser on soft saddles).
const ON_SURFACE = 6e-3;
const SUCKER = 0.55; // style inside the sucker band (0.5..0.625)
const LAMPREY = 0.7; // style inside the lamprey band (0.625..0.75)

/** Force the first mouth node into the ring band; returns its index (−1 if the body has none). */
function forceRing(p: Phenotype, style: number): number {
  const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
  if (idx >= 0) {
    const n = p.nodes[idx];
    n.part = { kind: n.part?.kind ?? 'maw', style };
  }
  return idx;
}

function geoms(b: RingBuild): BufferGeometry[] {
  return [b.lip, b.funnel, ...(b.rasp ? [b.rasp] : []), ...b.ridges];
}

function eachVert(g: BufferGeometry, fn: (x: number, y: number, z: number) => void): void {
  const a = g.getAttribute('position');
  for (let i = 0; i < a.count; i++) fn(a.getX(i), a.getY(i), a.getZ(i));
}

function positions(g: BufferGeometry): number[] {
  return Array.from(g.getAttribute('position').array as Float32Array);
}

describe('ring mouth (sucker · lamprey)', () => {
  it('is deterministic: identical builds produce identical geometry and transforms', () => {
    for (const style of [SUCKER, LAMPREY]) {
      const p = grow(defaultGenome());
      const idx = forceRing(p, style);
      const a = buildRing(p, idx, [], false)!;
      const b = buildRing(p, idx, [], false)!;
      expect(positions(a.lip)).toEqual(positions(b.lip));
      expect(positions(a.funnel)).toEqual(positions(b.funnel));
      expect(a.teeth).toEqual(b.teeth);
      expect(a.disc).toEqual(b.disc);
      if (a.rasp) expect(positions(a.rasp)).toEqual(positions(b.rasp!));
      a.ridges.forEach((g, i) => expect(positions(g)).toEqual(positions(b.ridges[i])));
    }
  });

  it('every attribute value and tooth frame is finite across random genomes', () => {
    let built = 0;
    for (let s = 0; s < 12; s++) {
      const p = grow(randomGenome(s));
      const idx = forceRing(p, s % 2 ? LAMPREY : SUCKER);
      if (idx < 0) continue;
      const carves = mouthCarves(p);
      for (const [cs, rec] of [
        [[], false],
        [carves, true],
      ] as const) {
        const b = buildRing(p, idx, cs, rec);
        expect(b).not.toBeNull();
        for (const g of geoms(b!)) {
          eachVert(g, (x, y, z) => expect(Number.isFinite(x + y + z)).toBe(true));
        }
        for (const t of b!.teeth) {
          expect(t.pos.every(Number.isFinite)).toBe(true);
          expect(t.quat.every(Number.isFinite)).toBe(true);
          expect(t.len).toBeGreaterThan(0);
        }
      }
      built++;
    }
    expect(built).toBeGreaterThan(6);
  });

  it('lip and funnel traces sit on the true skin', () => {
    for (const style of [SUCKER, LAMPREY]) {
      const p = grow(defaultGenome());
      const idx = forceRing(p, style);
      const spec = mouthSpec(p, idx)!;
      const b = buildRing(p, idx, [], false)!;
      const f = buildFieldPrims(p, 'body');
      const o = spec.node.pos;
      expect(b.lipSamples.length).toBe(20);
      expect(b.levels.length).toBe(4);
      for (const row of [b.lipSamples, ...b.levels]) {
        for (const sm of row) {
          expect(Math.abs(fieldAt(f, sm.p[0] + o[0], sm.p[1] + o[1], sm.p[2] + o[2]))).toBeLessThan(ON_SURFACE);
        }
      }
    }
  });

  it('on the capsule kit the funnel shell floats a hair proud — never buried, never afloat', () => {
    const p = grow(defaultGenome());
    const idx = forceRing(p, SUCKER);
    const spec = mouthSpec(p, idx)!;
    const b = buildRing(p, idx, [], false)!;
    const f = buildFieldPrims(p, 'body');
    const o = spec.node.pos;
    eachVert(b.funnel, (x, y, z) => {
      const d = fieldAt(f, x + o[0], y + o[1], z + o[2]);
      expect(d).toBeGreaterThan(-ON_SURFACE); // never inside the body (invisible)
      expect(d).toBeLessThan(0.03 * spec.r + ON_SURFACE); // never hovering off the face
    });
  });

  it('nothing protrudes past 0.5r off the skin; tooth roots stay rooted in the shell', () => {
    for (const style of [SUCKER, LAMPREY]) {
      const p = grow(defaultGenome());
      const idx = forceRing(p, style);
      const spec = mouthSpec(p, idx)!;
      const b = buildRing(p, idx, [], false)!;
      const f = buildFieldPrims(p, 'body');
      const o = spec.node.pos;
      for (const g of geoms(b)) {
        eachVert(g, (x, y, z) => expect(fieldAt(f, x + o[0], y + o[1], z + o[2])).toBeLessThan(0.5 * spec.r));
      }
      // toothRing pulls roots back 0.3·len along the emerge axis from an on-shell point
      for (const t of b.teeth) {
        const d = Math.abs(fieldAt(f, t.pos[0] + o[0], t.pos[1] + o[1], t.pos[2] + o[2]));
        expect(d).toBeLessThanOrEqual(t.len * 0.3 + 0.02 * spec.r + ON_SURFACE);
      }
      if (b.disc) {
        const d = fieldAt(f, b.disc.pos[0] + o[0], b.disc.pos[1] + o[1], b.disc.pos[2] + o[2]);
        expect(d).toBeLessThan(0.06 * spec.r + ON_SURFACE); // the suction disc rides the apex
      }
    }
  });

  it('recessed=true sinks the funnel into the carved cavity', () => {
    const p = grow(defaultGenome());
    const idx = forceRing(p, LAMPREY);
    const spec = mouthSpec(p, idx)!;
    const carves = mouthCarves(p);
    expect(carves.length).toBeGreaterThan(0);
    const b = buildRing(p, idx, carves, true)!;
    const f = buildFieldPrims(p, 'body');
    const o = spec.node.pos;
    // the funnel spans well down the throat along −aim
    let lo = Infinity;
    let hi = -Infinity;
    eachVert(b.funnel, (x, y, z) => {
      const d = (x + o[0]) * spec.aim[0] + (y + o[1]) * spec.aim[1] + (z + o[2]) * spec.aim[2];
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    });
    expect(hi - lo).toBeGreaterThan(0.5 * spec.r);
    // the throat apex (last loft vertex) is buried vs the PRISTINE skin, but open in the carve
    const attr = b.funnel.getAttribute('position');
    const ax = attr.getX(attr.count - 1) + o[0];
    const ay = attr.getY(attr.count - 1) + o[1];
    const az = attr.getZ(attr.count - 1) + o[2];
    expect(fieldAt(f, ax, ay, az)).toBeLessThan(-0.05 * spec.r);
    expect(fieldAtCarved(f, carves, ax, ay, az)).toBeGreaterThan(-0.02 * spec.r);
  });

  it('a midline ring mouth mirrors exactly across X=0 (M18)', () => {
    for (const style of [SUCKER, LAMPREY]) {
      const p = grow(defaultGenome());
      const idx = forceRing(p, style);
      const spec = mouthSpec(p, idx)!;
      expect(Math.abs(spec.node.pos[0])).toBeLessThan(1e-6); // the face mouth sits on X=0
      const b = buildRing(p, idx, [], false)!;
      // ring samples mirror under i ↦ (n/2 − i) mod n (the fan's angle map a → π − a)
      for (const row of [b.lipSamples, ...b.levels]) {
        const n = row.length;
        for (let i = 0; i < n; i++) {
          const m = (n / 2 - i + n) % n;
          expect(row[i].p[0]).toBeCloseTo(-row[m].p[0], 4);
          expect(row[i].p[1]).toBeCloseTo(row[m].p[1], 4);
          expect(row[i].p[2]).toBeCloseTo(row[m].p[2], 4);
        }
      }
      if (b.disc) expect(Math.abs(b.disc.pos[0])).toBeLessThan(1e-4); // the hole is centered
    }
  });

  it('sucker: keratin rasp + 6 pucker ridges + a center disc, and NO teeth', () => {
    const p = grow(defaultGenome());
    const idx = forceRing(p, SUCKER);
    const b = buildRing(p, idx, [], false)!;
    expect(b.variant).toBe('sucker');
    expect(b.teeth.length).toBe(0);
    expect(b.rasp).not.toBeNull();
    expect(b.ridges.length).toBe(6);
    expect(b.disc).not.toBeNull();
    expect(b.lip.getAttribute('position').count).toBe(200); // 20 ring samples × 10 radial, closed
    expect(b.funnel.getAttribute('position').count).toBe(81); // 4 rings × 20 + throat apex
  });

  it('lamprey: 28 ragged teeth in three shrinking rings, and no sucker accents', () => {
    const p = grow(defaultGenome());
    const idx = forceRing(p, LAMPREY);
    const b = buildRing(p, idx, [], false)!;
    expect(b.variant).toBe('lamprey');
    expect(b.teeth.length).toBe(13 + 9 + 6);
    expect(b.rasp).toBeNull();
    expect(b.ridges.length).toBe(0);
    expect(b.disc).toBeNull();
    // outer ring teeth run longer than the innermost ring (0.22r vs 0.14r profiles)
    const mean = (ts: { len: number }[]) => ts.reduce((s, t) => s + t.len, 0) / ts.length;
    expect(mean(b.teeth.slice(0, 13))).toBeGreaterThan(mean(b.teeth.slice(22)));
  });

  it('the style bands split at 0.625', () => {
    const p = grow(defaultGenome());
    expect(buildRing(p, forceRing(p, 0.6249), [], false)!.variant).toBe('sucker');
    expect(buildRing(p, forceRing(p, 0.625), [], false)!.variant).toBe('lamprey');
  });
});
