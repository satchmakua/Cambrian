import { expect } from 'vitest';
import type { Phenotype } from '../../src/engine/grow';
import type { Genome, SegmentGene, AppendageGene } from '../../src/engine/genome';
import { R_MIN, NODE_MAX, GENE_BOUNDS } from '../../src/engine/bounds';

/** Assert every §4.4 growth invariant on a phenotype. This is Pillar 2's guarantee. */
export function expectValidPhenotype(p: Phenotype): void {
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
  expect(p.bounds.min.every(Number.isFinite)).toBe(true);
  expect(p.bounds.max.every(Number.isFinite)).toBe(true);
}

/** Assert a bilateral phenotype is exactly mirror-symmetric across X=0 (M18). */
export function expectBilateralSymmetry(p: Phenotype): void {
  for (const n of p.nodes) {
    let best = Infinity;
    for (const m of p.nodes) {
      const d =
        Math.abs(m.pos[0] + n.pos[0]) + // mirror: m.x ≈ −n.x
        Math.abs(m.pos[1] - n.pos[1]) +
        Math.abs(m.pos[2] - n.pos[2]) +
        Math.abs(m.radius - n.radius);
      if (d < best) best = d;
    }
    expect(best).toBeLessThan(1e-4); // every node has a mirror partner
  }
}

/** Assert every mutable gene in a genome sits inside GENE_BOUNDS (Pillar 1). */
export function expectGenomeWithinBounds(g: Genome): void {
  inBounds(g.radialCount, GENE_BOUNDS.radialCount);
  inBounds(g.covering.patternScale, GENE_BOUNDS.covering.patternScale);
  inBounds(g.covering.patternContrast, GENE_BOUNDS.covering.patternContrast);
  inBounds(g.covering.sheen, GENE_BOUNDS.covering.sheen);
  inBounds(g.palette.sat, GENE_BOUNDS.palette.sat);
  inBounds(g.palette.light, GENE_BOUNDS.palette.light);
  checkSegment(g.body);
}

function checkSegment(seg: SegmentGene): void {
  const B = GENE_BOUNDS.segment;
  for (const s of seg.size) inBounds(s, B.size);
  inBounds(seg.repeat, B.repeat);
  inBounds(seg.taper, B.taper);
  inBounds(seg.curve[0], B.curvePitch);
  inBounds(seg.curve[1], B.curveYaw);
  inBounds(seg.appendages.length, B.appendageCount);
  for (const app of seg.appendages) checkAppendage(app);
  if (seg.child) checkSegment(seg.child);
}

function checkAppendage(app: AppendageGene): void {
  const A = GENE_BOUNDS.appendage;
  inBounds(app.style, A.style);
  inBounds(app.attachT, A.attachT);
  inBounds(app.attachAzimuth, A.attachAzimuth);
  inBounds(app.attachElevation, A.attachElevation);
  inBounds(app.roll, A.roll);
  inBounds(app.segments, A.segments);
  inBounds(app.length, A.length);
  inBounds(app.thickness, A.thickness);
  inBounds(app.taper, A.taper);
  inBounds(app.curl[0], A.curlPitch);
  inBounds(app.curl[1], A.curlYaw);
}

function inBounds(v: number, [min, max]: readonly [number, number]): void {
  expect(v).toBeGreaterThanOrEqual(min);
  expect(v).toBeLessThanOrEqual(max);
}
