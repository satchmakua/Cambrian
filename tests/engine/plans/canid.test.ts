import { describe, it, expect } from 'vitest';
import { BRUSH_STYLE, SCULL_STYLE, brushProfile, grow, headStop, isBrushTail, type Phenotype } from '../../../src/engine/grow';
import type { Genome, SegmentGene } from '../../../src/engine/genome';
import { genomeOfMorphotype } from '../../../src/engine/random';

type Node = Phenotype['nodes'][number];
const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);

const ry = (n: Node) => n.radius * (n.scale?.[1] ?? 1);
const rx = (n: Node) => n.radius * (n.scale?.[0] ?? 1);
const deg = (rad: number) => (rad * 180) / Math.PI;

/** A dog, measured: its trunk (rump → chest), neck and head chains, its legs (hip → paw, one side),
 *  its tail (root → tip), the ground it stands on and its chest's depth — the unit of the rest. */
function measure(seed: number) {
  const p = grow(genomeOfMorphotype(seed, 'canid'));
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const spine = p.nodes.filter((n) => n.kind === 'spine');
  const last = Math.max(...spine.map((n) => n.segment ?? 0));
  const trunk = spine.filter((n) => n.segment === 0).sort((a, b) => a.pos[2] - b.pos[2]);
  const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
  const head = spine.filter((n) => n.segment === last);
  const legs: Node[][] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg' || n.pos[0] < 0) return;
    const chain = [n];
    let cur = i;
    while (parent.has(cur) && p.nodes[parent.get(cur)!].part?.kind === 'leg') {
      cur = parent.get(cur)!;
      chain.unshift(p.nodes[cur]);
    }
    legs.push(chain);
  });
  legs.sort((a, b) => a[0].pos[2] - b[0].pos[2]);
  const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
  const ground = Math.min(...p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg').map((n) => n.pos[1] - n.radius));
  const D = 2 * Math.max(...trunk.map(ry));
  return { p, trunk, rump: trunk[0], chest: trunk[trunk.length - 1], neck, head, hind: legs[0], fore: legs[legs.length - 1], tail, ground, D };
}

/** A genome's head section (the last of its chain), and how many sections out from the trunk it is. */
const headOf = (g: Genome): [SegmentGene, number] => {
  let s = g.body;
  let depth = 0;
  for (; s.child; s = s.child) depth++;
  return [s, depth];
};

