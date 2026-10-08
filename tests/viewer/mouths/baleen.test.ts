import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { defaultGenome } from '../../../src/engine/genome';
import { randomGenome } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt, qRotateV } from '../../../src/viewer/bodyField';
import { mouthCarves } from '../../../src/viewer/mouthLine';
import { buildBaleen, type BaleenBuild } from '../../../src/viewer/mouths/baleen';
import type * as THREE from 'three';

// Same on-surface tolerance the mouth-line tests use (ray-trace 1e-4; Newton fallback looser).
const ON_SURFACE = 6e-3;

/** Grow a phenotype and force its first mouth into the baleen band (styles 0.75..0.85). */
function baleenPhenotype(seed?: number): { p: Phenotype; idx: number } | null {
  const p = seed === undefined ? grow(defaultGenome()) : grow(randomGenome(seed));
  const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
  if (idx < 0) return null;
  const node = p.nodes[idx];
  node.part = { kind: node.part?.kind ?? 'maw', style: 0.8 };
  return { p, idx };
}

function positionsOf(geo: THREE.BufferGeometry): Float32Array {
  return geo.getAttribute('position').array as Float32Array;
}

/** mean raw-body field value over a geometry's vertices (node-relative → world via `o`). */
function meanField(p: Phenotype, geo: THREE.BufferGeometry, o: readonly number[]): number {
  const f = buildFieldPrims(p, 'body');
  const pos = geo.getAttribute('position');
  let sum = 0;
  for (let i = 0; i < pos.count; i++) sum += fieldAt(f, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  return sum / pos.count;
}

describe('baleen mouth (mouth overhaul)', () => {
  it('returns null when the node is not a mouth', () => {
    const p = grow(defaultGenome());
    const idx = p.nodes.findIndex((n) => n.terminal !== 'mouth');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(buildBaleen(p, idx, [], false)).toBeNull();
  });

  it('is deterministic (same phenotype → identical geometry and plate frames)', () => {
    const g = baleenPhenotype();
    expect(g).not.toBeNull();
    if (!g) return;
    const a = buildBaleen(g.p, g.idx, [], false)!;
    const b = buildBaleen(g.p, g.idx, [], false)!;
    expect(a.plates).toEqual(b.plates);
    expect(a.upper).toEqual(b.upper);
    for (const key of ['upperLip', 'lowerLip', 'interior', 'plate'] as const) {
      expect(Array.from(positionsOf(a[key]))).toEqual(Array.from(positionsOf(b[key])));
    }
  });

  it('every geometry value and plate frame is finite across random genomes', () => {
    let checked = 0;
    for (let s = 0; s < 12; s++) {
      const g = baleenPhenotype(s);
      if (!g) continue;
      const built = buildBaleen(g.p, g.idx, mouthCarves(g.p), true);
      if (!built) continue;
      for (const key of ['upperLip', 'lowerLip', 'interior', 'plate'] as const) {
        const pos = positionsOf(built[key]);
        let ok = true;
        for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) ok = false;
        expect(ok).toBe(true);
      }
      for (const pl of built.plates) {
        expect(pl.pos.every(Number.isFinite)).toBe(true);
        expect(pl.quat.every(Number.isFinite)).toBe(true);
        expect(Number.isFinite(pl.len) && pl.len > 0).toBe(true);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(6); // the bauplan guarantees faces — most creatures have mouths
  });

  it('anchor rows sit on the true skin and plate roots stay within sink-depth of it', () => {
    let rows = 0;
    for (let s = 0; s < 12; s++) {
      const g = baleenPhenotype(s);
      if (!g) continue;
      const built = buildBaleen(g.p, g.idx, [], false);
      if (!built) continue;
      const f = buildFieldPrims(g.p, 'body');
      const o = g.p.nodes[g.idx].pos;
      for (const sm of [...built.upper, ...built.lower]) {
        expect(Math.abs(fieldAt(f, sm.p[0] + o[0], sm.p[1] + o[1], sm.p[2] + o[2]))).toBeLessThan(ON_SURFACE);
      }
      for (const pl of built.plates) {
        // the root was pulled back from an on-surface point by sink·len (0.15), never further
        const d = Math.abs(fieldAt(f, pl.pos[0] + o[0], pl.pos[1] + o[1], pl.pos[2] + o[2]));
        expect(d).toBeLessThanOrEqual(pl.len * 0.15 + ON_SURFACE);
      }
      rows++;
    }
    expect(rows).toBeGreaterThan(6);
  });

  it('the lip tubes are seated on the skin — vertices straddle the surface, never float clear', () => {
    const g = baleenPhenotype();
    expect(g).not.toBeNull();
    if (!g) return;
    const built = buildBaleen(g.p, g.idx, [], false)!;
    const f = buildFieldPrims(g.p, 'body');
    const o = g.p.nodes[g.idx].pos;
    for (const key of ['upperLip', 'lowerLip'] as const) {
      const pos = built[key].getAttribute('position');
      let inside = 0, outside = 0;
      for (let i = 0; i < pos.count; i++) {
        const d = fieldAt(f, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
        if (d < 0) inside++;
        else outside++;
      }
      expect(inside).toBeGreaterThan(0); // half-buried in the face…
      expect(outside).toBeGreaterThan(0); // …half proud — pressed onto the skin, not floating
    }
  });

  it('the curtain and lips mirror exactly across X=0 on the midline mouth (M18)', () => {
    const g = baleenPhenotype();
    expect(g).not.toBeNull();
    if (!g) return;
    expect(Math.abs(g.p.nodes[g.idx].pos[0])).toBeLessThan(1e-6); // the face mouth sits on X=0
    const built = buildBaleen(g.p, g.idx, [], false)!;
    const n = built.plates.length;
    for (let i = 0; i < n; i++) {
      const a = built.plates[i];
      const b = built.plates[n - 1 - i];
      expect(a.pos[0]).toBeCloseTo(-b.pos[0], 4); // mirrored in X
      expect(a.pos[1]).toBeCloseTo(b.pos[1], 4);
      expect(a.pos[2]).toBeCloseTo(b.pos[2], 4);
      expect(a.len).toBeCloseTo(b.len, 6); // |t|-keyed jitter — twins hang the same length
    }
    // the tubes and the sheet reach as far left as right
    for (const key of ['upperLip', 'lowerLip', 'interior'] as const) {
      const pos = built[key].getAttribute('position');
      let minX = Infinity, maxX = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      expect(maxX).toBeCloseTo(-minX, 3);
    }
  });

  it('hangs 13 plates from the upper curve, center longest, in the profile length band', () => {
    const g = baleenPhenotype();
    expect(g).not.toBeNull();
    if (!g) return;
    const built = buildBaleen(g.p, g.idx, [], false)!;
    expect(built.plates.length).toBe(13);
    const mid = built.plates[6]; // t = 0 — the front-center plate
    expect(mid.len).toBeGreaterThan(built.plates[0].len);
    expect(mid.len).toBeGreaterThan(built.plates[12].len);
    for (const pl of built.plates) {
      // (0.5 − 0.18·u)·r with u ≤ 0.88 and ±12% jitter → (0.30 .. 0.56)·r
      expect(pl.len).toBeGreaterThan(0.29 * built.r);
      expect(pl.len).toBeLessThan(0.58 * built.r);
    }
    // the shared plate box roots at y = 0 and hangs to +1 (scaled per plate at render time)
    const pos = built.plate.getAttribute('position');
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    expect(minY).toBeCloseTo(0, 6);
    expect(maxY).toBeCloseTo(1, 6);
  });

  it('keeps everything within the 0.4·r forward-protrusion budget off the skin', () => {
    let checked = 0;
    for (const s of [undefined, 1, 5, 9]) {
      const g = baleenPhenotype(s);
      if (!g) continue;
      const built = buildBaleen(g.p, g.idx, [], false);
      if (!built) continue;
      const f = buildFieldPrims(g.p, 'body');
      const o = g.p.nodes[g.idx].pos;
      const lim = 0.4 * built.r + ON_SURFACE;
      for (const key of ['upperLip', 'lowerLip', 'interior'] as const) {
        const pos = built[key].getAttribute('position');
        let worst = -Infinity;
        for (let i = 0; i < pos.count; i++) {
          worst = Math.max(worst, fieldAt(f, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]));
        }
        expect(worst).toBeLessThan(lim);
      }
      for (const pl of built.plates) {
        // plate tips hang across the opening — down the face, never proud of the protrusion cap
        const hang = qRotateV(pl.quat, [0, 1, 0]);
        const tip = [pl.pos[0] + hang[0] * pl.len + o[0], pl.pos[1] + hang[1] * pl.len + o[1], pl.pos[2] + hang[2] * pl.len + o[2]];
        expect(fieldAt(f, tip[0], tip[1], tip[2])).toBeLessThan(lim);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('recessed mode sinks the interior sheet; capsule mode keeps it a hair proud', () => {
    const g = baleenPhenotype();
    expect(g).not.toBeNull();
    if (!g) return;
    const o = g.p.nodes[g.idx].pos;
    const proud: BaleenBuild = buildBaleen(g.p, g.idx, [], false)!;
    const sunk: BaleenBuild = buildBaleen(g.p, g.idx, mouthCarves(g.p), true)!;
    const proudMean = meanField(g.p, proud.interior, o);
    const sunkMean = meanField(g.p, sunk.interior, o);
    expect(proudMean).toBeGreaterThan(-0.02 * proud.r); // at/above the raw skin (within a hair) — a visible dark backdrop
    expect(sunkMean).toBeLessThan(-0.1 * proud.r); // well inside the body, filling the real carve
    expect(sunkMean).toBeLessThan(proudMean - 0.15 * proud.r);
  });
});
