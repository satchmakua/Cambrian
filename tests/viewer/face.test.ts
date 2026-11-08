import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { faceMaskOf, isApe } from '../../src/viewer/face';

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
