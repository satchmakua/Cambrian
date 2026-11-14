import { describe, it, expect } from 'vitest';
import { grow, isRinged, pointedLegs, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../../../src/engine/random';
import { buildFieldPrims, rayToSurface } from '../../../src/viewer/bodyField';

type Node = Phenotype['nodes'][number];
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const alien = (seed: number) => grow(genomeOfMorphotype(seed, 'arthro-alien'));

const parentOf = (p: Phenotype) => new Map(p.edges.map(([a, b]) => [b, a]));
const trunkOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
const headOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1);
const depthOf = (n: Node) => n.radius * (n.scale?.[1] ?? 1);
const widthOf = (n: Node) => n.radius * (n.scale?.[0] ?? 1);

/** The trunk nodes a leg pair roots on, rump first: a myriapod's rings. */
function ringsOf(p: Phenotype): Node[] {
  const parent = parentOf(p);
  const set = new Set<Node>();
  p.nodes.forEach((n, i) => {
    const par = parent.get(i);
    if (n.part?.kind === 'leg' && par !== undefined && p.nodes[par].kind === 'spine') set.add(p.nodes[par]);
  });
  return [...set].sort((a, b) => a.pos[2] - b.pos[2]);
}

/** Each leg (hip → point) on the creature's right side, rump first. */
function legsOf(p: Phenotype): Node[][] {
  const parent = parentOf(p);
  const out: Node[][] = [];
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
  return out.sort((a, b) => a[0].pos[2] - b[0].pos[2]);
}

const lengthOf = (leg: Node[]) => leg.slice(1).reduce((t, n, i) => t + Math.hypot(n.pos[0] - leg[i].pos[0], n.pos[1] - leg[i].pos[1], n.pos[2] - leg[i].pos[2]), 0);

/** The angle (rad) a leg turns through at joint `j` (between the links either side of node j). */
function bendAt(leg: Node[], j: number): number {
  const a = [0, 1, 2].map((k) => leg[j].pos[k] - leg[j - 1].pos[k]);
  const b = [0, 1, 2].map((k) => leg[j + 1].pos[k] - leg[j].pos[k]);
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b)))));
}

