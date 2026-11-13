import { describe, it, expect } from 'vitest';
import { mouthVariant } from '../../../src/viewer/partStyles';
import * as THREE from 'three';
import { grow, legBearer, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildFeatheredWing, buildSpreadFeatheredWing, wingCarriage } from '../../../src/viewer/wings';

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

const parentsOf = (p: Phenotype) => new Map(p.edges.map(([a, b]) => [b, a]));
const trunkOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0);
/** The head's links, cranium first: the spine nodes of the chain's last section. */
function headOf(p: Phenotype) {
  const spine = p.nodes.filter((n) => n.kind === 'spine');
  const last = Math.max(...spine.map((n) => n.segment ?? 0));
  return spine.filter((n) => n.segment === last);
}
const rx = (n: Phenotype['nodes'][number]) => n.radius * (n.scale?.[0] ?? 1);
const ry = (n: Phenotype['nodes'][number]) => n.radius * (n.scale?.[1] ?? 1);

/** Each leg on the creature's right as hip → foot. */
function rightLegs(p: Phenotype) {
  const parent = parentsOf(p);
  const out: Phenotype['nodes'][] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg' || n.pos[0] < 0) return;
    const chain = [n];
    let cur = i;
    while (parent.has(cur) && p.nodes[parent.get(cur)!].part?.kind === 'leg') {
      cur = parent.get(cur)!;
      chain.unshift(p.nodes[cur]);
    }
    out.push(chain);
  });
  return out;
}

/** The mean of |normal| along each axis: how much of its face a sheet shows from the side, from above, from in front. */
function facing(geo: THREE.BufferGeometry): [number, number, number] {
  const n = geo.getAttribute('normal');
  const s: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n.count; i++) {
    s[0] += Math.abs(n.getX(i));
    s[1] += Math.abs(n.getY(i));
    s[2] += Math.abs(n.getZ(i));
  }
  return [s[0] / n.count, s[1] / n.count, s[2] / n.count];
}

