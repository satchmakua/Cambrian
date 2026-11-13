import { describe, it, expect } from 'vitest';
import { grow, type BodyNode, type Phenotype } from '../../../src/engine/grow';
import type { Genome } from '../../../src/engine/genome';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { GENE_BOUNDS } from '../../../src/engine/bounds';
import { eyeVariant } from '../../../src/viewer/partStyles';

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);

const ry = (n: BodyNode) => n.radius * (n.scale?.[1] ?? 1);
const rx = (n: BodyNode) => n.radius * (n.scale?.[0] ?? 1);

/** A grown weasel taken apart: trunk (rump → shoulders), neck, head, and the trunk's depth. */
function parts(seed: number) {
  const g = genomeOfMorphotype(seed, 'mustelid');
  const p = grow(g);
  const spine = p.nodes.filter((n) => n.kind === 'spine');
  const last = Math.max(...spine.map((n) => n.segment ?? 0));
  const trunk = spine.filter((n) => n.segment === 0);
  const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
  const head = spine.filter((n) => n.segment === last);
  const depth = 2 * Math.max(...trunk.map(ry));
  // the shoulders: the widest of the trunk's front third
  const shoulders = Math.max(...trunk.slice(-Math.ceil(trunk.length / 3)).map(rx));
  return { g, p, trunk, neck, head, depth, shoulders };
}

