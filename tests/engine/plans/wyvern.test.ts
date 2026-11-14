import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { BROW_TILT, eyeTilt } from '../../../src/viewer/eyeSeat';
import { ARM_FOLD, buildFoldedMembraneWing, foldedSpan, wingOpenSpan } from '../../../src/viewer/wings';

type Node = Phenotype['nodes'][number];
const rx = (n: Node) => n.radius * (n.scale?.[0] ?? 1);
const ry = (n: Node) => n.radius * (n.scale?.[1] ?? 1);

describe('wyvern', () => {
  it('its skull is a dragon’s: a little wider than tall and a head’s size on its neck — not a disc on a pole', () => {
    // (half its founders wore a 'flat' skull twice as wide as it was tall and twice the neck's width —
    // a mushroom cap, a cobra's hood on a pole — and the rest a 'wedge' half as wide as tall)
    for (let seed = 1; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'wyvern'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const head = spine.filter((n) => n.segment === last);
      const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
      const top = neck[neck.length - 1];
      expect(rx(head[0]) / ry(head[0]), `#${seed} width against depth`).toBeGreaterThan(0.95);
      expect(rx(head[0]) / ry(head[0]), `#${seed} width against depth`).toBeLessThan(1.5);
      expect(rx(head[0]) / rx(top), `#${seed} against the neck`).toBeLessThan(1.9);
    }
  });
  const trunkOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0);

  it('carries its tail out behind it, level from the rump — never a column hanging under its belly', () => {
    // (curling down at the default's −0.1 a link, 17 in 40 hung below the belly line: from the front a pale
    // column from the crotch to the floor, a third leg)
    for (let seed = 1; seed <= 40; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'wyvern'));
      const belly = Math.min(...trunkOf(p).map((n) => n.pos[1] - ry(n)));
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      expect(tail.length, `#${seed}`).toBeGreaterThan(0);
      expect(Math.min(...tail.map((n) => n.pos[1] - n.radius)), `#${seed}`).toBeGreaterThanOrEqual(belly - 0.05);
    }
  });

  it('folds wings that are its arms: back past its rump, not two frills on its shoulders', () => {
    // (sized off its short reared trunk like a dragon's, a fold lay inside its flank's outline)
    expect(ARM_FOLD).toBeGreaterThan(2);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 29]) {
      const p = grow(genomeOfMorphotype(seed, 'wyvern'));
      const tip = p.nodes.find((n) => n.kind === 'terminal' && n.part?.kind === 'wing' && n.pos[0] > 0)!;
      const geo = buildFoldedMembraneWing(1, foldedSpan(p, tip.radius)).surface;
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      expect(b.max.z - b.min.z, `#${seed}`).toBeGreaterThanOrEqual(1.1 * wingOpenSpan(p, tip.radius).trunkLen);
    }
    // (a dragon's and a chimera's, on four legs, are as they were)
    for (const id of ['dragon', 'chimera']) {
      const p = grow(genomeOfMorphotype(5, id));
      const tip = p.nodes.find((n) => n.kind === 'terminal' && n.part?.kind === 'wing' && n.pos[0] > 0)!;
      const { openS } = wingOpenSpan(p, tip.radius);
      expect(foldedSpan(p, tip.radius), id).toBeCloseTo(openS * 1.35, 6);
    }
  });

  it('a banded wyvern wears four bands or more down its length: no saddle on its back, no tail dipped in paint', () => {
    // (bands drawn from the default scale were a period of up to 5.6 body units: two or three on a wyvern)
    let banded = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'wyvern'));
      const c = p.genomeRef.covering;
      if (c.pattern !== 'bands') continue;
      banded++;
      const period = (2 * Math.PI) / (0.8 * c.patternScale);
      expect((p.bounds.max[2] - p.bounds.min[2]) / period, `#${seed}`).toBeGreaterThanOrEqual(3.5);
    }
    expect(banded).toBeGreaterThan(5);
  });

  it('stands on a thigh that is no ball over a thin shank, under a neck that is no pipe', () => {
    // (its thighs nearly spheres, three times its ankles: pantaloons; its neck a third of its chest's girth
    // under a head half again as wide: a ball on a pipe)
    let thigh = 0, taper = 0;
    const N = 12;
    for (let seed = 1; seed <= N; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'wyvern'));
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const leg = p.nodes.map((n, i) => ({ n, i })).filter(({ n, i }) => n.part?.kind === 'leg' && p.nodes[parent.get(i)!]?.kind === 'spine' && n.pos[0] > 0);
      const hip = leg[0];
      const kids = p.edges.filter(([a]) => a === hip.i).map(([, b]) => p.nodes[b]);
      const knee = kids[0];
      thigh += hip.n.radius / Math.hypot(knee.pos[0] - hip.n.pos[0], knee.pos[1] - hip.n.pos[1], knee.pos[2] - hip.n.pos[2]);
      // down the leg to its foot
      let j = hip.i, ankle = hip.n;
      for (;;) {
        const next = p.edges.find(([a]) => a === j);
        if (!next) break;
        j = next[1];
        if (p.nodes[j].kind === 'terminal') break;
        ankle = p.nodes[j];
      }
      taper += hip.n.radius / ankle.radius;
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
      const head = spine.filter((n) => n.segment === last);
      const chest = Math.max(...trunkOf(p).map((n) => n.radius));
      expect(neck[0].radius / chest, `#${seed} neck against chest`).toBeGreaterThanOrEqual(0.385);
      expect(rx(head[0]) / rx(neck[neck.length - 1]), `#${seed} head against neck`).toBeLessThanOrEqual(1.45);
    }
    expect(thigh / N, 'thigh against its link').toBeLessThanOrEqual(0.6);
    expect(taper / N, 'thigh against ankle').toBeLessThanOrEqual(2.7);
  });
});


