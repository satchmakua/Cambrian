import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { defaultGenome, type Genome, type SegmentGene, type Symmetry } from '../../src/engine/genome';
import { R_MIN, NODE_MAX, GENE_BOUNDS } from '../../src/engine/bounds';
import { mulberry32, range, type Rng } from '../../src/engine/rng';

/** Assert every §4.4 growth invariant on a phenotype. This is Pillar 2's guarantee. */
function expectValid(p: Phenotype): void {
  expect(p.nodes.length).toBeGreaterThan(0);
  expect(p.nodes.length).toBeLessThanOrEqual(NODE_MAX);

  // single connected tree: every non-root node has exactly one parent edge
  expect(p.edges.length).toBe(p.nodes.length - 1);

  for (const n of p.nodes) {
    expect(n.radius).toBeGreaterThanOrEqual(R_MIN);
    expect(n.pos.every(Number.isFinite)).toBe(true);
    expect(n.quat.every(Number.isFinite)).toBe(true);
  }
  for (const [i, j] of p.edges) {
    expect(i).toBeGreaterThanOrEqual(0);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(p.nodes.length);
    expect(j).toBeLessThan(p.nodes.length);
  }
  // bounds are finite
  expect(p.bounds.min.every(Number.isFinite)).toBe(true);
  expect(p.bounds.max.every(Number.isFinite)).toBe(true);
}

describe('grow', () => {
  it('is a pure deterministic function of the genome (Pillar 3)', () => {
    const g = defaultGenome(0xabc123);
    expect(grow(g)).toEqual(grow(g));
  });

  it('grows the demo creature with a body, mirrored limbs, and a head', () => {
    const p = grow(defaultGenome());
    expectValid(p);
    expect(p.nodes.length).toBeGreaterThan(15); // spine + legs + fin + head + eyes
    expect(p.nodes.some((n) => n.terminal === 'foot')).toBe(true);
    expect(p.nodes.some((n) => n.terminal === 'eye')).toBe(true);
  });

  it('changing the seed perturbs the form but keeps it valid', () => {
    const a = grow(defaultGenome(1));
    const b = grow(defaultGenome(2));
    expectValid(a);
    expectValid(b);
    // jitter changes positions; structure (node count) stays the same
    expect(a.nodes.length).toBe(b.nodes.length);
    expect(a.nodes[a.nodes.length - 1].pos).not.toEqual(b.nodes[b.nodes.length - 1].pos);
  });

  it('survives 2000 wildly random genomes without violating an invariant (fuzz)', () => {
    for (let s = 0; s < 2000; s++) {
      const p = grow(randomGenome(s));
      expectValid(p);
    }
  });
});

// --- a fuzz generator that stresses topology (test-only; real random genomes are M1) ---

function randomGenome(seed: number): Genome {
  const rng = mulberry32(seed >>> 0);
  const sym: Symmetry = (['bilateral', 'radial', 'none'] as const)[Math.floor(rng() * 3)];
  return {
    version: 1,
    seed: (rng() * 0xffffffff) >>> 0,
    symmetry: sym,
    radialCount: Math.round(range(rng, GENE_BOUNDS.radialCount[0], GENE_BOUNDS.radialCount[1])),
    palette: { hueA: rng(), hueB: rng(), sat: rng(), light: range(rng, 0.2, 0.8) },
    body: randomSegment(rng, 0),
  };
}

function randomSegment(rng: Rng, depth: number): SegmentGene {
  const B = GENE_BOUNDS.segment;
  const appendageCount = Math.round(range(rng, B.appendageCount[0], B.appendageCount[1]));
  const seg: SegmentGene = {
    size: [range(rng, ...B.size), range(rng, ...B.size), range(rng, ...B.size)],
    repeat: Math.round(range(rng, B.repeat[0], B.repeat[1])),
    taper: range(rng, ...B.taper),
    curve: [range(rng, ...B.curvePitch), range(rng, ...B.curveYaw)],
    appendages: Array.from({ length: appendageCount }, () => randomAppendage(rng)),
  };
  // deliberately try to recurse *deeper* than DEPTH_MAX to prove grow caps it
  if (depth < 6 && rng() < 0.6) seg.child = randomSegment(rng, depth + 1);
  return seg;
}

function randomAppendage(rng: Rng) {
  const A = GENE_BOUNDS.appendage;
  const terminals = ['none', 'foot', 'fin', 'claw', 'eye'] as const;
  return {
    attachT: range(rng, ...A.attachT),
    attachAzimuth: range(rng, ...A.attachAzimuth),
    segments: Math.round(range(rng, A.segments[0], A.segments[1])),
    length: range(rng, ...A.length),
    thickness: range(rng, ...A.thickness),
    taper: range(rng, ...A.taper),
    curl: [range(rng, ...A.curlPitch), range(rng, ...A.curlYaw)] as [number, number],
    terminal: terminals[Math.floor(rng() * terminals.length)],
    pair: rng() < 0.5,
  };
}
