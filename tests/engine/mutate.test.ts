import { describe, it, expect } from 'vitest';
import { mutate } from '../../src/engine/mutate';
import { breederOffspring, breederLitter } from '../../src/engine/selection';
import { randomGenome, genomeOfMorphotype } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';
import { expectValidPhenotype, expectGenomeWithinBounds } from './invariants';
import type { Genome, PartKind, SegmentGene, Terminal } from '../../src/engine/genome';

describe('mutate', () => {
  it('is deterministic: (parent, streamSeed, n) reproduces the same child (Pillar 3)', () => {
    const parent = randomGenome(7);
    expect(mutate(parent, 123, 0)).toEqual(mutate(parent, 123, 0));
    expect(grow(mutate(parent, 123, 4))).toEqual(grow(mutate(parent, 123, 4)));
  });

  it('does not mutate the parent in place', () => {
    const parent = randomGenome(11);
    const snapshot = structuredClone(parent);
    mutate(parent, 99, 3);
    expect(parent).toEqual(snapshot);
  });

  it('keeps every mutant within GENE_BOUNDS and growable (Pillars 1 & 2)', () => {
    for (let s = 0; s < 200; s++) {
      const parent = randomGenome(s);
      for (let n = 0; n < 9; n++) {
        const child = mutate(parent, s * 31 + 1, n);
        expectGenomeWithinBounds(child);
        expectValidPhenotype(grow(child));
      }
    }
  });

  it('actually changes the creature: a litter shows structural variety', () => {
    const parent = randomGenome(3);
    const litter = breederOffspring(parent, 555, 9);
    const counts = new Set(litter.map((g) => grow(g).nodes.length));
    // not every child differs, but a 9-strong litter should not be uniform
    expect(counts.size).toBeGreaterThan(1);
  });

  it('cumulative selection can drift a trait: greedily picking "more nodes" grows it', () => {
    let parent = randomGenome(20);
    const start = grow(parent).nodes.length;
    for (let gen = 0; gen < 25; gen++) {
      const litter = breederOffspring(parent, gen * 7 + 1, 9);
      // pick the child with the most nodes (a stand-in for a "bigger" pressure)
      parent = litter.reduce((best, g) =>
        grow(g).nodes.length > grow(best).nodes.length ? g : best,
      );
    }
    expect(grow(parent).nodes.length).toBeGreaterThan(start);
  });
});

