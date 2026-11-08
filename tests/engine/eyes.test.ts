import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS, randomGenome } from '../../src/engine/random';
import { qRotateV } from '../../src/viewer/bodyField';

/** The closest mirrored eye pair's centre gap, in ball diameters (Infinity when there is no pair). */
function pairGap(p: Phenotype): number {
  const eyes = p.nodes.filter((n) => n.terminal === 'eye');
  let gap = Infinity;
  for (const a of eyes) {
    for (const b of eyes) {
      if (a === b || a.pos[0] <= 0) continue;
      if (Math.abs(a.pos[0] + b.pos[0]) > 1e-3 || Math.abs(a.pos[1] - b.pos[1]) > 1e-3 || Math.abs(a.pos[2] - b.pos[2]) > 1e-3) continue;
      gap = Math.min(gap, (a.pos[0] - b.pos[0]) / (a.radius + b.radius));
    }
  }
  return gap;
}

/** Mean forward (+Z) component of a morphotype's eye aims over a run of seeds. */
function meanGaze(id: string): number {
  let s = 0;
  let n = 0;
  for (let seed = 1; seed <= 12; seed++) {
    for (const e of grow(genomeOfMorphotype(seed, id)).nodes) {
      if (e.terminal !== 'eye') continue;
      s += qRotateV(e.quat, [0, 0, 1])[2];
      n++;
    }
  }
  return s / n;
}

describe('eyes', () => {
  it('a pair of eyes never merges into one on the midline', () => {
    // a crocodile's, frog's or crab's eyes were aimed near straight up, so the mirrored pair landed
    // on top of each other as one cyclops ball (gaps of 0.02–0.3 diameters)
    for (const id of MORPHOTYPE_IDS) {
      for (let seed = 1; seed <= 12; seed++) expect(pairGap(grow(genomeOfMorphotype(seed, id))), `${id} #${seed}`).toBeGreaterThan(0.9);
    }
    for (let seed = 1; seed <= 300; seed++) expect(pairGap(grow(randomGenome(seed))), `random #${seed}`).toBeGreaterThan(0.9);
  });

  it('hunters and apes look forward; grazers and gnawers look out to the sides', () => {
    for (const id of ['felid', 'primate']) expect(meanGaze(id), id).toBeGreaterThan(0.82);
    for (const id of ['ungulate', 'rodent']) expect(meanGaze(id), id).toBeLessThan(0.62);
    // a fish looks out of its sides (it used to stare ~43° forward over its snout, like an ape)
    for (const id of ['fish', 'shark']) expect(meanGaze(id), id).toBeLessThan(0.45);
  });
});
