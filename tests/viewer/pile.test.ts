import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { pileLength } from '../../src/viewer/CreatureMesh';

/** the trunk's girth: its fattest link's narrowest half-width */
function girthOf(id: string, seed: number): { len: number; girth: number } {
  const p = grow(genomeOfMorphotype(seed, id));
  let girth = 0;
  for (const n of p.nodes) if (n.kind === 'spine' && (n.segment ?? 0) === 0) girth = Math.max(girth, n.radius * Math.min(n.scale?.[0] ?? 1, n.scale?.[1] ?? 1));
  return { len: pileLength(p), girth };
}

describe('fur pile', () => {
  it("a weasel's coat is a short dense pile — not the shaggiest of all, a ball of fur seen from the front", () => {
    // (scaled by its length alone, a long slim weasel wore a pile a sixth of its girth deep, where a cat's
    // or a dog's is a tenth and a bear's less)
    for (let seed = 1; seed <= 8; seed++) {
      for (const id of ['mustelid', 'felid', 'canid', 'ursid', 'rodent']) {
        const { len, girth } = girthOf(id, seed);
        expect(len / girth, `${id} #${seed}`).toBeLessThanOrEqual(0.105);
      }
      // …while a cat keeps the coat it had (its pile is set by its size, its girth only caps it)
      const cat = girthOf('felid', seed);
      expect(cat.len / cat.girth, `felid #${seed}`).toBeGreaterThan(0.08);
    }
  });
});
