import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';

/** the parts that make each of these animals what it is: grown on every one of them, never left to a roll */
const DEFINING: Record<string, ('tail' | 'ear' | 'wing' | 'whisker')[]> = {
  felid: ['tail', 'ear', 'whisker'],
  canid: ['tail', 'ear'],
  rodent: ['tail', 'ear', 'whisker'],
  ungulate: ['ear'],
  lizard: ['tail'],
  bird: ['tail', 'wing'],
  wyvern: ['tail', 'wing'],
};

describe('defining parts', () => {
  it('every cat, dog and lizard has its tail, every cat and mouse its ears, every songbird its tail and wings', () => {
    // (each was a chance of 0.85-0.97, drawn from the same place in every plan's stream: at seed 37 the cat,
    // the dog, the lizard and the songbird all came up tailless together, at seeds 36-37 the mouse earless —
    // a stump of a rump, a bald dome of a head)
    for (const [id, kinds] of Object.entries(DEFINING)) {
      for (let seed = 1; seed <= 200; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        for (const k of kinds) expect(p.nodes.some((n) => n.part?.kind === k), `${id} #${seed} ${k}`).toBe(true);
      }
    }
  });
});
