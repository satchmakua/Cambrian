import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { mutate } from '../../src/engine/mutate';
import { SALTATION, breederLitter } from '../../src/engine/selection';
import { land, lineagePlan, LAND_BELOW } from '../../src/engine/landing';
import { coherence } from '../../src/engine/morphospace';
import type { Genome, SegmentGene } from '../../src/engine/genome';

const sections = (g: Genome) => {
  const out: SegmentGene[] = [];
  for (let s: SegmentGene | undefined = g.body; s; s = s.child) out.push(s);
  return out;
};
/** the worst ratio between a section's size and the reference's (trunk to trunk, head to head) */
function worstRatio(g: Genome, ref: Genome): number {
  const a = sections(g), b = sections(ref);
  let w = 1;
  a.forEach((s, i) => {
    const q = b[i === 0 ? 0 : i === a.length - 1 ? b.length - 1 : Math.min(i, Math.max(0, b.length - 2))];
    for (let k = 0; k < 3; k++) w = Math.max(w, s.size[k] / q.size[k], q.size[k] / s.size[k]);
  });
  return w;
}
const structure = (g: Genome) =>
  sections(g).map((s) => s.appendages.map((a) => [a.kind, a.terminal, a.attachT, a.attachAzimuth, a.attachElevation, a.pair, a.roll, a.style]));

/** saltation children of a few founders, as mutate makes them (before any landing) */
function hops(): { parent: Genome; home: string; child: Genome }[] {
  const out: { parent: Genome; home: string; child: Genome }[] = [];
  for (const id of ['felid', 'canid', 'bird', 'raptor', 'ungulate', 'rodent']) {
    for (let seed = 1; seed <= 2; seed++) {
      const parent = genomeOfMorphotype(seed, id);
      const home = lineagePlan(parent);
      for (let stream = 1; stream <= 8; stream++) for (const n of [6, 7]) out.push({ parent, home, child: mutate(parent, stream * 7919 + seed, n, SALTATION) });
    }
  }
  return out;
}

describe('a basin hop lands', () => {
  const all = hops();
  const valley = all.filter(({ child }) => coherence(grow(child)).score < LAND_BELOW);

  it('a hop that comes down near a plan is left as it is', () => {
    const near = all.filter(({ child }) => coherence(grow(child)).score >= LAND_BELOW);
    expect(near.length).toBeGreaterThan(100);
    for (const { child, home } of near) expect(land(child, home)).toBe(child);
  });

  it('a hop that lands nowhere keeps its structure — its sections and its parts, where they were', () => {
    expect(valley.length).toBeGreaterThan(20);
    for (const { parent, child, home } of valley) {
      if (child.symmetry !== parent.symmetry) continue; // (a hop to the other symmetry lands whole: below)
      const landed = land(child, home);
      expect(landed.symmetry).toBe(child.symmetry);
      expect(structure(landed)).toEqual(structure(child));
      expect(land(child, home)).toEqual(landed); // and lands the same way every time
    }
  });

  it("…and takes back its lineage's proportions: swollen and shrunken sections more than halve", () => {
    // (a bird swollen to a sausage, a deer ballooned round on its legs: of the hops that landed nowhere,
    // about a third had a body section more than 1.8 times its parent's, or less than 1/1.8 of it)
    let before = 0;
    let after = 0;
    for (const { parent, child, home } of valley) {
      if (worstRatio(child, parent) > 1.8) before++;
      if (worstRatio(land(child, home), parent) > 1.8) after++;
    }
    expect(before).toBeGreaterThan(5);
    expect(after).toBeLessThan(before * 0.5);
  });

  it('a hop to the other symmetry lands whole: a founder of the nearest plan of its own symmetry, in its lineage\'s colours', () => {
    // (flipped radial, a cat was its legs splayed round a disc, a hawk a heap of feathers: near no plan)
    let seen = 0;
    for (const { parent, child, home } of all) {
      if (child.symmetry === parent.symmetry) continue;
      seen++;
      const landed = land(child, home);
      expect(landed.symmetry, 'keeps the symmetry it hopped to').toBe(child.symmetry);
      expect(landed.palette, "in its lineage's colours").toEqual(child.palette);
      expect(landed.seed).toBe(child.seed);
      // …and comes down in a basin: a plan of its symmetry now reads it as one of its own
      expect(coherence(grow(landed)).score, `${parent.seed}`).toBeGreaterThan(0.5);
    }
    expect(seen).toBeGreaterThan(2);
  });

  it("the breeder's litter lands its saltation children, and only those", () => {
    const parent = genomeOfMorphotype(2, 'bird');
    for (let stream = 1; stream <= 6; stream++) {
      const litter = breederLitter(parent, stream * 7919 + 2);
      for (const n of [6, 7]) expect(litter[n]).toEqual(land(mutate(parent, stream * 7919 + 2, n, SALTATION), lineagePlan(parent)));
    }
  });
});
