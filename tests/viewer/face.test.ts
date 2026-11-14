import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { dappled, faceMaskOf, headMaskOf, isApe } from '../../src/viewer/face';
import { coatDapple, coatMain } from '../../src/viewer/palette';

describe('bare faces', () => {
  it("an ape's face is bare skin round its eyes and muzzle — the crown and the ears keep their fur", () => {
    // (in full fur with a dog's glossy nose pad, every primate read as a teddy bear)
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'primate'));
      expect(isApe(p), `#${seed}`).toBe(true);
      const f = faceMaskOf(p)!;
      expect(f, `#${seed}`).not.toBeNull();
      const inside = (pos: readonly number[]) => Math.hypot(pos[0] - f.c[0], pos[1] - f.c[1], pos[2] - f.c[2]) < f.r * 0.62;
      for (const n of p.nodes) {
        if (n.terminal === 'eye' || n.terminal === 'mouth') expect(inside(n.pos), `#${seed} ${n.terminal}`).toBe(true);
        if (n.part?.kind === 'ear') expect(inside(n.pos), `#${seed} ear`).toBe(false);
      }
    }
  });

  it('only apes go bare-faced', () => {
    for (const id of ['felid', 'canid', 'ursid', 'ungulate', 'bird', 'lizard']) {
      for (let seed = 1; seed <= 4; seed++) expect(faceMaskOf(grow(genomeOfMorphotype(seed, id))), `${id} #${seed}`).toBeNull();
    }
  });
});

describe('a plain head under bands and stripes', () => {
  it('a banded coat keeps the head one tone: a capsule from the braincase to the snout — a striped one runs on over it', () => {
    // (where a band's edge fell across a face it drew a bill on it — a duck's on a dragon; but a tiger's
    // or a tabby's stripes run on over its face, and kept off it the cat wore a pale hood)
    let banded = 0;
    for (const id of ['dragon', 'wyvern', 'lizard', 'serpent', 'raptor']) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const m = headMaskOf(p);
        const pattern = p.genomeRef.covering.pattern;
        // (plumage wears the mask too, whatever its marking: a bird's head is smooth-feathered — see
        // the covering shader)
        if (pattern !== 'bands' && p.genomeRef.covering.type !== 'feathers') {
          expect(m, `${id} #${seed} (${pattern})`).toBeNull();
          continue;
        }
        banded++;
        expect(m, `${id} #${seed}`).not.toBeNull();
        // it holds the eyes and the mouth, and stays clear of the trunk
        const reach = (q: readonly number[]) => {
          const ab = [m!.b[0] - m!.a[0], m!.b[1] - m!.a[1], m!.b[2] - m!.a[2]];
          const t = Math.max(0, Math.min(1, ((q[0] - m!.a[0]) * ab[0] + (q[1] - m!.a[1]) * ab[1] + (q[2] - m!.a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)));
          return Math.hypot(q[0] - m!.a[0] - ab[0] * t, q[1] - m!.a[1] - ab[1] * t, q[2] - m!.a[2] - ab[2] * t);
        };
        // (the shader keeps it plain within 1.1r of its axis and lets the marking back by 1.5r; eyes and
        // mouth stand on the skin, a little proud of it)
        for (const n of p.nodes.filter((n) => n.terminal === 'eye' || n.terminal === 'mouth')) expect(reach(n.pos), `${id} #${seed} face`).toBeLessThan(1.3 * m!.r);
        // …and the body keeps its marking: the middle of the trunk lies past the fade (a snake's head
        // runs straight on from its trunk, so the first of its trunk may be in it)
        const trunk = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
        expect(reach(trunk[Math.floor(trunk.length / 2)].pos), `${id} #${seed} trunk`).toBeGreaterThan(1.5 * m!.r);
      }
    }
    expect(banded).toBeGreaterThan(8);
  });

  it('a face on the trunk itself (an urchin’s, a slug’s) has no head to keep plain', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'urchin'));
      if (p.genomeRef.covering.pattern === 'bands') expect(headMaskOf(p), `#${seed}`).toBeNull();
    }
  });

  it("a fawn's spots are dapples: small, paler than its coat, its face kept plain", () => {
    // (in a dark umber, big, soft and half-strength all over, a deer's spots were mould: a dark cap on its
    // muzzle, a heart on its brisket)
    const lum = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    let spotted = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'ungulate'));
      const c = p.genomeRef.covering;
      if (c.pattern !== 'spots') continue;
      spotted++;
      expect(dappled(p), `#${seed}`).toBe(true);
      expect(lum(coatDapple(p.genomeRef.palette)) / lum(coatMain(p.genomeRef.palette)), `#${seed} pale`).toBeGreaterThan(1.8);
      expect(0.56 / (0.55 * c.patternScale), `#${seed} small`).toBeLessThan(0.12);
      expect(headMaskOf(p), `#${seed} plain face`).not.toBeNull();
    }
    expect(spotted).toBeGreaterThan(3);
    // (a cat's spots are a cheetah's, as they were)
    for (let seed = 1; seed <= 12; seed++) expect(dappled(grow(genomeOfMorphotype(seed, 'felid')))).toBe(false);
  });
});