/** Each leg (hip → foot) as a list of nodes. */
function legs(p: Phenotype): BodyNode[][] {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const out: BodyNode[][] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg') return;
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

describe('mustelid', () => {
  it('arches its back: the hump stands mid-trunk, hips and shoulders level under it', () => {
    // (the spine was a ruled line from rump to chest — a salami on four posts; the mid-back stood
    // no more than 0.05 of the trunk's depth above the line from hips to shoulders)
    for (const seed of SEEDS) {
      const { trunk, depth } = parts(seed);
      const a = trunk[0];
      const b = trunk[trunk.length - 1];
      let hump = -Infinity;
      let at = 0;
      trunk.forEach((n, i) => {
        const u = (n.pos[2] - a.pos[2]) / (b.pos[2] - a.pos[2]);
        const rise = n.pos[1] - (a.pos[1] + (b.pos[1] - a.pos[1]) * u);
        if (rise > hump) {
          hump = rise;
          at = i;
        }
      });
      expect(hump / depth, `#${seed} hump`).toBeGreaterThan(0.15);
      expect(hump / depth, `#${seed} not a croquet hoop`).toBeLessThan(0.5);
      // the hump is in the middle of the back, not at either end
      expect(at, `#${seed} hump behind the shoulders`).toBeLessThan(trunk.length - 1);
      expect(at, `#${seed} hump ahead of the hips`).toBeGreaterThan(0);
      // hips and shoulders ride level (bent one way only, the chest hung up to half a depth below
      // the rump, or stood as far above it)
      expect(Math.abs(b.pos[1] - a.pos[1]) / depth, `#${seed} level ends`).toBeLessThan(0.2);
    }
  });

  it('is a long low body: three trunk depths or more from hip to shoulder, the belly near the ground', () => {
    for (const seed of SEEDS) {
      const { p, trunk, depth } = parts(seed);
      const length = trunk[trunk.length - 1].pos[2] - trunk[0].pos[2];
      expect(length / depth, `#${seed} long`).toBeGreaterThan(2.7);
      const floor = Math.min(...legs(p).map((c) => c[c.length - 1].pos[1] - c[c.length - 1].radius));
      const belly = Math.min(...trunk.map((n) => n.pos[1] - ry(n)));
      expect((belly - floor) / depth, `#${seed} low`).toBeLessThan(0.5);
      expect((belly - floor) / depth, `#${seed} off the floor`).toBeGreaterThan(0.15);
    }
  });

  it('is deeper at the chest than at the loin', () => {
    // (the trunk swelled in the middle and thinned to both ends: on most the loin was as deep as
    // the chest or deeper, up to 1.14 of it)
    for (const seed of SEEDS) {
      const { trunk } = parts(seed);
      const loin = Math.min(...trunk.slice(1, 4).map(ry));
      const chest = Math.max(...trunk.slice(-2).map(ry));
      expect(loin / chest, `#${seed}`).toBeLessThan(0.95);
    }
  });

  it('carries its head on a neck as thick as the head, up off the shoulders', () => {
    // (no neck at all: the skull sat on the front of the chest, level with the spine, the forelegs
    // under its chin)
    for (const seed of SEEDS) {
      const { trunk, neck, head, depth, shoulders } = parts(seed);
      expect(neck.length, `#${seed} neck links`).toBe(3);
      // a weasel's neck is as thick as its skull — never a stalk
      expect(Math.min(...neck.map((n) => n.radius)) / head[0].radius, `#${seed} neck vs head`).toBeGreaterThan(0.95);
      // …and narrower than the shoulders it leaves
      expect(Math.max(...neck.map(rx)) / shoulders, `#${seed} neck vs shoulders`).toBeLessThan(0.9);
      // the skull rides above the shoulders' axis (it was within 0.18 of a depth of it, above or below)
      const front = trunk[trunk.length - 1];
      expect((head[0].pos[1] - front.pos[1]) / depth, `#${seed} head up`).toBeGreaterThan(0.3);
      // the forelegs stand behind the neck: the skull is a trunk depth or more ahead of the shoulders
      expect((head[0].pos[2] - front.pos[2]) / depth, `#${seed} head ahead`).toBeGreaterThan(1.0);
    }
  });

  it('has a small flat wedge of a head, narrower than its shoulders', () => {
    for (const seed of SEEDS) {
      const { head, shoulders } = parts(seed);
      // a cranium and a muzzle of two links narrowing to the nose (on one blunt link, with a round
      // cranium and a pink button nose, the seventh look saw a hamster's face)
      expect(head.length, `#${seed}`).toBe(3);
      expect(head[2].radius / head[1].radius, `#${seed} narrows to the nose`).toBeLessThan(0.75);
      // (the skull was up to 1.13 of the shoulders' width: a hamster's block on the end of a tube)
      expect(rx(head[0]) / shoulders, `#${seed} narrower than the shoulders`).toBeLessThan(0.92);
      // flat: wider than it is tall
      expect(ry(head[0]) / rx(head[0]), `#${seed} flat`).toBeLessThan(0.82);
      // a wedge: the muzzle well under the skull's girth, the head longer than before (it was
      // 1.5–1.72 skull depths from occiput to nose)
      expect(head[1].radius / head[0].radius, `#${seed} muzzle`).toBeLessThan(0.7);
      const tip = head[head.length - 1];
      const len = tip.pos[2] + tip.radius * (tip.scale?.[2] ?? 1) - (head[0].pos[2] - head[0].radius * (head[0].scale?.[2] ?? 1));
      expect(len / (2 * ry(head[0])), `#${seed} head length`).toBeGreaterThan(1.68);
    }
  });

  it('always has small round ears, low on the sides of its skull', () => {
    // (half the litter had none; the rest wore them on the crown — at 0.84–0.96 of the skull's
    // height above its middle and under 0.6 of its half-width out: a bear cub's)
    for (const seed of SEEDS) {
      const { p, head } = parts(seed);
      const ears = p.nodes.filter((n) => n.terminal === 'ear');
      expect(ears.length, `#${seed} ears`).toBe(2);
      for (const e of ears) {
        expect(Math.abs(e.pos[0]) / rx(head[0]), `#${seed} out on the side`).toBeGreaterThan(0.72);
        expect((e.pos[1] - head[0].pos[1]) / ry(head[0]), `#${seed} low`).toBeLessThan(0.7);
        expect(e.pos[1], `#${seed} above the skull's middle`).toBeGreaterThan(head[0].pos[1]);
        expect(e.radius / head[0].radius, `#${seed} small`).toBeLessThan(0.3);
        expect(e.part!.style, `#${seed} round`).toBeGreaterThan(0.67);
      }
    }
  });

  it('has small dark eyes set close on the front of its face', () => {
    // (round eyes with a broad bright iris, up to 0.59 of the skull's half-width out to each side)
    for (const seed of SEEDS) {
      const { p, head } = parts(seed);
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      expect(eyes.length, `#${seed}`).toBe(2);
      for (const e of eyes) {
        expect(eyeVariant(e.part!.style), `#${seed}`).toBe('beady');
        expect(Math.abs(e.pos[0]) / rx(head[0]), `#${seed} close-set`).toBeLessThan(0.5);
        expect(e.pos[2], `#${seed} on the front`).toBeGreaterThan(head[0].pos[2]);
      }
    }
  });

  it('stands on four short stout legs tucked under its body, each of a thigh and a shin', () => {
    for (const seed of SEEDS) {
      const { p, depth, shoulders } = parts(seed);
      const chains = legs(p);
      expect(chains.length, `#${seed}`).toBe(4);
      for (const c of chains) {
        // (some pairs had a third link and stood a head taller than the other pair)
        expect(c.length, `#${seed} links`).toBe(3);
        expect(c[c.length - 1].terminal, `#${seed}`).toBe('paw');
        // (the shins, above the paw, were 0.12–0.22 of the trunk's depth across: four thin posts)
        expect((2 * Math.min(...c.slice(0, -1).map((n) => n.radius))) / depth, `#${seed} stout`).toBeGreaterThan(0.24);
        // (the feet stood 1.1–1.7 shoulder half-widths out: an A-frame wider than the body)
        expect(Math.abs(c[c.length - 1].pos[0]) / shoulders, `#${seed} under the body`).toBeLessThan(1.0);
      }
    }
  });

  it('trails a long thick tail that tapers to a point', () => {
    // (a third had no tail or a three-link spike a quarter of the trunk long, a quarter of the
    // rump's girth at the root and still two-thirds of that at the tip)
    for (const seed of SEEDS) {
      const { p, trunk } = parts(seed);
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      expect(tail.length, `#${seed} links`).toBeGreaterThanOrEqual(5);
      const length = trunk[trunk.length - 1].pos[2] - trunk[0].pos[2];
      const tip = tail.reduce((m, n) => (n.pos[2] < m.pos[2] ? n : m));
      expect((trunk[0].pos[2] - tip.pos[2]) / length, `#${seed} long`).toBeGreaterThan(0.36);
      const girth = Math.max(...trunk.map((n) => n.radius));
      expect(tail[0].radius / girth, `#${seed} thick at the root`).toBeGreaterThan(0.32);
      expect(tail[0].radius / girth, `#${seed} thinner than the body`).toBeLessThan(0.45);
      expect(tail[tail.length - 1].radius / tail[0].radius, `#${seed} tapers`).toBeLessThan(0.52);
    }
  });

  it('wears a brown coat, never a pale pink one', () => {
    // (a light coat on this red-brown hue was a hairless pink: lightness ran to 0.67)
    for (const seed of SEEDS) {
      const { g } = parts(seed);
      expect(g.covering.type, `#${seed}`).toBe('fur');
      expect(g.palette.light, `#${seed}`).toBeLessThan(0.43);
    }
  });

  it('keeps every gene inside its bounds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = genomeOfMorphotype(seed * 17 + 5, 'mustelid');
      for (let s: Genome['body'] | undefined = g.body; s; s = s.child) {
        for (const v of s.size) {
          expect(v).toBeGreaterThanOrEqual(GENE_BOUNDS.segment.size[0]);
          expect(v).toBeLessThanOrEqual(GENE_BOUNDS.segment.size[1]);
        }
        expect(s.taper).toBeGreaterThanOrEqual(GENE_BOUNDS.segment.taper[0]);
        expect(s.taper).toBeLessThanOrEqual(GENE_BOUNDS.segment.taper[1]);
        expect(Math.abs(s.curve[0])).toBeLessThanOrEqual(GENE_BOUNDS.segment.curvePitch[1]);
        for (const a of s.appendages) {
          expect(a.length).toBeGreaterThanOrEqual(GENE_BOUNDS.appendage.length[0]);
          expect(a.length).toBeLessThanOrEqual(GENE_BOUNDS.appendage.length[1]);
          expect(a.thickness).toBeGreaterThanOrEqual(GENE_BOUNDS.appendage.thickness[0]);
          expect(a.thickness).toBeLessThanOrEqual(GENE_BOUNDS.appendage.thickness[1]);
        }
      }
    }
  });
});