describe('canid', () => {
  it('has a stop: a domed braincase stepping down to a muzzle that holds its girth — not one cone from ears to nose', () => {
    // (skull, muzzle and nose ran down one straight taper, the bridge of the nose even bulging a little
    // above the line from crown to nose tip: a bull terrier's head, or a rat's)
    for (const seed of SEEDS) {
      const { head } = measure(seed);
      expect(head.length, `#${seed} links`).toBe(3);
      const [skull, muzzle, nose] = head;
      // the brow falls away from the crown far more steeply than the bridge of the nose then runs on
      const fall = (a: Node, b: Node) => deg(Math.atan2(a.pos[1] + ry(a) - (b.pos[1] + ry(b)), b.pos[2] - a.pos[2]));
      expect(fall(skull, muzzle) - fall(muzzle, nose), `#${seed} step at the brow`).toBeGreaterThan(15);
      // the muzzle is well under the braincase's girth where it leaves it (it was 0.62–0.71 of it)…
      expect(muzzle.radius / skull.radius, `#${seed} muzzle against skull`).toBeLessThan(0.6);
      // …and holds most of that to the nose (it lost a third again)
      expect(nose.radius / muzzle.radius, `#${seed} nose against muzzle`).toBeGreaterThan(0.74);
      // the muzzle is round in section, however broad and flat the skull behind it
      expect(Math.abs(rx(muzzle) / ry(muzzle) - 1), `#${seed} muzzle section`).toBeLessThan(0.02);
      expect(rx(skull) / ry(skull), `#${seed} skull section`).toBeGreaterThan(1.15);
    }
  });

  it('carries its head up on a neck slimmer than its skull — not stretched forward like a slinking hyena', () => {
    for (const seed of SEEDS) {
      const { neck, head } = measure(seed);
      const skull = head[0];
      // (the neck was 0.71–0.91 of the skull's width: head and neck one tube)
      expect(Math.min(...neck.map(rx)) / rx(skull), `#${seed} neck against skull`).toBeLessThan(0.8);
      // (the skull sat 28–43° above the neck's root, seen from the side: reaching forward)
      const rise = deg(Math.atan2(skull.pos[1] - neck[0].pos[1], skull.pos[2] - neck[0].pos[2]));
      expect(rise, `#${seed} neck's rise`).toBeGreaterThan(42);
    }
  });

  it('stands level-backed on legs of a dog’s length, the hind paws under its hips', () => {
    for (const seed of SEEDS) {
      const { trunk, rump, chest, hind, ground, D } = measure(seed);
      // (the back fell up to a quarter of the chest's depth from withers to croup: a hyena's slope)
      expect(Math.abs(chest.pos[1] + ry(chest) - (rump.pos[1] + ry(rump))) / D, `#${seed} back`).toBeLessThan(0.07);
      // (the belly stood up to 1.4 chest depths off the ground: a fawn's legs)
      const belly = Math.min(...trunk.map((n) => n.pos[1] - ry(n)));
      expect((belly - ground) / D, `#${seed} clearance`).toBeGreaterThan(0.7);
      expect((belly - ground) / D, `#${seed} clearance`).toBeLessThan(1.2);
      // (hock to paw leaned 19–26° forward and the paw stood a tenth of a chest depth or more ahead of
      // the hip: the hind legs folded under the body, a crouch)
      const [hip, , hock, paw] = hind;
      expect(deg(Math.atan2(paw.pos[2] - hock.pos[2], hock.pos[1] - paw.pos[1])), `#${seed} hock to paw`).toBeLessThan(18);
      expect(Math.abs(paw.pos[2] - hip.pos[2]) / D, `#${seed} paw under hip`).toBeLessThan(0.07);
    }
  });

  it('has shanks that keep their girth down to a real paw — not dowels ending in knobs', () => {
    for (const seed of SEEDS) {
      const { hind, fore, D } = measure(seed);
      for (const [name, leg] of [['hind', hind], ['fore', fore]] as const) {
        expect(leg.length, `#${seed} ${name} links`).toBe(4);
        const [, , wrist, paw] = leg;
        // (the wrist was 0.13–0.20 of the chest's depth across, the paw's own link 0.62–0.75 of that)
        expect((2 * wrist.radius) / D, `#${seed} ${name} wrist`).toBeGreaterThan(0.17);
        expect(paw.radius / wrist.radius, `#${seed} ${name} paw`).toBeGreaterThan(0.78);
        expect(paw.terminal, `#${seed} ${name}`).toBe('paw');
      }
    }
  });

  it('wears a brush: set on at the croup, bushy down its middle, drawn to a point, hanging to the hocks', () => {
    // (a short rod of one girth with a round end, leaving the rump below its middle and held straight
    // out behind: a sausage pinned on)
    let seen = 0;
    for (const seed of SEEDS) {
      const { tail, rump, hind, ground, D } = measure(seed);
      if (tail.length === 0) continue;
      seen++;
      expect(tail.length, `#${seed} links`).toBe(5);
      const [root, tip] = [tail[0], tail[tail.length - 1]];
      // set on above the rump's own axis (it left 0.17–0.28 of a chest depth below it)
      expect((root.pos[1] - rump.pos[1]) / D, `#${seed} set on`).toBeGreaterThan(0.1);
      // fullest about half way down, over twice the root's girth; the tip a point
      const fullest = tail.reduce((b, n, i) => (n.radius > tail[b].radius ? i : b), 0);
      expect(fullest / (tail.length - 1), `#${seed} fullest`).toBeGreaterThanOrEqual(0.3);
      expect(fullest / (tail.length - 1), `#${seed} fullest`).toBeLessThanOrEqual(0.75);
      expect(tail[fullest].radius / root.radius, `#${seed} bush`).toBeGreaterThan(1.8);
      expect(tip.radius / tail[fullest].radius, `#${seed} point`).toBeLessThan(0.35);
      // long (it was 0.9–1.14 chest depths)…
      let length = 0;
      for (let i = 1; i < tail.length; i++) length += Math.hypot(tail[i].pos[1] - tail[i - 1].pos[1], tail[i].pos[2] - tail[i - 1].pos[2]);
      expect(length / D, `#${seed} length`).toBeGreaterThan(1.25);
      // …hanging to about the hocks (its tip rode 0.4 of a chest depth or more above them)…
      const hock = hind[2];
      expect((tip.pos[1] - hock.pos[1]) / D, `#${seed} to the hocks`).toBeLessThan(0.25);
      // …but trailing out behind and clear of the ground: seen from behind it is no fifth leg
      expect((root.pos[2] - tip.pos[2]) / D, `#${seed} trails`).toBeGreaterThan(0.7);
      expect((tip.pos[1] - ground) / D, `#${seed} off the ground`).toBeGreaterThan(0.25);
      for (let i = 1; i < tail.length; i++) expect(tail[i].pos[2], `#${seed} link ${i} behind`).toBeLessThan(tail[i - 1].pos[2]);
    }
    expect(seen).toBeGreaterThan(12);
  });

  it('keeps the brush to itself, and the stop to itself and the bear: no other founder grows either', () => {
    // (a bear's skull has a stop too: see plans/ursid.test.ts)
    for (const id of ['felid', 'ungulate', 'rodent', 'mustelid', 'primate', 'dragon', 'wyvern', 'crocodilian', 'shark', 'lizard']) {
      for (let seed = 1; seed <= 12; seed++) {
        const g = genomeOfMorphotype(seed, id);
        expect(headStop(...headOf(g)), `${id} #${seed} stop`).toBe(0);
        for (let s: SegmentGene | undefined = g.body; s; s = s.child) {
          for (const a of s.appendages) if (a.kind === 'tail') expect(isBrushTail(a, a.terminal), `${id} #${seed} tail`).toBe(false);
        }
      }
    }
    for (const seed of SEEDS) {
      const g = genomeOfMorphotype(seed, 'canid');
      expect(headStop(...headOf(g)), `canid #${seed} stop`).toBe(1);
      for (const a of g.body.appendages) {
        if (a.kind !== 'tail') continue;
        expect(isBrushTail(a, a.terminal), `canid #${seed} tail`).toBe(true);
        // (a brush's band of the style gene ends where a crocodile's sculling blade begins)
        expect(a.style).toBeGreaterThanOrEqual(BRUSH_STYLE);
        expect(a.style).toBeLessThan(SCULL_STYLE);
      }
    }
  });

  it('only a domed skull carried on a neck has a stop: a long flat head stays all jaw', () => {
    // (a crocodile's head barely tapers either, and it too is carried on a neck: a small drift of
    // that gene must not raise a brow on it — its skull is half as deep as wide, with no dome to
    // step down from)
    for (let seed = 1; seed <= 8; seed++) {
      const g = genomeOfMorphotype(seed, 'crocodilian');
      const [head, depth] = headOf(g);
      expect(depth, `#${seed}`).toBe(2);
      expect(head.size[1] / head.size[0], `#${seed}: a flat skull`).toBeLessThan(0.6);
      // (were its skull as deep as a dog's, the same drift would give it one)
      expect(headStop({ ...head, taper: 0.95, size: [head.size[0], head.size[0] * 0.8, head.size[2]] }, depth), `#${seed}`).toBe(1);
      // …and a head set straight on the shoulders has none, whatever its shape (a shark's)
      const [shark, sharkDepth] = headOf(genomeOfMorphotype(seed, 'shark'));
      expect(sharkDepth).toBe(1);
      expect(headStop({ ...shark, taper: 0.95 }, sharkDepth), `shark #${seed}`).toBe(0);
      const drifted = structuredClone(g);
      headOf(drifted)[0].taper = 0.95;
      expect(headStop({ ...head, taper: 0.95 }, depth), `#${seed}`).toBe(0);
      const heads = [g, drifted].map((x) => grow(x).nodes.filter((n) => n.kind === 'spine' && n.segment === 1));
      // the drifted head is the plain chain its taper makes it: each link the ratio of the last
      heads[1].forEach((n, i) => expect(n.radius / heads[1][0].radius, `#${seed} link ${i}`).toBeCloseTo(Math.pow(0.95, i), 9));
      expect(heads[1].length, `#${seed}`).toBe(heads[0].length);
    }
    // …and a dog's stop comes on by degrees as its muzzle's taper climbs — never at a line
    const g = genomeOfMorphotype(1, 'canid');
    const [head, depth] = headOf(g);
    let last = 0;
    for (let taper = 0.84; taper <= 0.921; taper += 0.01) {
      const s = headStop({ ...head, taper }, depth);
      expect(s, `taper ${taper.toFixed(2)}`).toBeGreaterThanOrEqual(last);
      expect(s - last, `taper ${taper.toFixed(2)}`).toBeLessThan(0.4);
      last = s;
    }
    expect(headStop({ ...head, taper: 0.86 }, depth)).toBe(0);
    expect(last).toBe(1);
  });

  it('a plain tail keeps its even taper; a brush swells and comes to a point', () => {
    // a cat's tail: each link the gene's ratio of the last
    for (let seed = 1; seed <= 8; seed++) {
      const g = genomeOfMorphotype(seed, 'felid');
      const gene = g.body.appendages.find((a) => a.kind === 'tail');
      if (!gene) continue;
      const tail = grow(g).nodes.filter((n) => n.part?.kind === 'tail');
      tail.forEach((n, j) => expect(n.radius, `felid #${seed} link ${j}`).toBeCloseTo(Math.max(0.04, gene.thickness * Math.pow(gene.taper, j)), 9));
    }
    expect(brushProfile(0)).toBeLessThan(0.7);
    expect(brushProfile(0.55)).toBeGreaterThan(1.25);
    expect(brushProfile(1)).toBeLessThan(0.3);
    // the same dog with its tail's style turned down is the same dog with a rod for a tail
    const g = genomeOfMorphotype(1, 'canid');
    const plain = structuredClone(g);
    for (const a of plain.body.appendages) if (a.kind === 'tail') a.style = 0.2;
    const [a, b] = [grow(g), grow(plain)].map((p) => p.nodes.filter((n) => n.part?.kind === 'tail'));
    expect(b.length).toBe(a.length);
    expect(Math.max(...b.map((n) => n.radius))).toBeCloseTo(b[0].radius, 9);
    expect(Math.max(...a.map((n) => n.radius))).toBeGreaterThan(1.8 * a[0].radius);
  });
});
