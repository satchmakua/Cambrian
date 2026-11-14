import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type BodyNode, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildMeshData, type MeshFeature } from '../../../src/viewer/meshData';
import { buildFin, finCutOf, finGirth, finKindOf, finScaleOf, type FinKind } from '../../../src/viewer/wings';
import { buildMouthLine, isUnderslung, mouthSpec, surfacePrims } from '../../../src/viewer/mouthLine';
import { rayToSurface } from '../../../src/viewer/bodyField';
import { gillMarks, gillRadiusOf } from '../../../src/viewer/gills';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const ry = (n: BodyNode) => n.radius * (n.scale?.[1] ?? 1);

/** A grown swimmer taken apart: trunk (tail end → shoulders), head (back → snout), fins by kind. */
function parts(id: 'fish' | 'shark', seed: number) {
  const p = grow(genomeOfMorphotype(seed, id));
  const spine = p.nodes.filter((n) => n.kind === 'spine');
  const trunk = spine.filter((n) => n.segment === 0);
  const head = spine.filter((n) => n.segment === 1);
  const z0 = trunk[0].pos[2];
  const z1 = trunk[trunk.length - 1].pos[2];
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  /** where along the trunk (0 its tail end … 1 its shoulders) a fin is rooted */
  const rootedAt = (f: MeshFeature) => {
    let c = parent.get(f.idx);
    while (c !== undefined && p.nodes[c].kind !== 'spine') c = parent.get(c);
    return (p.nodes[c!].pos[2] - z0) / (z1 - z0);
  };
  const fins = buildMeshData(p)
    .features.filter((f) => f.type === 'fin')
    .map((f) => {
      const aim = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...f.quat));
      return { f, kind: finKindOf(aim, f.kind) as FinKind, at: rootedAt(f) };
    });
  return { p, trunk, head, fins };
}
const terminal = (p: Phenotype, t: string) => p.nodes.filter((n) => n.terminal === t);

