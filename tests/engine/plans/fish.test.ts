import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type BodyNode, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildMeshData, type MeshFeature } from '../../../src/viewer/meshData';
import { finCutOf, finKindOf, type FinKind } from '../../../src/viewer/wings';

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
  it("the head runs on from the body: no pinch behind it, and a level snout that narrows to the mouth", () => {
    // (a shark's head began at half the depth of its shoulders — a neck, then a melon that drooped
    // into a beak: a dolphin's; a fish's snout hung, with the mouth under it: a seal's)
    for (const id of ['fish', 'shark'] as const) {
      for (const seed of SEEDS) {
        const { trunk, head } = parts(id, seed);
        const shoulders = ry(trunk[trunk.length - 1]);
        expect(head.length, `${id} #${seed}`).toBe(3);
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
      }
      const tail = fins.find((x) => x.kind === 'caudal')!;
      expect(finCutOf(tail.f.style), `shark #${seed}: the long upper lobe`).toBe('shark');
      for (const x of fins) expect(finCutOf(x.f.style)).toBe('shark');
    }
    expect(seconds).toBeGreaterThan(6);
    // …and a bony fish wears a fish's fins: the sail, the round paddles, the deep fork
    for (const seed of SEEDS) for (const x of parts('fish', seed).fins) expect(finCutOf(x.f.style), `fish #${seed}`).toBe('fish');
  });
});
