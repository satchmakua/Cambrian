import { describe, it, expect } from 'vitest';
import { grow, developBauplan, legSlots, type Phenotype } from '../../src/engine/grow';
import { randomGenome } from '../../src/engine/random';
import { breederLitter } from '../../src/engine/selection';
import { GENOME_VERSION, type Genome, type AppendageGene } from '../../src/engine/genome';
import { expectBilateralSymmetry, expectValidPhenotype } from './invariants';

function legPart(attachT: number, azimuth: number): AppendageGene {
  return {
    kind: 'leg', style: 0.3, attachT, attachAzimuth: azimuth, attachElevation: 0, roll: 0,
    segments: 3, length: 0.35, thickness: 0.18, taper: 0.8, curl: [0.45, 0], terminal: 'foot', pair: true,
  };
}

/** A minimal bilateral creature with `pairs` legs (all initially attached at mid-body, aim `az`). */
function legged(pairs: number, coherence = 1, az = 4.2): Genome {
  const appendages: AppendageGene[] = [];
  for (let i = 0; i < pairs; i++) appendages.push(legPart(0.5, az));
  return {
    version: GENOME_VERSION, seed: 7, symmetry: 'bilateral', radialCount: 4, coherence,
    covering: { type: 'skin', pattern: 'plain', patternScale: 3, patternContrast: 0, sheen: 0.2 },
    palette: { hueA: 0, hueB: 0, sat: 0.5, light: 0.5 },
    body: {
      size: [0.5, 0.5, 0.6], repeat: 5, taper: 0.95, curve: [0, 0], appendages,
      child: { size: [0.4, 0.4, 0.4], repeat: 2, taper: 0.9, curve: [0, 0], appendages: [] }, // a bare head
    },
  };
}

function faceCount(p: Phenotype): { eyes: number; mouths: number; maxEye: number } {
  const eyes = p.nodes.filter((n) => n.terminal === 'eye');
  const mouths = p.nodes.filter((n) => n.terminal === 'mouth');
  return { eyes: eyes.length, mouths: mouths.length, maxEye: eyes.length ? Math.max(...eyes.map((e) => e.radius)) : 0 };
}

describe('bauplan: structural attractor basins (M24)', () => {
  it('snaps legs onto the canonical slots for their count (front-to-back)', () => {
    for (let pairs = 1; pairs <= 4; pairs++) {
      const legs = developBauplan(legged(pairs))
        .body.appendages.filter((a) => a.kind === 'leg')
        .map((a) => a.attachT)
        .sort((a, b) => a - b);
      const slots = legSlots(pairs);
      legs.forEach((t, i) => expect(Math.abs(t - slots[i])).toBeLessThan(1e-6));
    }
  });

  it('folds legs into the down-and-out band — never pointing up', () => {
    // even an up-pointing leg (azimuth ≈ π/2) is pulled to the lower hemisphere
    for (const az of [Math.PI / 2, 1.2, 0.3, 2.6]) {
      for (const leg of developBauplan(legged(2, 1, az)).body.appendages.filter((a) => a.kind === 'leg')) {
        expect(leg.attachAzimuth).toBeGreaterThan(Math.PI * 0.9); // lower hemisphere (down-ish)
      }
    }
  });

  it('coherence dials the limb pull: 1 spreads to the slots, 0 leaves them clustered', () => {
    const spread = (g: Genome) => {
      const t = developBauplan(g).body.appendages.filter((a) => a.kind === 'leg').map((a) => a.attachT);
      return Math.max(...t) - Math.min(...t);
    };
    expect(spread(legged(2, 1))).toBeGreaterThan(0.4); // pulled apart to [0.2, 0.8]
    expect(spread(legged(2, 0))).toBeLessThan(0.05); // left clustered at the gene (0.5, 0.5)
  });

  it('guarantees a prominent face on every creature (synthesizes it if absent)', () => {
    // the constructed creatures have a bare head — the pass must add eyes + a mouth
    for (let pairs = 0; pairs <= 4; pairs++) {
      const f = faceCount(grow(legged(pairs)));
      expect(f.eyes).toBeGreaterThanOrEqual(2);
      expect(f.mouths).toBeGreaterThanOrEqual(1);
      expect(f.maxEye).toBeGreaterThanOrEqual(0.11);
    }
  });

  it('the face survives heavy mutation — no eyeless/mouthless blobs after 20 generations', () => {
    for (let s = 0; s < 8; s++) {
      let genome = randomGenome(s * 13 + 1);
      for (let gen = 0; gen < 20; gen++) {
        const litter = breederLitter(genome, gen * 7 + 1, 9);
        genome = litter[gen % 2 === 0 ? 7 : 8]; // alternate saltation / confluence — the harshest paths
        const f = faceCount(grow(genome));
        expect(f.eyes).toBeGreaterThanOrEqual(1);
        expect(f.mouths).toBeGreaterThanOrEqual(1);
        expect(f.maxEye).toBeGreaterThanOrEqual(0.11);
      }
    }
  });

  it('keeps the body valid + exactly bilaterally symmetric through the pass', () => {
    for (let pairs = 1; pairs <= 4; pairs++) {
      const p = grow(legged(pairs, 1, 1.3)); // even a broken (up-pointing) leg comes out symmetric
      expectValidPhenotype(p);
      expectBilateralSymmetry(p);
    }
  });

  it('developBauplan is pure (does not mutate its input) and deterministic', () => {
    const g = legged(3, 0.7);
    const before = JSON.stringify(g);
    developBauplan(g);
    expect(JSON.stringify(g)).toBe(before); // input untouched
    expect(grow(g)).toEqual(grow(g));
  });
});
