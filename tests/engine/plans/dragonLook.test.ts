import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { fieldAt, qRotateV } from '../../../src/viewer/bodyField';
import { buildJawed, type JawedVariant } from '../../../src/viewer/mouths/jawed';
import { mouthSpec, surfacePrims } from '../../../src/viewer/mouthLine';
import { buildFoldedMembraneWing, FOLD_BACK, MEMBRANE_SHADE, WING_BONE_SHADE } from '../../../src/viewer/wings';

type Node = Phenotype['nodes'][number];
const rx = (n: Node) => n.radius * (n.scale?.[0] ?? 1);
const ry = (n: Node) => n.radius * (n.scale?.[1] ?? 1);
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

describe('dragon look', () => {
  it('stands under a chest no wider than a big lizard’s: a deep keel, not a gourd over thin legs', () => {
    // (its trunk round in section and 1.6–2.1 times its head's width, the shoulder balls blended into it and
    // a knee under half the trunk's girth: from the front a gourd-shaped belly, the legs splayed under it)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'dragon'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const trunk = spine.filter((n) => (n.segment ?? 0) === 0);
      const head = spine.filter((n) => n.segment === last);
      const chest = Math.max(...trunk.map(rx));
      const deep = Math.max(...trunk.map(ry));
      const skull = Math.max(...head.map(rx));
      expect(chest / skull, `#${seed} chest against the head`).toBeLessThan(1.75);
      expect(deep / chest, `#${seed} deeper than wide`).toBeGreaterThan(1.05);
      // its knees: the second link of each leg rooted on the trunk
      const parent = new Map<number, number>();
      for (const [a, b] of p.edges) parent.set(b, a);
      const knees = p.nodes.filter((n, i) => {
        const a = parent.get(i);
        if (n.part?.kind !== 'leg' || a === undefined || p.nodes[a].part?.kind !== 'leg') return false;
        const r = parent.get(a);
        return r !== undefined && p.nodes[r].kind === 'spine';
      });
      expect(chest / Math.max(...knees.map((n) => n.radius)), `#${seed} legs under it`).toBeLessThan(2.15);
    }
  });

  it('carries a long reptile’s head: twice as long as it is wide, not a frog’s round one', () => {
    // (its muzzle tapering 0.62–0.71 a link from a skull 1.2–1.6 times wider than deep, the head was 1.5–1.75
    // times as long as wide: short and round, the snout blunt)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'dragon'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const head = spine.filter((n) => n.segment === last);
      const fwd = qRotateV(head[0].quat, [0, 0, 1]);
      const along = head.flatMap((n) => {
        const reach = n.radius * (n.scale?.[2] ?? 1);
        return [dot(n.pos, fwd) - reach, dot(n.pos, fwd) + reach];
      });
      const long = Math.max(...along) - Math.min(...along);
      const wide = 2 * Math.max(...head.map(rx));
      expect(long / wide, `#${seed}`).toBeGreaterThan(2);
      expect(rx(head[0]) / ry(head[0]), `#${seed} no frog's flat skull`).toBeLessThan(1.35);
    }
  });

  it('shows its fangs on the sides of its snout, none on the front of its face', () => {
    // (six fangs along the front third of the seam: the foremost pair stood on the front of the blunt snout over
    // its chin — from the front a row of stitches across the face, from the side two whiskers)
    let seen = 0;
    for (const seed of SEEDS.slice(0, 12)) {
      const p = grow(genomeOfMorphotype(seed, 'dragon'));
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, idx)!;
      const b = buildJawed(p, idx, [], false, spec.variant as JawedVariant, 'hybrid')!;
      const F = surfacePrims(p, 'hybrid');
      const fwd = qRotateV(spec.anchor.quat, [0, 0, 1]);
      const o = spec.node.pos;
      expect(b.upperTeeth.length, `#${seed}`).toBeGreaterThan(0);
      for (const t of b.upperTeeth) {
        const q = [t.pos[0] + o[0], t.pos[1] + o[1], t.pos[2] + o[2]];
        const h = 1e-3;
        const g = [0, 1, 2].map((k) => {
          const a = [...q], c = [...q];
          a[k] += h;
          c[k] -= h;
          return fieldAt(F, a[0], a[1], a[2]) - fieldAt(F, c[0], c[1], c[2]);
        });
        const n = g.map((x) => x / Math.hypot(g[0], g[1], g[2]));
        expect(dot(n, fwd), `#${seed} fang on the face`).toBeLessThan(0.5);
        seen++;
      }
    }
    expect(seen).toBeGreaterThanOrEqual(24);
  });

  it('folds its wings on a frame that shows: an arm and fingers darker than the web, reaching back to the hips', () => {
    // (forearm and fingers at 0.008 and 0.01 of the span, in 0.7 of the wing's colour against the web's 0.85, the
    // folded wing was a flat sheet with no bones in it; its first finger ended under half the span back from the
    // shoulder — a fan pinned mid-back, a dorsal fin)
    expect(WING_BONE_SHADE).toBeLessThan(0.65 * MEMBRANE_SHADE);
    const S = 4;
    const w = buildFoldedMembraneWing(1, S);
    const [, fore, ...fingers] = w.bones;
    expect(fore.r0).toBeGreaterThanOrEqual(0.0105 * S);
    for (const f of fingers.slice(0, 2)) expect(f.r0).toBeGreaterThanOrEqual(0.0095 * S);
    expect(FOLD_BACK).toBeGreaterThan(0.53);
    w.surface.computeBoundingBox();
    expect(-w.surface.boundingBox!.min.z).toBeCloseTo(FOLD_BACK * S, 2);
  });
});