describe('fish and shark', () => {
  it("a shark's body narrows smoothly into its tail stock — no blunt butt with the fin pinned on by a rod", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'shark'));
      const parent = new Map<number, number>();
      for (const [a, b] of p.edges) parent.set(b, a);
      const rootIdx = p.nodes.findIndex((n, i) => n.part?.kind === 'tail' && p.nodes[parent.get(i)!]?.kind === 'spine');
      expect(rootIdx, `#${seed}`).toBeGreaterThanOrEqual(0);
      const rump = p.nodes[parent.get(rootIdx)!];
      // the tail leaves the rump at most of its girth (it was under half)
      expect(p.nodes[rootIdx].radius / rump.radius, `#${seed}`).toBeGreaterThan(0.65);
    }
  });
  it("the head runs on from the body: no pinch behind it, and a level snout that narrows to the mouth", () => {
    // (a shark's head began at half the depth of its shoulders — a neck, then a melon that drooped
    // into a beak: a dolphin's; a fish's snout hung, with the mouth under it: a seal's)
    for (const id of ['fish', 'shark'] as const) {
      for (const seed of SEEDS) {
        const { trunk, head } = parts(id, seed);
        const shoulders = ry(trunk[trunk.length - 1]);
        expect(head.length, `${id} #${seed}`).toBe(id === 'shark' ? 4 : 3);
        expect(ry(head[0]) / shoulders, `${id} #${seed}: the head starts near the shoulders' depth`).toBeGreaterThan(0.7);
        expect(ry(head[0]) / shoulders, `${id} #${seed}: …and not above it`).toBeLessThan(1.12);
        // narrowing link by link to a snout well under half the shoulders
        expect(ry(head[1])).toBeLessThan(ry(head[0]) * 0.8);
        expect(ry(head[2])).toBeLessThan(ry(head[1]) * 0.8);
        expect(ry(head[2]) / shoulders, `${id} #${seed}: a snout`).toBeLessThan(0.52);
        // level: the snout's tip stands no lower (or higher) than the back of the head by more than
        // a small share of the head's own depth
        const drop = head[2].pos[1] - head[0].pos[1];
        expect(Math.abs(drop), `${id} #${seed}: a level snout`).toBeLessThan(0.12 * ry(head[0]));
      }
    }
  });

  it('the body lies level in the water', () => {
    for (const id of ['fish', 'shark'] as const) {
      for (const seed of SEEDS) {
        const { trunk } = parts(id, seed);
        const a = trunk[0];
        const b = trunk[trunk.length - 1];
        expect(Math.abs(b.pos[1] - a.pos[1]) / (b.pos[2] - a.pos[2]), `${id} #${seed}`).toBeLessThan(0.1);
      }
    }
  });

  it("a fish's mouth is at the tip of its snout, small; a shark's is slung under it, wide", () => {
    for (const seed of SEEDS) {
      const fish = parts('fish', seed);
      const fm = terminal(fish.p, 'mouth')[0];
      const tip = fish.head[2];
      expect(fm.pos[2], `fish #${seed}: ahead of the snout's last link`).toBeGreaterThan(tip.pos[2]);
      expect(Math.abs(fm.pos[1] - tip.pos[1]), `fish #${seed}: on its axis`).toBeLessThan(0.25 * ry(tip));
      expect(fm.radius, `fish #${seed}: small`).toBeLessThan(ry(tip));
      const shark = parts('shark', seed);
      const sm = terminal(shark.p, 'mouth')[0];
      expect(sm.pos[1], `shark #${seed}: under the head`).toBeLessThan(shark.head[1].pos[1] - 0.5 * ry(shark.head[1]));
      expect(sm.pos[2], `shark #${seed}: set back from the tip`).toBeLessThan(shark.head[2].pos[2]);
    }
  });

  it("a shark's snout runs out to a point, its head broader than deep, its eye a small bead", () => {
    // (three links tapering no further than a gene allows ended in a cap a third of the head across: a
    // round melon of a snout, a big ringed eye under it and a grin — a toy beluga)
    for (const seed of SEEDS) {
      const { p, head } = parts('shark', seed);
      const tip = head[head.length - 1];
      expect(ry(tip) / ry(head[0]), `shark #${seed}: a point`).toBeLessThan(0.3);
      const rx = (n: BodyNode) => n.radius * (n.scale?.[0] ?? 1);
      expect(rx(head[0]) / ry(head[0]), `shark #${seed}: flattened`).toBeGreaterThan(1.05);
      for (const e of terminal(p, 'eye')) expect(e.radius / ry(head[0]), `shark #${seed}`).toBeLessThan(0.215);
    }
  });

  it('a fish has a big round eye on the side of its head', () => {
    for (const seed of SEEDS) {
      const { p, head } = parts('fish', seed);
      const eyes = terminal(p, 'eye');
      expect(eyes.length).toBe(2);
      for (const e of eyes) {
        // (it was a bead a tenth of the head's depth across)
        expect(e.radius / ry(head[0]), `fish #${seed}`).toBeGreaterThan(0.15);
        expect(Math.abs(e.pos[0]), `fish #${seed}: out on the side`).toBeGreaterThan(0.2);
      }
    }
  });

  it('pectoral fins root just behind the gills, on the front of the trunk', () => {
    // (they stood two-thirds of the way back, beside the belly fins: a seal's hind flippers)
    for (const id of ['fish', 'shark'] as const) {
      for (const seed of SEEDS) {
        const { fins } = parts(id, seed);
        const pectorals = fins.filter((x) => x.kind === 'pectoral');
        expect(pectorals.length, `${id} #${seed}`).toBe(2);
        for (const x of pectorals) expect(x.at, `${id} #${seed}`).toBeGreaterThan(0.7);
        for (const x of fins.filter((y) => y.kind === 'pelvic')) expect(x.at, `${id} #${seed}: belly fins behind them`).toBeLessThan(0.6);
      }
    }
  });

  it("a shark's first dorsal stands over the middle of its body, its second small near the tail; its tail is a shark's", () => {
    // (both dorsals stood in the rear half, near enough the same size)
    let seconds = 0;
    for (const seed of SEEDS) {
      const { fins } = parts('shark', seed);
      const dorsals = fins.filter((x) => x.kind === 'dorsal').sort((a, b) => b.at - a.at);
      expect(dorsals.length, `shark #${seed}`).toBeGreaterThanOrEqual(1);
      expect(dorsals[0].at, `shark #${seed}: the first dorsal`).toBeGreaterThan(0.5);
      expect(dorsals[0].at).toBeLessThan(0.85);
      if (dorsals[1]) {
        seconds++;
        expect(dorsals[1].at, `shark #${seed}: the second, by the tail`).toBeLessThan(0.25);
        expect(dorsals[1].f.radius, `shark #${seed}: and smaller`).toBeLessThan(dorsals[0].f.radius * 0.75);
        // …as DRAWN: a fin is sized by its trunk link, the gene's own size scaled to its share of the biggest
        // of its kind (by its link alone, the second stood 0.6–0.8 as tall as the first)
        const { p } = parts('shark', seed);
        const height = (x: (typeof dorsals)[number]) => {
          const aim = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...x.f.quat));
          const g = buildFin(x.kind, aim, finGirth(p, x.f.idx, x.kind, x.f.radius), finScaleOf(x.f.style), 'shark').membrane;
          g.computeBoundingBox();
          const h = g.boundingBox!.max.y;
          g.dispose();
          return h;
        };
        expect(height(dorsals[1]) / height(dorsals[0]), `shark #${seed}: drawn smaller`).toBeLessThan(0.55);
      }
      const tail = fins.find((x) => x.kind === 'caudal')!;
      expect(finCutOf(tail.f.style), `shark #${seed}: the long upper lobe`).toBe('shark');
      for (const x of fins) expect(finCutOf(x.f.style)).toBe('shark');
    }
    expect(seconds).toBeGreaterThan(6);
    // …and a bony fish wears a fish's fins: the sail, the round paddles, the deep fork
    for (const seed of SEEDS) for (const x of parts('fish', seed).fins) expect(finCutOf(x.f.style), `fish #${seed}`).toBe('fish');
  });

  it("its gill cover is the back of its head, a quarter of the way down it — not half way down the body", () => {
    // (a trunk part drawn on the trunk's deepest link, half way down the body: the 'head' was two-thirds
    // of the fish, with the pectorals beside it)
    let checked = 0;
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'fish'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const head = spine.filter((n) => n.segment === 1);
      const snout = Math.max(...head.map((n) => n.pos[2] + n.radius * (n.scale?.[2] ?? 1)));
      const tailEnd = Math.min(...p.nodes.filter((n) => n.part?.kind === 'tail').map((n) => n.pos[2]));
      const SL = snout - tailEnd;
      const gill = p.nodes.findIndex((n) => n.part?.kind === 'gill');
      if (gill < 0) continue; // (one in ten has none)
      checked++;
      const r = gillRadiusOf(p, gill, 'cover', Math.max(p.nodes[gill].radius, 0.06));
      const [line] = gillMarks(p, gill, 'hybrid', 'cover', r).lines;
      const rim = Math.min(...line.map((q) => q.z + p.nodes[gill].pos[2]));
      const at = (snout - rim) / SL;
      expect(at, `#${seed} rim`).toBeGreaterThan(0.18);
      expect(at, `#${seed} rim`).toBeLessThan(0.36);
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it('it narrows through its last quarter into a slim stalk before the tail fin — not a loaf with a fan on its butt', () => {
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'fish'));
      const body = p.nodes.filter((n) => n.kind === 'spine' || n.part?.kind === 'tail');
      const depth = (z: number) =>
        Math.max(0, ...body.map((n) => {
          const rz = n.radius * (n.scale?.[2] ?? 1);
          const u = (z - n.pos[2]) / rz;
          return Math.abs(u) < 1 ? 2 * ry(n) * Math.sqrt(1 - u * u) : 0;
        }));
      const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1);
      const snout = Math.max(...head.map((n) => n.pos[2] + n.radius * (n.scale?.[2] ?? 1)));
      const fr = Math.min(...p.nodes.filter((n) => n.part?.kind === 'tail').map((n) => n.pos[2]));
      const SL = snout - fr;
      let peak = 0;
      for (let i = 0; i <= 100; i++) peak = Math.max(peak, depth(fr + (i / 100) * SL));
      let rear = 0;
      for (let i = 0; i <= 25; i++) rear += depth(fr + (i / 100) * SL);
      expect(rear / 26 / peak, `#${seed} rear quarter`).toBeLessThan(0.46);
      expect(depth(fr + 0.05 * SL) / peak, `#${seed} stalk`).toBeLessThan(0.23);
    }
  });

  it("a shark's head narrows from its trunk to its snout's point — no melon, no bottle-nose — over a crescent of a mouth", () => {
    // (its head's back stood out past its trunk as two cheeks, a beluga's melon from above-front; its snout
    // tip swelled a third past its own girth by the blend, a dolphin's nose; its underslung mouth was a short
    // chord across the flat of its chin, from the side no mouth at all)
    for (const seed of SEEDS) {
      const { p, trunk, head } = parts('shark', seed);
      const f = surfacePrims(p, 'hybrid');
      const front = trunk[trunk.length - 1];
      const halfAt = (z: number) => rayToSurface(f, [], [0, front.pos[1], z], [1, 0, 0])?.p[0] ?? 0;
      const w0 = halfAt(front.pos[2]);
      for (let k = 1; k <= 12; k++) {
        const z = front.pos[2] + ((head[1].pos[2] - front.pos[2]) * k) / 12;
        expect(halfAt(z), `shark #${seed} no melon`).toBeLessThanOrEqual(1.06 * w0);
      }
      const tip = head[head.length - 1];
      const top = rayToSurface(f, [], [tip.pos[0], tip.pos[1], tip.pos[2]], [0, 1, 0])!;
      expect((top.p[1] - tip.pos[1]) / ry(tip), `shark #${seed} no bottle-nose`).toBeLessThan(1.22);
      // the mouth: a crescent reaching onto the jaw
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, idx)!;
      expect(isUnderslung(p, spec), `shark #${seed} underslung`).toBe(true);
      const line = buildMouthLine(p, spec, [], 17, 'hybrid');
      const c = line.upper[line.upper.length - 1];
      const W = rayToSurface(f, [], [0, c.p[1], c.p[2]], [1, 0, 0])?.p[0] ?? 1;
      expect(Math.abs(c.p[0]) / W, `shark #${seed} corner out on the jaw`).toBeGreaterThan(0.58);
    }
  });
});