describe('arthro-alien: a segmented, many-legged arthropod', () => {
  it('the trunk is a chain of six or more rings, a leg pair to each', () => {
    // (five pairs crowded onto a trunk of three to five links, several to a link)
    for (const seed of SEEDS) {
      const p = alien(seed);
      const rings = ringsOf(p);
      const legs = legsOf(p);
      expect(rings.length, `#${seed} rings`).toBeGreaterThanOrEqual(6);
      expect(legs.length, `#${seed} leg pairs`).toBe(rings.length);
      expect(p.genomeRef.body.repeat, `#${seed} links`).toBe(rings.length);
      expect(isRinged(p.genomeRef.body, 0), `#${seed}`).toBe(true);
    }
  });

  it('the back dips into a groove between every two rings', () => {
    // the skin itself, not the skeleton: the height of the back above the body's axis, taken at each
    // ring and across the gap to the next. (One smooth bottle: the back ran straight from link to
    // link, or swelled between them.)
    for (const seed of SEEDS) {
      const p = alien(seed);
      const rings = ringsOf(p);
      const prims = buildFieldPrims(p, 'hybrid');
      const backAt = (z: number, y: number) => {
        const hit = rayToSurface(prims, [], [0, y, z], [0, 1, 0]);
        return hit ? hit.p[1] - y : 0;
      };
      for (let i = 0; i + 1 < rings.length; i++) {
        const a = rings[i];
        const b = rings[i + 1];
        let groove = Infinity;
        for (let s = 1; s < 16; s++) {
          const u = s / 16;
          groove = Math.min(groove, backAt(a.pos[2] + (b.pos[2] - a.pos[2]) * u, a.pos[1] + (b.pos[1] - a.pos[1]) * u));
        }
        const crest = Math.min(backAt(a.pos[2], a.pos[1]), backAt(b.pos[2], b.pos[1]));
        expect(groove / crest, `#${seed} ring ${i}`).toBeLessThan(0.84);
        expect(groove / crest, `#${seed} ring ${i}`).toBeGreaterThan(0.5); // …a groove, not a thread between beads
      }
    }
  });

  it('the rings are broad and flat, near equal down the body, drawing in to the rump', () => {
    // (a bottle: a narrow front widening to a fat rear, as deep as it was wide)
    for (const seed of SEEDS) {
      const rings = ringsOf(alien(seed));
      const widest = Math.max(...rings.map((r) => r.radius));
      for (const r of rings) expect(widthOf(r) / depthOf(r), `#${seed} flat`).toBeGreaterThan(1.3);
      // the front two-thirds within a seventh of one another…
      for (const r of rings.slice(Math.ceil(rings.length / 3))) expect(r.radius / widest, `#${seed} even`).toBeGreaterThan(0.86);
      // …and the rump the narrowest ring, the head end not pinched to a neck
      expect(rings[0].radius / widest, `#${seed} rump`).toBeLessThan(0.8);
      expect(rings[rings.length - 1].radius / widest, `#${seed} shoulders`).toBeGreaterThan(0.86);
    }
  });

  it('the legs run the whole body, from the rump to just behind the head', () => {
    // (all ten hung under the middle: the head and fore-body a legless third ahead of them)
    for (const seed of SEEDS) {
      const p = alien(seed);
      const legs = legsOf(p);
      const rump = trunkOf(p).reduce((m, n) => Math.min(m, n.pos[2]), Infinity);
      const head = headOf(p)[0].pos[2];
      const hips = legs.map((l) => l[0].pos[2]);
      expect((Math.max(...hips) - Math.min(...hips)) / (head - rump), `#${seed} span`).toBeGreaterThan(0.78);
      // evenly: no gap between neighbouring pairs more than half as long again as the mean
      const gaps = hips.slice(1).map((z, i) => z - hips[i]);
      const mean = gaps.reduce((t, g) => t + g, 0) / gaps.length;
      expect(Math.max(...gaps) / mean, `#${seed} even`).toBeLessThan(1.5);
    }
  });

  it('each leg is a slim jointed limb: two knees, a taper, a point to stand on', () => {
    // (pegs: half of them one bend only, each ending in a blunt cap)
    for (const seed of SEEDS) {
      const p = alien(seed);
      const rings = ringsOf(p);
      const ringR = Math.max(...rings.map((r) => r.radius));
      const floor = p.bounds.min[1];
      expect(pointedLegs(p.genomeRef), `#${seed}`).toBe(true);
      for (const leg of legsOf(p)) {
        expect(leg.length, `#${seed} links`).toBe(4);
        expect(bendAt(leg, 1), `#${seed} knee`).toBeGreaterThan(0.3);
        expect(bendAt(leg, 2), `#${seed} ankle`).toBeGreaterThan(0.3);
        expect(leg[1].pos[1], `#${seed} knee above hip`).toBeGreaterThan(leg[0].pos[1]);
        expect(leg[0].radius / ringR, `#${seed} slim`).toBeLessThan(0.3);
        expect(leg[3].radius, `#${seed} taper`).toBeLessThan(leg[0].radius * 0.8);
        expect(leg[3].terminal, `#${seed}`).toBe('claw');
        // the last node stops short of the ground by the length of the point drawn below it
        const above = leg[3].pos[1] - floor;
        expect(above, `#${seed} point`).toBeGreaterThan(0.09);
        expect(above, `#${seed} point`).toBeLessThan(0.22);
      }
    }
  });

  it('the legs differ down the body: longer toward the rear, flared at both ends', () => {
    // (ten identical pegs in a row)
    for (const seed of SEEDS) {
      const p = alien(seed);
      const legs = legsOf(p);
      const lens = legs.map(lengthOf);
      expect(lens[0] / lens[lens.length - 1], `#${seed} graded`).toBeGreaterThan(1.15);
      const rumpEnd = trunkOf(p).reduce((m, n) => Math.min(m, n.pos[2] - n.radius), Infinity);
      const sweep = (leg: Node[]) => Math.atan2(leg[3].pos[2] - leg[0].pos[2], leg[3].pos[0] - leg[0].pos[0]);
      // the last pair trails back past the end of the body, the first reaches forward, the middle stand square
      expect(legs[0][3].pos[2], `#${seed} trailing pair`).toBeLessThan(rumpEnd);
      expect(sweep(legs[0]), `#${seed} rear sweep`).toBeLessThan(-0.7);
      expect(sweep(legs[legs.length - 1]), `#${seed} fore sweep`).toBeGreaterThan(0.3);
      expect(Math.abs(sweep(legs[Math.floor(legs.length / 2)])), `#${seed} middle`).toBeLessThan(0.25);
    }
  });

  it('the body is carried off the ground on a wide stance', () => {
    // (the belly a fifth of the body's depth off the floor)
    for (const seed of SEEDS) {
      const p = alien(seed);
      const rings = ringsOf(p);
      const depth = 2 * Math.max(...rings.map(depthOf));
      const width = 2 * Math.max(...rings.map(widthOf));
      const belly = Math.min(...trunkOf(p).map((n) => n.pos[1] - depthOf(n)));
      expect((belly - p.bounds.min[1]) / depth, `#${seed} clearance`).toBeGreaterThan(0.4);
      const feet = legsOf(p).map((l) => l[3]);
      const ys = feet.map((f) => f.pos[1]);
      expect(Math.max(...ys) - Math.min(...ys), `#${seed} one floor`).toBeLessThan(0.02);
      expect((2 * Math.max(...feet.map((f) => f.pos[0]))) / width, `#${seed} stance`).toBeGreaterThan(2.4);
    }
  });

  it('wears no pasted-on parts: no tail rod, no studs down the back, no gill grille, no bands across the rings', () => {
    for (const seed of SEEDS) {
      const p = alien(seed);
      for (const kind of ['tail', 'spine', 'gill'] as const) expect(p.nodes.some((n) => n.part?.kind === kind), `#${seed} ${kind}`).toBe(false);
      expect(p.genomeRef.covering.pattern, `#${seed}`).not.toBe('bands');
    }
  });

  it('the head is a broad shield as wide as the rings, its two eyes apart on its sides, two long feelers apart on its front', () => {
    // (a head pinched to a nub under clustered eyes, or as tall as it was narrow; feelers fused on the crown)
    for (const seed of SEEDS) {
      const p = alien(seed);
      const head = headOf(p);
      const ringR = Math.max(...ringsOf(p).map((r) => r.radius));
      expect(head.length, `#${seed}`).toBe(1);
      expect(head[0].radius / ringR, `#${seed} head size`).toBeGreaterThan(0.85);
      expect(head[0].radius / ringR, `#${seed} head size`).toBeLessThan(1.2);
      expect(widthOf(head[0]) / depthOf(head[0]), `#${seed} head flat`).toBeGreaterThan(1.3);
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      expect(eyes.length, `#${seed} eyes`).toBe(2);
      expect(Math.abs(eyes[0].pos[0] - eyes[1].pos[0]) - 2 * eyes[0].radius, `#${seed} eyes apart`).toBeGreaterThan(2 * eyes[0].radius);
      const parent = parentOf(p);
      const roots = p.nodes.filter((n, i) => n.part?.kind === 'antenna' && p.nodes[parent.get(i)!].part?.kind !== 'antenna');
      const tips = p.nodes.filter((n) => n.part?.kind === 'antenna' && n.kind === 'terminal');
      expect(roots.length, `#${seed} feelers`).toBe(2);
      expect(Math.abs(roots[0].pos[0] - roots[1].pos[0]), `#${seed} feeler roots apart`).toBeGreaterThan(3 * roots[0].radius);
      // long and forward: each reaches ahead of the head by more than the head's own length
      for (const t of tips) expect(t.pos[2] - head[0].pos[2], `#${seed} feeler reach`).toBeGreaterThan(2.2 * head[0].radius);
      expect(Math.abs(tips[0].pos[0] - tips[1].pos[0]), `#${seed} feelers spread`).toBeGreaterThan(Math.abs(roots[0].pos[0] - roots[1].pos[0]));
    }
  });

  it('its feelers rise a little as they reach forward — they never droop toward the ground', () => {
    // (curled down, the near one hung in front of the face to the ground: a trunk with a knob on it)
    for (const seed of SEEDS) {
      const p = alien(seed);
      const parent = parentOf(p);
      p.nodes.forEach((n, i) => {
        if (n.part?.kind !== 'antenna' || n.kind !== 'terminal') return;
        // every link of the feeler, root to tip, climbs
        for (let j = i; p.nodes[parent.get(j)!].part?.kind === 'antenna'; j = parent.get(j)!) {
          expect(p.nodes[j].pos[1], `#${seed} feeler link`).toBeGreaterThan(p.nodes[parent.get(j)!].pos[1]);
        }
      });
    }
  });

  it('no other body plan grows a ringed trunk', () => {
    for (const id of MORPHOTYPE_IDS) {
      if (id === 'arthro-alien') continue;
      for (let seed = 1; seed <= 8; seed++) {
        const g = genomeOfMorphotype(seed, id);
        expect(isRinged(g.body, 0), `${id} #${seed}`).toBe(false);
        expect(pointedLegs(g), `${id} #${seed}`).toBe(false);
      }
    }
  });
});