describe('chimera', () => {
  it('always reads as winged: a feathered one carries its wings raised and open, never folded over its hips', () => {
    // (a feathered chimera's wings were the folded leaf made for a bird — wrapped round a four-legged
    // body they were two boxy saddlebags strapped over the hind legs, and it read as wingless)
    let feathered = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = genomeOfMorphotype(seed, 'chimera');
      expect(g.body.appendages.some((a) => a.kind === 'wing'), `#${seed} wings`).toBe(true);
      const pairs = legBearer(g).appendages.filter((a) => a.kind === 'leg').length;
      expect(pairs, `#${seed} leg pairs`).toBe(2);
      const isFeathered = g.covering.type === 'feathers';
      if (isFeathered) feathered++;
      expect(wingCarriage(isFeathered, pairs), `#${seed} carriage`).toBe(isFeathered ? 'raised' : 'spread');
    }
    expect(feathered).toBeGreaterThanOrEqual(5);
    // a bird's stays folded along its flank; a membrane wing stands spread on any body
    expect(wingCarriage(true, 1)).toBe('folded');
    expect(wingCarriage(false, 1)).toBe('spread');
    expect(wingCarriage(false, 2)).toBe('spread');
  });

  it('a raised feathered wing climbs from the shoulder, stands out to its side, and shows its face in every view', () => {
    const a = new THREE.Color(0.6, 0.4, 0.2);
    const b = new THREE.Color(0.2, 0.5, 0.2);
    const S = 2;
    for (const side of [1, -1]) {
      // (the range of raise the viewer draws from)
      for (const raise of [0.62, 0.7, 0.76, 0.82]) {
        const geo = buildSpreadFeatheredWing(side, S, a, b, raise).surface;
        geo.computeBoundingBox();
        const box = geo.boundingBox!;
        const tag = `side ${side} raise ${raise}`;
        expect(box.max.y / S, `${tag} rise`).toBeGreaterThan(0.45);
        const out = side > 0 ? box.max.x : -box.min.x;
        const across = side > 0 ? -box.min.x : box.max.x;
        expect(out / S, `${tag} reach`).toBeGreaterThan(0.6);
        expect(across / S, `${tag} stays on its own side`).toBeLessThan(0.06);
        expect(box.min.z / S, `${tag} swept back`).toBeLessThan(-0.4);
        // a level sheet lifted by its span alone was a plank: a line from in front, a sliver from the side
        const [fx, fy, fz] = facing(geo);
        expect(fx, `${tag} from the side`).toBeGreaterThan(0.5);
        expect(fy, `${tag} from above`).toBeGreaterThan(0.45);
        expect(fz, `${tag} from in front`).toBeGreaterThan(0.25);
      }
      // the folded leaf it replaces on a four-legged body never leaves the flank…
      const folded = buildFeatheredWing(side, S, a, b).surface;
      folded.computeBoundingBox();
      expect(folded.boundingBox!.max.y / S).toBeLessThan(0.1);
      expect(Math.max(Math.abs(folded.boundingBox!.min.x), Math.abs(folded.boundingBox!.max.x)) / S).toBeLessThan(0.2);
      // …and the level flight wing (no raise) is the one it always was: flat, facing up
      const level = buildSpreadFeatheredWing(side, S, a, b).surface;
      level.computeBoundingBox();
      expect(level.boundingBox!.max.y / S).toBeLessThan(0.12);
      expect(facing(level)[1]).toBeGreaterThan(0.9);
    }
  });

  it('wears its frill round the back of its skull, not round its waist', () => {
    // (the ruff stood across the middle of the trunk like a tutu: a line across the back from above, a
    // sliver cutting the body in two from the side, a fan behind the whole animal from in front)
    let frilled = 0;
    for (const seed of SEEDS) {
      const g = genomeOfMorphotype(seed, 'chimera');
      expect(g.body.appendages.some((a) => a.kind === 'frill'), `#${seed} none on the trunk`).toBe(false);
      const p = grow(g);
      const parent = parentsOf(p);
      const head = headOf(p);
      p.nodes.forEach((n, i) => {
        if (n.part?.kind !== 'frill') return;
        frilled++;
        const carrier = p.nodes[parent.get(i)!];
        expect(carrier, `#${seed} on the cranium`).toBe(head[0]);
        // ahead of the whole trunk, up on the neck
        const t = trunkOf(p);
        expect(carrier.pos[2], `#${seed} ahead of the shoulders`).toBeGreaterThan(t[t.length - 1].pos[2] + t[t.length - 1].radius);
      });
    }
    expect(frilled).toBeGreaterThanOrEqual(8);
  });

  it('carries its horns on its cranium, set apart on the corners of the skull', () => {
    // (on a head of two links they rooted on the snout — a pair of horns on a stalk on the tip of the
    // nose — and near enough the midline to merge into one forked stub)
    let horned = 0;
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'chimera'));
      const parent = parentsOf(p);
      const head = headOf(p);
      p.nodes.forEach((n, i) => {
        if (n.part?.kind !== 'horn') return;
        const carrier = p.nodes[parent.get(i)!];
        if (carrier.kind !== 'spine') return; // (a horn's second link)
        horned++;
        expect(carrier, `#${seed} on the cranium`).toBe(head[0]);
        expect(Math.abs(n.pos[0] - carrier.pos[0]) / rx(carrier), `#${seed} off the midline`).toBeGreaterThan(0.25);
      });
    }
    expect(horned).toBeGreaterThanOrEqual(16);
  });

  it('has no fins stuck to its flanks', () => {
    // (a pectoral pair on a winged quadruped was a pale shard on the ribs under each wing, its rays a
    // row of needles out of the side; the sail on its back stays)
    let sails = 0;
    for (const seed of SEEDS) {
      const fins = genomeOfMorphotype(seed, 'chimera').body.appendages.filter((a) => a.kind === 'fin');
      expect(fins.filter((a) => a.pair).length, `#${seed} paired fins`).toBe(0);
      sails += fins.length;
    }
    expect(sails).toBeGreaterThanOrEqual(12);
  });

  it('stands on stout legs set under its body', () => {
    // (the legs splayed out like a lizard's — the feet up to 1.8 body half-widths out, an A-frame from
    // in front — and the shanks were thin sticks under a heavy trunk)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'chimera'));
      const t = trunkOf(p);
      const D = 2 * Math.max(...t.map(ry));
      const halfWidth = Math.max(...t.map(rx));
      const legs = rightLegs(p);
      expect(legs.length, `#${seed} legs`).toBe(2);
      for (const chain of legs) {
        const hip = chain[0];
        const foot = chain[chain.length - 1];
        expect((foot.pos[0] - hip.pos[0]) / (hip.pos[1] - foot.pos[1]), `#${seed} splay`).toBeLessThan(0.3);
        expect(foot.pos[0] / halfWidth, `#${seed} feet under the body`).toBeLessThan(1.25);
        expect((2 * chain[1].radius) / D, `#${seed} shank`).toBeGreaterThan(0.18);
      }
    }
  });
  it("its mouth is a jaw, fangs or a beak — never an insect's mandibles on its soft head", () => {
    // (the mandibles' blades hung from the corners of a dark box like two tusks: a muppet's mouth)
    for (let seed = 1; seed <= 24; seed++) {
      const g = genomeOfMorphotype(seed, 'chimera');
      let mouths = 0;
      for (let s: typeof g.body | undefined = g.body; s; s = s.child) {
        for (const a of s.appendages) {
          if (a.terminal !== 'mouth') continue;
          expect(['maw', 'fanged', 'beak'], `#${seed}`).toContain(mouthVariant(a.style));
          mouths++;
        }
      }
      expect(mouths, `#${seed}`).toBeGreaterThan(0);
    }
  });
});