describe('breederOffspring', () => {
  it('returns the requested count of valid offspring', () => {
    const litter = breederOffspring(randomGenome(1), 42, 9);
    expect(litter).toHaveLength(9);
    for (const g of litter) expectValidPhenotype(grow(g));
  });

  it('a lineage never loses its head: segments are added behind it and dropped from between', () => {
    const rates = { point: 0.1, pointSigma: 0.05, structural: 1, duplication: 0.2, macro: 0 };
    const headed = (g: ReturnType<typeof randomGenome>) => {
      let s = g.body;
      while (s.child) s = s.child;
      return s !== g.body && s.appendages.some((a) => a.terminal === 'mouth');
    };
    for (const kind of ['felid', 'ungulate', 'rodent', 'bird']) {
      let g = genomeOfMorphotype(3, kind);
      expect(headed(g)).toBe(true);
      for (let gen = 0; gen < 60; gen++) {
        g = mutate(g, 1000 + gen, gen, rates);
        expect(headed(g)).toBe(true);
      }
    }
  });

  it("an arthropod keeps its thorax: its legs come and go a pair at a time there, all on the one section", () => {
    // (dropping a faceless section between trunk and head deleted an insect's thorax, all six legs
    // with it, and a lost leg pair could regrow on the abdomen)
    const rates = { point: 0.1, pointSigma: 0.05, structural: 1, duplication: 0, macro: 0 };
    for (const kind of ['insectoid', 'arachnid']) {
      for (const seed of [1, 2, 3, 4]) {
        let g = genomeOfMorphotype(seed, kind);
        const legSections = () => {
          const out: number[] = [];
          for (let s: typeof g.body | undefined = g.body, k = 0; s; s = s.child, k++) if (s.appendages.some((a) => a.kind === 'leg')) out.push(k);
          return out;
        };
        expect(legSections()).toEqual([1]);
        let legless = false; // (a lineage that loses every leg regrows them on its trunk)
        for (let gen = 0; gen < 80; gen++) {
          g = mutate(g, 7000 + gen, gen, rates, true);
          const at = legSections();
          expect(at.length, `${kind} #${seed} gen ${gen}`).toBeLessThanOrEqual(1);
          legless ||= at.length === 0;
          if (!legless) expect(at[0], `${kind} #${seed} gen ${gen}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});

// Breeding stays coherent: a mutant is still a creature, not a jumble of mismatched pieces. Five
// generations down the exploratory and the saltation lines of six familiar founders.
describe('bred offspring stay coherent', () => {
  const TIPS: Record<PartKind, Terminal[]> = {
    leg: ['foot', 'claw', 'paw', 'hoof'], arm: ['hand', 'claw', 'pincer', 'paw'], wing: ['fin'], fin: ['fin'],
    tail: ['none', 'fin', 'barb', 'club', 'claw'], horn: ['claw'], spine: ['claw', 'none'], frill: ['fin'], antenna: ['none'],
    tentacle: ['none', 'claw'], eyestalk: ['eye'], maw: ['mouth'], plate: ['none', 'carapace'], ear: ['ear'], gill: ['gill'], crest: ['crest'], whisker: ['whisker'],
  };
  const HEAD = new Set<PartKind>(['ear', 'horn', 'crest', 'whisker', 'antenna']);
  const sections = (g: Genome) => {
    const out: SegmentGene[] = [];
    for (let s: SegmentGene | undefined = g.body; s; s = s.child) out.push(s);
    return out;
  };
  const isFace = (t: Terminal) => t === 'eye' || t === 'mouth';
  const lineage = (): Genome[] => {
    const all: Genome[] = [];
    for (const [id, seed] of [['canid', 5], ['felid', 3], ['bird', 5], ['lizard', 5], ['ungulate', 4], ['primate', 2]] as const) {
      let parents: Genome[] = [genomeOfMorphotype(seed, id)];
      for (let gen = 1; gen <= 5; gen++) {
        const next: Genome[] = [];
        parents.forEach((p, pi) => {
          const litter = breederLitter(p, 7000 + gen * 131 + pi * 17 + seed, 9);
          all.push(...litter);
          next.push(litter[3], litter[6]);
        });
        parents = next.slice(0, 6);
      }
    }
    return all;
  };
  const kids = lineage();

  it("every part's tip fits its kind: no horn ends in a hoof, no leg in an eye, no ear in a fin", () => {
    // (any tip on any part: half of the offspring carried a mismatched one)
    for (const c of kids)
      for (const s of sections(c))
        for (const a of s.appendages) if (!isFace(a.terminal)) expect(TIPS[a.kind], `${a.kind} → ${a.terminal}`).toContain(a.terminal);
  });

  it("no offspring grows a second face, and a head's parts grow on the head", () => {
    // (a fresh maw or eye on a flank counted as the face, which is never removed: a lineage gathered
    // mouths down its body; a duplicated head grew a second skull out of the first one's face)
    let offHead = 0;
    for (const c of kids) {
      const chain = sections(c);
      expect(chain.filter((s) => s.appendages.some((a) => isFace(a.terminal))).length).toBeLessThanOrEqual(1);
      if (chain.length > 1 && chain.slice(0, -1).some((s) => s.appendages.some((a) => HEAD.has(a.kind)))) offHead++;
    }
    expect(offHead / kids.length).toBeLessThan(0.08);
  });

  it('a conservative child keeps its proportions, and an exploratory litter still explores', () => {
    // (each step a share of a gene's whole range — 0.15–2.5 bu for a size — doubled or halved a
    // dimension in one conservative child in five and three exploratory ones in five)
    const doubled = { conservative: 0, exploratory: 0 };
    const counts = { conservative: 0, exploratory: 0 };
    for (const id of ['canid', 'felid', 'ungulate', 'ursid', 'bird', 'lizard', 'primate', 'mustelid']) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = genomeOfMorphotype(seed, id);
        const ps = sections(p);
        breederLitter(p, 5000 + seed * 7, 9).forEach((c, k) => {
          if (k > 5) return;
          const kind = k < 3 ? 'conservative' : 'exploratory';
          const cs = sections(c);
          if (cs.length !== ps.length) return;
          counts[kind]++;
          const big = cs.some((sg, i) => sg.size.some((v, a) => Math.abs(Math.log(v / ps[i].size[a])) > Math.log(2)) || Math.abs(Math.log(sg.repeat / ps[i].repeat)) > Math.log(2));
          if (big) doubled[kind]++;
        });
      }
    }
    expect(doubled.conservative / counts.conservative).toBeLessThan(0.02);
    expect(doubled.exploratory / counts.exploratory).toBeGreaterThan(0.05);
    expect(doubled.exploratory / counts.exploratory).toBeLessThan(0.4);
  });
});