describe('an arched back (growth)', () => {
  /** A plain four-legged trunk of `repeat` links pitching `pitch` per link. */
  const quad = (pitch: number, repeat = 7): Genome => {
    const g = structuredClone(genomeOfMorphotype(3, 'mustelid')) as Genome;
    g.body.curve = [pitch, 0];
    g.body.repeat = repeat;
    return g;
  };
  const trunkOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);

  it('leaves a level or rising trunk exactly as it was: the first link heads straight forward', () => {
    for (const pitch of [-0.2, -0.05, 0, 0.02, 0.03]) {
      const t = trunkOf(grow(quad(pitch)));
      expect(t[0].quat, `pitch ${pitch}`).toEqual([0, 0, 0, 1]);
    }
  });

  it('comes on by degrees: a little more bend never snaps the body into another carriage', () => {
    // the height of the chest over the rump, across the band where the arch comes on
    const chest = (pitch: number) => {
      const t = trunkOf(grow(quad(pitch)));
      return t[t.length - 1].pos[1] - t[0].pos[1];
    };
    let prev = chest(0.03);
    for (let pitch = 0.031; pitch <= 0.0701; pitch += 0.001) {
      const y = chest(pitch);
      expect(Math.abs(y - prev), `pitch ${pitch.toFixed(3)}`).toBeLessThan(0.06);
      prev = y;
    }
  });

  it('keeps the chest off the ground however hard the trunk bends', () => {
    // (begun level, a trunk bending 0.1 a link dropped its chest most of a body depth below its rump)
    for (const pitch of [0.07, 0.1, 0.14]) {
      for (const repeat of [5, 7, 9]) {
        const t = trunkOf(grow(quad(pitch, repeat)));
        const depth = 2 * Math.max(...t.map(ry));
        expect(Math.abs(t[t.length - 1].pos[1] - t[0].pos[1]) / depth, `pitch ${pitch} ×${repeat}`).toBeLessThan(0.3);
      }
    }
  });

  it('arches a legless body the same way: a bent tube is a hump, not a nose-dive', () => {
    // (a legless offshoot of the long-bodied plan stood on its nose, its tail in the air)
    const g = quad(0.1, 8);
    g.body.appendages = g.body.appendages.filter((a) => a.kind !== 'leg');
    const t = trunkOf(grow(g));
    const depth = 2 * Math.max(...t.map(ry));
    expect(Math.abs(t[t.length - 1].pos[1] - t[0].pos[1]) / depth).toBeLessThan(0.3);
    expect(Math.max(...t.map((n) => n.pos[1])) - t[0].pos[1]).toBeGreaterThan(0.1 * depth);
  });
});
