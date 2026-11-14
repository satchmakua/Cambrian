import { describe, it, expect } from 'vitest';
import { grow } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { mouthVariant } from '../../../src/viewer/partStyles';

describe('slime', () => {
  it('has a slug’s small soft mouth, not a spoked suction ring across its face', () => {
    // (its mouth style fell in the sucker band: a dark ring a third of the body's width, with blades
    // standing round inside it — a jet intake, a drain grate)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'slime'));
      const mouth = p.nodes.find((n) => n.terminal === 'mouth')!;
      // (a soft grazing mouth: shut, it is a single seam in the skin)
      expect(mouthVariant(mouth.part!.style), `#${seed}`).toBe('herbivore');
    }
  });
});
