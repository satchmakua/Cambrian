/**
 * Landing a basin hop.
 *
 * A breeder litter's saltation children are bursts of structural change, and one in five came down
 * between plans, near none of them (a closeness under LAND_BELOW): a bird swollen to a sausage, a
 * deer ballooned round on its legs, a dog with a chest like a barrel. Such a child now lands. It keeps
 * its structure — which parts it has, and where — and its proportions are drawn part of the way
 * (LAND_PULL) back toward a founder of its LINEAGE's plan (the plan its parent is nearest): each body
 * section toward that founder's (trunk to trunk, head to head, the sections between in order), its
 * size, link count, taper and bend; and each part toward the founder's part of the same kind (the
 * first leg toward the first leg, and so on), its length, thickness, link count, taper and bend.
 * (Drawn toward the plan the child itself was nearest, it took that plan's proportions on its own
 * body: a ballooned deer, nearest a shark by the coarse measure, lay out long and low as a shark
 * does.) A child already near a plan is left as it is; one whose symmetry its lineage's plan doesn't
 * share (a hop to radial) lands whole in the nearest plan of its own symmetry (hopAcross). Pure and
 * deterministic: the founders are drawn from the child's own seed.
 */
import { grow } from './grow';
import { coherence, nearestKinds } from './morphospace';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from './random';
import { mix32 } from './rng';
import { clamp, GENE_BOUNDS } from './bounds';
import type { AppendageGene, Genome, SegmentGene } from './genome';

/** a child this far from every plan (closeness, 0..1) has come down in a valley */
export const LAND_BELOW = 0.3;
/** how far a landing child's proportions are drawn toward its nearest plan's (0 stays, 1 becomes) */
export const LAND_PULL = 0.7;

const B = GENE_BOUNDS.segment;
const A = GENE_BOUNDS.appendage;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** a scale gene steps by a share of itself, so it is drawn in proportion, not in body units */
const logLerp = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));

function sections(g: Genome): SegmentGene[] {
  const out: SegmentGene[] = [];
  for (let s: SegmentGene | undefined = g.body; s; s = s.child) out.push(s);
  return out;
}

/** Which of the founder's sections each of the child's is drawn toward: first to first, last to
 *  last, and those between in order (or the founder's last but one, when it has fewer). */
function sectionMatch(n: number, m: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 0 : i === n - 1 ? m - 1 : Math.min(i, Math.max(0, m - 2))));
}

function pullPart(a: AppendageGene, b: AppendageGene, t: number): void {
  a.length = clamp(logLerp(a.length, b.length, t), A.length);
  a.thickness = clamp(logLerp(a.thickness, b.thickness, t), A.thickness);
  a.segments = clamp(Math.round(lerp(a.segments, b.segments, t)), A.segments);
  a.taper = clamp(lerp(a.taper, b.taper, t), A.taper);
  a.curl = [clamp(lerp(a.curl[0], b.curl[0], t), A.curlPitch), clamp(lerp(a.curl[1], b.curl[1], t), A.curlYaw)];
}

function pullSection(s: SegmentGene, q: SegmentGene, t: number): void {
  for (let k = 0; k < 3; k++) s.size[k] = clamp(logLerp(s.size[k], q.size[k], t), B.size);
  s.repeat = clamp(Math.round(lerp(s.repeat, q.repeat, t)), B.repeat);
  s.taper = clamp(lerp(s.taper, q.taper, t), B.taper);
  s.curve = [clamp(lerp(s.curve[0], q.curve[0], t), B.curvePitch), clamp(lerp(s.curve[1], q.curve[1], t), B.curveYaw)];
  // each part toward the founder's part of its kind, in order (a part with no counterpart is let be)
  const theirs = new Map<string, AppendageGene[]>();
  for (const b of q.appendages) {
    const list = theirs.get(b.kind);
    if (list) list.push(b);
    else theirs.set(b.kind, [b]);
  }
  const taken = new Map<string, number>();
  for (const a of s.appendages) {
    const k = taken.get(a.kind) ?? 0;
    const b = theirs.get(a.kind)?.[k];
    if (!b) continue;
    taken.set(a.kind, k + 1);
    pullPart(a, b, t);
  }
}

/** each plan's symmetry, as its founders are drawn (found once) */
let SYMMETRY: Map<string, Genome['symmetry']> | null = null;
function symmetryOf(id: string): Genome['symmetry'] {
  SYMMETRY ??= new Map(MORPHOTYPE_IDS.map((k) => [k, genomeOfMorphotype(1, k).symmetry]));
  return SYMMETRY.get(id)!;
}

/**
 * A hop to the other symmetry lands whole: it becomes a founder of the nearest plan that shares its
 * symmetry, in its lineage's colours (its palette and seed). Bilateral proportions don't mend a
 * radial body: flipped radial, a cat was its legs splayed round a disc, a hawk a heap of feathers —
 * one saltation child in twelve, near no plan at all. As a basin hop should, it now comes down in a
 * basin: a sea urchin, an octopus, in the cat's coat colours.
 */
function hopAcross(child: Genome, body: ReturnType<typeof grow>): Genome {
  const there = nearestKinds(body, MORPHOTYPE_IDS.length).find((k) => symmetryOf(k.id) === child.symmetry);
  if (!there) return child;
  const founder = genomeOfMorphotype(mix32(child.seed, 0x40b), there.id);
  return { ...founder, seed: child.seed, palette: structuredClone(child.palette) };
}

/** The plan a lineage belongs to: the one its parent is nearest. */
export function lineagePlan(parent: Genome): string {
  return coherence(grow(parent)).nearest;
}

/** Land a basin hop: the child as it is if it is near a plan, else drawn back toward its lineage's
 *  plan's proportions (`home`, or the parent's nearest plan, found when needed) — or, if it hopped to
 *  the other symmetry, landed whole in that symmetry's nearest plan (see hopAcross). */
export function land(child: Genome, home: string | (() => string)): Genome {
  const body = grow(child);
  if (coherence(body).score >= LAND_BELOW) return child;
  const founder = genomeOfMorphotype(mix32(child.seed, 0x1a4d), typeof home === 'function' ? home() : home);
  if (founder.symmetry !== child.symmetry) return hopAcross(child, body);
  const out = structuredClone(child);
  const mine = sections(out);
  const theirs = sections(founder);
  const match = sectionMatch(mine.length, theirs.length);
  mine.forEach((s, i) => pullSection(s, theirs[match[i]], LAND_PULL));
  return out;
}
