import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { BROW_TILT, eyeTilt } from '../../../src/viewer/eyeSeat';

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
            // aimed well back (elevation past −1.1 rad): along the skull, not up off it
            expect(a.attachElevation, `${id} #${seed}`).toBeLessThan(-1.1);
          }
        }
        // a wyvern's neck leaves its shoulders pitched up no more than a fifth of a radian a link
        if (id === 'wyvern' && g.body.child) expect(g.body.child.curve[0], `${id} #${seed} neck`).toBeGreaterThan(-0.21);
        expect(horns, `${id} #${seed}`).toBeLessThanOrEqual(4);
      }
    }
  });
});
