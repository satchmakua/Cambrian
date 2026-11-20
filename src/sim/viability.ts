/**
 * Viability — how well a body is put together, worked out once, at its birth.
 *
 * Nothing in the valley used to charge for a misbuilt body. A line that gained a limb pair it could not
 * use, or whose limbs grew into one another, paid nothing for it: over eighty generations the two lines
 * that evolved most went from 32 body nodes to as many as 74 and lost their form. In life most such
 * bodies are never born, and the rest pay for what they are. Here they pay the same way (see world.ts):
 *   - a body far gone fails as an embryo: the young is stillborn, the egg never hatches;
 *   - a poorer one costs more to keep up, and mates pass it over.
 *
 * Each measure is taken against the LINE'S FIRST FOUNDER, not an absolute standard: the uncanny plans
 * (a horror, a chimera, a crab packed with legs) start exactly as viable as any other, and only what a
 * line has lost since is charged.
 *   coherence  how clearly it reads as a known plan (morphospace) — what it has lost of its founder's
 *   bloat      its body nodes against its founder's (parts gained by duplication pile up as nodes)
 *   fused      limb chains grown into one another, beyond any its founder had
 *   contortion how near its limbs' curls run to their bounds, beyond its founder's (twisted limbs)
 *   symmetry   a bilateral line gone lopsided
 *
 * Pure: a function of the body and its line's founder.
 */
import type { Phenotype } from '../engine/grow';
import { coherence } from '../engine/morphospace';
import { GENE_BOUNDS } from '../engine/bounds';
import type { AppendageGene, Genome, SegmentGene } from '../engine/genome';

/** Below this a body does not survive to be born. */
export const STILLBORN = 0.25;

export interface Viability {
  /** 0 (could not live) … 1 (as well made as its line's founder) */
  score: number;
  coherenceDrop: number;
  bloat: number;
  fused: number;
  contortion: number;
  asymmetric: boolean;
}

/** limbs: the parts that move or bear a body, which a misbuilt one grows into one another */
const LIMB_KINDS = new Set(['leg', 'arm', 'wing', 'fin', 'tail', 'tentacle']);

const COH = new WeakMap<Phenotype, number>();
function coherenceOf(p: Phenotype): number {
  let c = COH.get(p);
  if (c === undefined) COH.set(p, (c = coherence(p).score));
  return c;
}

const FUSED = new WeakMap<Phenotype, number>();
/** How many pairs of limb chains have grown into one another (beyond their roots, which meet at the body). */
export function fusedChains(p: Phenotype): number {
  const cached = FUSED.get(p);
  if (cached !== undefined) return cached;
  const n = p.nodes.length;
  const parent = new Int32Array(n).fill(-1);
  for (const [a, b] of p.edges) parent[b] = a;
  const chain = new Int32Array(n).fill(-1);
  const root = new Uint8Array(n);
  let next = 0;
  const chainOf = (i: number): number => {
    if (chain[i] !== -1 || p.nodes[i].kind === 'spine') return chain[i];
    const pa = parent[i];
    if (pa < 0) return -1;
    if (p.nodes[pa].kind === 'spine') {
      chain[i] = next++;
      root[i] = 1;
    } else chain[i] = chainOf(pa);
    return chain[i];
  };
  const limb: number[] = [];
  for (let i = 0; i < n; i++) {
    chainOf(i);
    const k = p.nodes[i].part?.kind;
    if (chain[i] >= 0 && !root[i] && k && LIMB_KINDS.has(k)) limb.push(i);
  }
  const pairs = new Set<number>();
  for (let x = 0; x < limb.length; x++) {
    const a = p.nodes[limb[x]];
    for (let y = x + 1; y < limb.length; y++) {
      const ca = chain[limb[x]], cb = chain[limb[y]];
      if (ca === cb) continue;
      const b = p.nodes[limb[y]];
      const dx = a.pos[0] - b.pos[0], dy = a.pos[1] - b.pos[1], dz = a.pos[2] - b.pos[2];
      const reach = 0.6 * (a.radius + b.radius);
      if (dx * dx + dy * dy + dz * dz < reach * reach) pairs.add(Math.min(ca, cb) * 4096 + Math.max(ca, cb));
    }
  }
  FUSED.set(p, pairs.size);
  return pairs.size;
}

/** 0..1: how near its limbs' curls run, on average, to the bounds of what a joint can bend. */
export function contortionOf(g: Genome): number {
  const maxP = GENE_BOUNDS.appendage.curlPitch[1], maxY = GENE_BOUNDS.appendage.curlYaw[1];
  let sum = 0, n = 0;
  const visit = (seg: SegmentGene | undefined) => {
    for (let s = seg; s; s = s.child) {
      for (const a of s.appendages as AppendageGene[]) {
        if (!LIMB_KINDS.has(a.kind)) continue;
        sum += (Math.abs(a.curl[0]) / maxP + Math.abs(a.curl[1]) / maxY) / 2;
        n++;
      }
    }
  };
  visit(g.body);
  return n > 0 ? sum / n : 0;
}

/** A body's viability, measured against its line's first founder (both grown). `plain`, if given, is the
 *  same body with its fins and legs at their kinds' own forms (see AppendageGene.form): coherence and bloat
 *  are read off it. The fin ↔ leg path is a body plan's own way between water and land — a fish on legs
 *  reads as no known plan, yet it is the line's own walking fish, not a misbuilt one — so moving along it
 *  costs nothing here; limbs fused or twisted on the way are still charged, on the body itself. */
export function viabilityOf(p: Phenotype, founder: Phenotype, plain: Phenotype = p): Viability {
  const g = p.genomeRef, fg = founder.genomeRef;
  const coherenceDrop = Math.max(0, coherenceOf(founder) - coherenceOf(plain));
  const bloat = plain.nodes.length / Math.max(1, founder.nodes.length);
  const fused = Math.max(0, fusedChains(p) - fusedChains(founder));
  const contortion = Math.max(0, contortionOf(g) - contortionOf(fg));
  const asymmetric = g.symmetry === 'none' && fg.symmetry !== 'none';
  let pen = 0;
  // (a half-way form between two plans reads less clearly as either: it pays, but can live — the
  // transitions a line makes, from water to land or into the air, pass through such forms)
  pen += 1.6 * Math.max(0, coherenceDrop - 0.08);
  // (steep: parts copied on add mass, and mass pays in a fight — the upkeep has to outweigh it)
  pen += 1.8 * Math.max(0, bloat - 1.12);
  pen += Math.min(0.5, 0.15 * fused);
  pen += 1.2 * Math.max(0, contortion - 0.2);
  if (asymmetric) pen += 0.3;
  return { score: Math.max(0, Math.min(1, 1 - pen)), coherenceDrop, bloat, fused, contortion, asymmetric };
}
