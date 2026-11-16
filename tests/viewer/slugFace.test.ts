import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildFieldPrims, fieldAt, slugMantle, type FieldPrims } from '../../src/viewer/bodyField';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 37];

/** the trunk front to back, and where its skin starts and ends along it */
function trunkSpan(p: Phenotype) {
  const t = p.nodes.filter((n) => n.kind === 'spine').sort((a, b) => a.pos[2] - b.pos[2]);
  const f = t[t.length - 1];
  const z0 = t[0].pos[2] - t[0].radius, z1 = f.pos[2] + f.radius * (f.scale?.[2] ?? 1);
  return { t, z0, z1, at: (z: number) => (z - z0) / (z1 - z0) };
}

/** the first node of the limb chain that ends at node i (the one hung on the trunk) */
function rootOf(p: Phenotype, i: number): number {
  let r = i;
  for (;;) {
    const e = p.edges.find(([, b]) => b === r);
    if (!e || p.nodes[e[0]].kind === 'spine') return r;
    r = e[0];
  }
}

describe("a slug's face", () => {
  it('its feelers stand up from its head, ahead of its mantle, and its mouth is under the front of it', () => {
    // (on six links the slot rounded to the link behind the front for half the slugs: their feelers stood up
    // out of the middle of the mantle, behind a blank glossy dome — a bean with two pins in its back)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'slime'));
      const { at } = trunkSpan(p);
      const m = slugMantle(p)!;
      for (const [i, n] of p.nodes.entries()) {
        if (n.terminal !== 'eye') continue;
        const root = p.nodes[rootOf(p, i)];
        expect(at(root.pos[2]), `#${seed} feeler on the head`).toBeGreaterThan(0.88);
        expect(root.pos[2], `#${seed} feeler ahead of the mantle`).toBeGreaterThan(m.c[2] + m.r[2]);
      }
      const mouth = p.nodes.find((n) => n.terminal === 'mouth')!;
      expect(at(mouth.pos[2]), `#${seed} mouth at the front`).toBeGreaterThan(0.9);
    }
  });

  it('under its feelers it carries a shorter, finer pair of lower tentacles reaching forward off the front of its head', () => {
    // (with none, the front of a slug was a featureless dome)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'slime'));
      const { t, z1 } = trunkSpan(p);
      const tips = p.nodes.map((n, i) => [n, i] as const).filter(([n]) => n.kind === 'terminal' && n.part?.kind === 'antenna');
      expect(tips.length, `#${seed} a pair`).toBe(2);
      expect(tips[0][0].pos[0] * tips[1][0].pos[0], `#${seed} one each side`).toBeLessThan(0);
      const eye = p.nodes.findIndex((n) => n.terminal === 'eye' && n.pos[0] > 0);
      const eyeRoot = p.nodes[rootOf(p, eye)];
      const feeler = Math.hypot(...([0, 1, 2].map((k) => p.nodes[eye].pos[k] - eyeRoot.pos[k]) as [number, number, number]));
      const prims = buildFieldPrims(p, 'hybrid');
      for (const [tip, i] of tips) {
        const root = p.nodes[rootOf(p, i)];
        // rooted on the front link of the trunk, below the feeler's root
        const parent = p.edges.find(([, b]) => b === rootOf(p, i))![0];
        expect(parent, `#${seed} on the head`).toBe(p.nodes.indexOf(t[t.length - 1]));
        expect(root.pos[1], `#${seed} below the feeler`).toBeLessThan(eyeRoot.pos[1] - 0.5 * (eyeRoot.pos[1] - t[t.length - 1].pos[1]));
        // its tip out ahead of the front of the head, in the open
        expect(tip.pos[2], `#${seed} reaching forward`).toBeGreaterThan(z1);
        expect(fieldAt(prims, tip.pos[0], tip.pos[1], tip.pos[2] + 0.06), `#${seed} past its tip is air`).toBeGreaterThan(0);
        // shorter than the feeler, and no thicker than its stalk
        const len = Math.hypot(tip.pos[0] - root.pos[0], tip.pos[1] - root.pos[1], tip.pos[2] - root.pos[2]);
        expect(len / feeler, `#${seed} shorter`).toBeLessThan(0.6);
        expect(len / feeler, `#${seed} not a stub`).toBeGreaterThan(0.2);
        for (let c = 0; c < prims.nc; c++) {
          if (prims.ib[c] !== i) continue;
          const stalk = p.nodes.find((n) => n.kind === 'limb' && n.part?.kind === 'eyestalk')!;
          expect(prims.rb[c], `#${seed} finer than the feeler's stalk`).toBeLessThan(stalk.radius);
          expect(prims.rb[c], `#${seed} still a tentacle`).toBeGreaterThan(0.5 * stalk.radius);
        }
      }
    }
    // (only a slug's: a crab's stalked eyes and an octopus's slime body grow none)
    for (const id of ['crab', 'cephalopod']) {
      for (let seed = 1; seed <= 4; seed++) expect(grow(genomeOfMorphotype(seed, id)).nodes.some((n) => n.part?.kind === 'antenna'), `${id} #${seed}`).toBe(false);
    }
  });

  it('its mantle is a saddle, standing off its flanks no further than over its back: no brim', () => {
    // (flatter and wider than the body, its rim stood off the flanks three times as far as it stood over the
    // back: from the front two flaps either side of the head, the slug a hamburger bun)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'slime'));
      const m = slugMantle(p)!;
      const prims = buildFieldPrims(p, 'hybrid');
      const bare = buildFieldPrims(p, 'hybrid');
      bare.ne -= 1; // (the mantle is the last ellipsoid)
      const { t } = trunkSpan(p);
      const axis = t.reduce((a, b) => (Math.abs(b.pos[2] - m.c[2]) < Math.abs(a.pos[2] - m.c[2]) ? b : a)).pos[1];
      // how far out the skin is along a ray in the mantle's middle section, at `deg` above the side
      const out = (f: FieldPrims, deg: number) => {
        const dx = Math.cos((deg * Math.PI) / 180), dy = Math.sin((deg * Math.PI) / 180);
        let lo = 0, hi = 3;
        for (let i = 0; i < 40; i++) {
          const s = (lo + hi) / 2;
          if (fieldAt(f, dx * s, axis + dy * s, m.c[2]) > 0) hi = s;
          else lo = s;
        }
        return lo;
      };
      const top = out(prims, 90) - out(bare, 90);
      expect(top, `#${seed} proud of the back`).toBeGreaterThan(0.02);
      let rim = 0;
      for (let deg = 0; deg <= 80; deg += 5) rim = Math.max(rim, out(prims, deg) - out(bare, deg));
      expect(rim / top, `#${seed} no brim`).toBeLessThan(1.5);
      // …and it laps down over the flank
      expect(out(prims, 25) - out(bare, 25), `#${seed} over the flank`).toBeGreaterThan(0.5 * top);
    }
  });
});
