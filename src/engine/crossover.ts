/**
 * Crossover — the child of two parents (the valley's sexual reproduction).
 *
 * The child's body PLAN comes whole from one parent, picked by the stream: its segment chain and
 * how often each segment repeats, its appendages (their kinds, tips, pairing and articulation), its
 * symmetry and its covering's kind. A cross between two plans therefore never grows a chimera of
 * half-matched parts. Each NUMERIC gene is then taken from either parent, gene by gene, wherever the
 * other parent has the same gene in the same place: the same segment along the chain, the same
 * appendage (the same kind, in the same order among parts of that kind on that segment). A gene only
 * the plan's parent has comes from it. Both parents' genes lie within their bounds, so the child's do
 * too, and growth's own caps hold for it as for any genome.
 *
 * Mendelian rather than blended: each gene is one parent's value, so a population keeps its
 * variation instead of averaging it away, while good genes from two lines can meet in one child.
 *
 * Pure and deterministic (Pillar 3): `crossover(a, b, seed)` always gives the same child.
 */
import { mulberry32, mix32, type Rng } from './rng';
import type { AppendageGene, Genome, SegmentGene } from './genome';

const SALT = 0xc4055;

export function crossover(a: Genome, b: Genome, seed: number): Genome {
  const rng = mulberry32(mix32(seed >>> 0, a.seed, b.seed, SALT));
  const planA = rng() < 0.5;
  const plan = planA ? a : b;
  const other = planA ? b : a;
  const g = structuredClone(plan) as Genome;
  // its own growth jitter, from both parents' and the cross's
  g.seed = mix32(a.seed, b.seed, seed >>> 0);

  g.coherence = pick(rng, plan.coherence ?? 1, other.coherence ?? 1);
  if (g.symmetry === 'radial' && other.symmetry === 'radial') g.radialCount = pick(rng, plan.radialCount, other.radialCount);
  g.covering.pattern = pick(rng, plan.covering.pattern, other.covering.pattern);
  g.covering.patternScale = pick(rng, plan.covering.patternScale, other.covering.patternScale);
  g.covering.patternContrast = pick(rng, plan.covering.patternContrast, other.covering.patternContrast);
  g.covering.sheen = pick(rng, plan.covering.sheen, other.covering.sheen);
  g.palette.hueA = pick(rng, plan.palette.hueA, other.palette.hueA);
  g.palette.hueB = pick(rng, plan.palette.hueB, other.palette.hueB);
  g.palette.sat = pick(rng, plan.palette.sat, other.palette.sat);
  g.palette.light = pick(rng, plan.palette.light, other.palette.light);

  // down the chain together, as far as both reach
  let seg: SegmentGene | undefined = g.body;
  let o: SegmentGene | undefined = other.body;
  while (seg && o) {
    crossSegment(rng, seg, o);
    seg = seg.child;
    o = o.child;
  }
  return g;
}

/** A segment's numbers, then each of its appendages against its counterpart. */
function crossSegment(rng: Rng, seg: SegmentGene, o: SegmentGene): void {
  for (let i = 0; i < 3; i++) seg.size[i] = pick(rng, seg.size[i], o.size[i]);
  seg.taper = pick(rng, seg.taper, o.taper);
  seg.curve[0] = pick(rng, seg.curve[0], o.curve[0]);
  seg.curve[1] = pick(rng, seg.curve[1], o.curve[1]);
  const seen = new Map<string, number>();
  for (const ap of seg.appendages) {
    const n = seen.get(ap.kind) ?? 0;
    seen.set(ap.kind, n + 1);
    const twin = nthOfKind(o.appendages, ap.kind, n);
    if (twin) crossAppendage(rng, ap, twin);
  }
}

function nthOfKind(list: AppendageGene[], kind: AppendageGene['kind'], n: number): AppendageGene | undefined {
  let k = 0;
  for (const ap of list) {
    if (ap.kind !== kind) continue;
    if (k === n) return ap;
    k++;
  }
  return undefined;
}

/** An appendage's numbers. Its kind, tip, pairing and joint count are the plan's (they are its shape). */
function crossAppendage(rng: Rng, ap: AppendageGene, o: AppendageGene): void {
  ap.style = pick(rng, ap.style, o.style);
  ap.attachT = pick(rng, ap.attachT, o.attachT);
  ap.attachAzimuth = pick(rng, ap.attachAzimuth, o.attachAzimuth);
  ap.attachElevation = pick(rng, ap.attachElevation, o.attachElevation);
  ap.roll = pick(rng, ap.roll, o.roll);
  ap.length = pick(rng, ap.length, o.length);
  ap.thickness = pick(rng, ap.thickness, o.thickness);
  ap.taper = pick(rng, ap.taper, o.taper);
  ap.curl[0] = pick(rng, ap.curl[0], o.curl[0]);
  ap.curl[1] = pick(rng, ap.curl[1], o.curl[1]);
  if (ap.web !== undefined && o.web !== undefined) ap.web = pick(rng, ap.web, o.web);
}

/** One parent's value or the other's, evenly. */
function pick<T>(rng: Rng, mine: T, theirs: T): T {
  return rng() < 0.5 ? mine : theirs;
}
