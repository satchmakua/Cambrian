// The fourteenth look's songbird (seed 37): a paper-thin cream bill with a black spike behind it, a head on a
// column as wide as itself, a folded wing hung mid-flank. Each block fails on HEAD (ff7069e) and passes with
// diag14/bird/bird.patch.
import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import type { Vec3 } from '../../src/engine/genome';
import { buildBeak } from '../../src/viewer/mouths/beak';
import { surfacePrims } from '../../src/viewer/mouthLine';
import { fieldAt } from '../../src/viewer/bodyField';
import * as wings from '../../src/viewer/wings';
import { coatMain, coatPattern } from '../../src/viewer/palette';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 37];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mouthOf = (p: Phenotype) => p.nodes.findIndex((n) => n.terminal === 'mouth');
const trunkOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0);

describe("a songbird's bill", () => {
  it("is a cone, near as wide as it is deep — not a blade on edge, a cream card from three-quarters", () => {
    // (pressed to 0.3-0.5 of its depth side to side, it read from in front as a sliver and from the face
    // camera as a flat triangle stuck on the side of the head)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'bird'));
      const b = buildBeak(p, mouthOf(p), [], false, 'hybrid')!;
      const pos = b.upper.getAttribute('position');
      const root = b.upperPath[0];
      let w0 = Infinity, w1 = -Infinity, d0 = Infinity, d1 = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const v: Vec3 = [pos.getX(i) - root[0], pos.getY(i) - root[1], pos.getZ(i) - root[2]];
        const along = dot3(v, b.dir);
        if (along < 0.35 * b.upperLen || along > 0.6 * b.upperLen) continue;
        const side = dot3(v, b.spec.right), up = dot3(v, b.up);
        w0 = Math.min(w0, side); w1 = Math.max(w1, side);
        d0 = Math.min(d0, up); d1 = Math.max(d1, up);
      }
      expect((w1 - w0) / (d1 - d0), `#${seed} width against depth`).toBeGreaterThan(0.7);
    }
  });

  it('is shut: no dark gape wedge stands out of the face beside it', () => {
    // (the wedge was laid flat on the face below the bill's lifted root, a hair proud: its corners stood
    // up to 0.13 of the mouth's size out of the cheek, a thin black spike behind the bill)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'bird'));
      const idx = mouthOf(p);
      const b = buildBeak(p, idx, [], false, 'hybrid')!;
      const o = p.nodes[idx].pos;
      const prims = surfacePrims(p, 'hybrid');
      const a = b.interior.getAttribute('position');
      for (let k = 0; k < a.count; k++) {
        expect(fieldAt(prims, a.getX(k) + o[0], a.getY(k) + o[1], a.getZ(k) + o[2]) / b.r, `#${seed} wedge vertex ${k}`).toBeLessThan(0);
      }
    }
  });
});

describe("a songbird's head", () => {
  it('sits down on its shoulders: not stood a head and more above its back on a column as wide as itself', () => {
    // (two neck links at 1.25 their girth each stood the head's centre 1.0-3.0 of its radius above the back,
    // 1.6 on average: from in front and three-quarters, head and neck one tall bald thumb)
    let sum = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'bird'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const skull = spine.filter((n) => n.segment === last)[0];
      const back = Math.max(...trunkOf(p).map((n) => n.pos[1] + n.radius * (n.scale?.[1] ?? 1)));
      sum += (skull.pos[1] - back) / skull.radius;
    }
    expect(sum / 16).toBeLessThan(1.45);
  });
});

describe("a songbird's folded wing", () => {
  it('rides high on the flank, its leading edge along the edge of the back — not a shield hung mid-flank', () => {
    // (rooted a quarter of the way up the side, the leaf's top edge ran at 0.3 of the trunk's half-height
    // above its axis and its lower edge at 0.7 below: a pad on the middle of the flank, a bare back above it)
    const seat = (wings as Record<string, unknown>).SHORT_WING_SEAT as { out: number; up: number; fwd: number } | undefined;
    expect(seat, 'SHORT_WING_SEAT').toBeDefined();
    let top = 0, n = 0;
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'bird'));
      const tipIdx = p.nodes.findIndex((nd) => nd.terminal && nd.part?.kind === 'wing' && nd.pos[0] > 0);
      const trunk = trunkOf(p);
      const { trunkLen, girth, gene } = wings.wingOpenSpan(p, p.nodes[tipIdx].radius);
      const foldS = (trunkLen * 1.05 + girth * 0.9) * (0.85 + gene * 0.3);
      let root = tipIdx;
      const parent = new Map<number, number>();
      for (const [a, b] of p.edges) parent.set(b, a);
      while (parent.has(root) && p.nodes[parent.get(root)!].part?.kind === 'wing') root = parent.get(root)!;
      const shoulderZ = p.nodes[root].pos[2];
      let near = trunk[0];
      for (const t of trunk) if (Math.abs(t.pos[2] - shoulderZ) < Math.abs(near.pos[2] - shoulderZ)) near = t;
      const rx = near.radius * (near.scale?.[0] ?? 1);
      const ry = near.radius * (near.scale?.[1] ?? 1);
      // (the anchor CreatureMesh's Wing gives a songbird's folded wing)
      const anchor = [near.pos[0] + rx * seat!.out, near.pos[1] + near.radius * seat!.up, near.pos[2] + near.radius * seat!.fwd];
      const lie = wings.shortWingLie(p, 1, anchor, foldS)!;
      const w = wings.buildFeatheredWing(1, lie.S, coatMain(p.genomeRef.palette), coatPattern(p.genomeRef.palette), lie.axis);
      const prims = surfacePrims(p, 'hybrid');
      wings.conformToSurface(w.surface, (x, y, z) => fieldAt(prims, x, y, z), anchor, girth * 0.04, w.lift);
      const pos = w.surface.getAttribute('position');
      // its leading edge (the sheet's first column) over the front half of the leaf
      let t = 0;
      for (let i = 0; i <= 36; i++) t += (pos.getY(i * 21) + anchor[1] - near.pos[1]) / ry / 37;
      expect(t, `#${seed} leading edge`).toBeGreaterThan(0.36);
      top += t;
      n++;
    }
    expect(top / n).toBeGreaterThan(0.42);
  });
});