describe('a dragon’s head (and a wyvern’s)', () => {
  const heads = (fn: (p: Phenotype, id: string, seed: number) => void) => {
    for (const id of ['dragon', 'wyvern'])
      for (let seed = 1; seed <= 12; seed++) fn(grow(genomeOfMorphotype(seed, id)), id, seed);
  };

  it('looks out of a reptile’s slit eye under a brow — never an insect’s facets or a glowing disc', () => {
    // (three in five stared out of a flat cyan disc as big as a cartoon's: with the drooping muzzle
    // and an ear-like horn, the head read as a llama's)
    heads((p, id, seed) => {
      let eyes = 0;
      p.edges.forEach(([a, b]) => {
        const n = p.nodes[b];
        if (n.terminal !== 'eye' || p.nodes[a].kind !== 'spine') return;
        eyes++;
        expect(n.part!.style, `${id} #${seed}`).toBeGreaterThanOrEqual(0.4);
        expect(n.part!.style, `${id} #${seed}`).toBeLessThan(0.6);
        expect(eyeTilt(n.quat), `${id} #${seed} scowls`).toBeGreaterThanOrEqual(BROW_TILT);
      });
      expect(eyes, `${id} #${seed}`).toBe(2);
    });
  });

  it('wears its horns swept back along the skull, not stood up off the crown like ears', () => {
    let horns = 0;
    heads((p, id, seed) => {
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const head = spine.filter((n) => n.segment === last);
      const a = head[0].pos;
      const b = head[head.length - 1].pos;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const parent = new Int32Array(p.nodes.length).fill(-1);
      for (const [x, y] of p.edges) parent[y] = x;
      p.nodes.forEach((n, i) => {
        if (n.part?.kind !== 'horn' || !n.terminal) return;
        let j = i;
        while (parent[j] >= 0 && p.nodes[parent[j]].part?.kind === 'horn') j = parent[j];
        const root = p.nodes[parent[j]].pos;
        const d = [n.pos[0] - root[0], n.pos[1] - root[1], n.pos[2] - root[2]];
        const along = (d[0] * (b[0] - a[0]) + d[1] * (b[1] - a[1]) + d[2] * (b[2] - a[2])) / (L * Math.hypot(d[0], d[1], d[2]));
        expect(along, `${id} #${seed}`).toBeLessThan(-0.3);
        horns++;
      });
    });
    expect(horns).toBeGreaterThan(20);
  });
  it("is no giraffe: banded or mottled, its horns swept back along the skull, its neck carried forward", () => {
    // (in a net of dark cells on tan, two short horns standing up off its crown and its neck upright, the
    // wyvern read as a giraffe; the dragon's net as cracked glaze)
    for (const id of ['wyvern', 'dragon']) {
      for (let seed = 1; seed <= 12; seed++) {
        const g = genomeOfMorphotype(seed, id);
        expect(g.covering.pattern, `${id} #${seed}`).not.toBe('reticulate');
        let horns = 0;
        for (let s: typeof g.body | undefined = g.body; s; s = s.child) {
          for (const a of s.appendages) {
            if (a.kind !== 'horn') continue;
            horns++;
            // aimed well back (elevation past −1.1 rad): along the skull, not up off it — a dragon's from
            // the back corners of its skull, swept back at least 50° (aimed as far back as a wyvern's, both
            // rooted on the midline, their sheaths merged into a fork)
            expect(a.attachElevation, `${id} #${seed}`).toBeLessThan(id === 'dragon' ? -0.85 : -1.1);
          }
        }
        // a wyvern's neck leaves its shoulders pitched up no more than a fifth of a radian a link
        if (id === 'wyvern' && g.body.child) expect(g.body.child.curve[0], `${id} #${seed} neck`).toBeGreaterThan(-0.21);
        expect(horns, `${id} #${seed}`).toBeLessThanOrEqual(4);
      }
    }
  });
});
