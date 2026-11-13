/**
 * Mutation (DESIGN §4.5) — the engine of evolvability (Pillar 1).
 *
 * `mutate(parent, streamSeed, n)` produces the n-th offspring *deterministically*:
 * its genome is reproducible from (parentGenome, streamSeed, n), which is what makes
 * a whole lineage replayable (Pillar 3). Four operator classes, all bounded so every
 * mutant stays viable:
 *   - point        — jitter numeric genes (fine-tuning)
 *   - structural   — repeat ±1, add/remove appendage, change terminal, add/remove a
 *                    child segment, flip symmetry (the leaps)
 *   - duplication  — copy a segment or appendage subtree (extra limbs / longer bodies)
 *   - macro        — several structural ops at once (escape a plateau)
 */
import { mulberry32, mix32, range, type Rng } from './rng';
import { GENE_BOUNDS, DEPTH_MAX, clamp } from './bounds';
import type { Genome, SegmentGene, AppendageGene, Symmetry, Terminal, PartKind, CoveringType, PatternType } from './genome';
import { legBearer } from './grow';

const OP_SALT = 0x9e3779b9;

/** Per-offspring operator rates. Tunable — defaults from DESIGN §4.5. */
export interface MutationRates {
  point: number; // probability EACH numeric gene is jittered
  pointSigma: number; // Gaussian σ as a fraction of the gene's range
  structural: number; // probability of one structural op
  duplication: number; // probability of a duplication op
  macro: number; // probability of a macro burst (3–5 structural ops)
}

export const DEFAULT_RATES: MutationRates = {
  point: 0.3,
  pointSigma: 0.08,
  structural: 0.15,
  duplication: 0.08,
  macro: 0.02,
};

export function mutate(
  parent: Genome,
  streamSeed: number,
  n: number,
  rates: MutationRates = DEFAULT_RATES,
  lockSymmetry = false,
): Genome {
  const g = structuredClone(parent) as Genome;
  g.seed = mix32(parent.seed, streamSeed, n); // reproducible growth jitter for this child
  const rng = mulberry32(mix32(streamSeed, parent.seed, n, OP_SALT));

  applyPointMutations(g, rng, rates);
  if (rng() < rates.structural) applyStructural(g, rng, lockSymmetry);
  if (rng() < rates.duplication) applyDuplication(g, rng);
  if (rng() < rates.macro) {
    const k = 3 + Math.floor(rng() * 3); // 3–5
    for (let i = 0; i < k; i++) applyStructural(g, rng, lockSymmetry);
  }
  return g;
}

// --- point mutation ----------------------------------------------------------

function applyPointMutations(g: Genome, rng: Rng, rates: MutationRates): void {
  const B = GENE_BOUNDS.segment;
  const A = GENE_BOUNDS.appendage;
  const P = GENE_BOUNDS.palette;
  const r = rates.point;
  const s = rates.pointSigma;

  const C = GENE_BOUNDS.covering;
  g.radialCount = jitterInt(rng, g.radialCount, GENE_BOUNDS.radialCount, r, s);
  g.coherence = jitter(rng, g.coherence ?? 1, COH_BOUND, r, s); // the weirdness dial drifts too (M24)
  g.covering.patternScale = jitter(rng, g.covering.patternScale, C.patternScale, r, s);
  g.covering.patternContrast = jitter(rng, g.covering.patternContrast, C.patternContrast, r, s);
  g.covering.sheen = jitter(rng, g.covering.sheen, C.sheen, r, s);
  g.palette.hueA = jitter(rng, g.palette.hueA, P.hue, r, s);
  g.palette.hueB = jitter(rng, g.palette.hueB, P.hue, r, s);
  g.palette.sat = jitter(rng, g.palette.sat, P.sat, r, s);
  g.palette.light = jitter(rng, g.palette.light, P.light, r, s);

  for (const seg of segments(g)) {
    seg.size[0] = jitterScale(rng, seg.size[0], B.size, r, s);
    seg.size[1] = jitterScale(rng, seg.size[1], B.size, r, s);
    seg.size[2] = jitterScale(rng, seg.size[2], B.size, r, s);
    seg.repeat = jitterCount(rng, seg.repeat, B.repeat, r, s);
    seg.taper = jitter(rng, seg.taper, B.taper, r, s);
    seg.curve[0] = jitter(rng, seg.curve[0], B.curvePitch, r, s);
    seg.curve[1] = jitter(rng, seg.curve[1], B.curveYaw, r, s);
    for (const a of seg.appendages) {
      a.style = jitter(rng, a.style, A.style, r, s);
      a.attachT = jitter(rng, a.attachT, A.attachT, r, s);
      a.attachAzimuth = jitter(rng, a.attachAzimuth, A.attachAzimuth, r, s);
      a.attachElevation = jitter(rng, a.attachElevation, A.attachElevation, r, s);
      a.roll = jitter(rng, a.roll, A.roll, r, s);
      a.segments = jitterCount(rng, a.segments, A.segments, r, s);
      a.length = jitterScale(rng, a.length, A.length, r, s);
      a.thickness = jitterScale(rng, a.thickness, A.thickness, r, s);
      a.taper = jitter(rng, a.taper, A.taper, r, s);
      a.curl[0] = jitter(rng, a.curl[0], A.curlPitch, r, s);
      a.curl[1] = jitter(rng, a.curl[1], A.curlYaw, r, s);
    }
  }
}

function jitter(rng: Rng, v: number, bound: readonly [number, number], rate: number, sigma: number): number {
  if (rng() >= rate) return v;
  const [min, max] = bound;
  return clamp(v + gaussian(rng) * sigma * (max - min), bound);
}
function jitterInt(rng: Rng, v: number, bound: readonly [number, number], rate: number, sigma: number): number {
  return Math.round(jitter(rng, v, bound, rate, sigma));
}

/**
 * A SCALE gene (a size, a length, a thickness) varies by a share of itself: a log-normal step,
 * SCALE_STEP×sigma wide. Stepped by a share of its whole range (0.15–2.5 bu for a size), a child of
 * a "conservative" litter had a dimension doubled or halved one time in five, an exploratory one
 * three times in five: a fox's litter held a worm curled up on a sliver of a trunk.
 */
const SCALE_STEP = 3.4;
function jitterScale(rng: Rng, v: number, bound: readonly [number, number], rate: number, sigma: number): number {
  if (rng() >= rate) return v;
  return clamp(v * Math.exp(gaussian(rng) * sigma * SCALE_STEP), bound);
}
/** …and a COUNT of links by a share of itself, at least as if it were two (so a single link can grow),
 *  half as freely: the links are what a limb reads as — four a cat's leg, six an insect's */
function jitterCount(rng: Rng, v: number, bound: readonly [number, number], rate: number, sigma: number): number {
  if (rng() >= rate) return v;
  return clamp(Math.round(v + gaussian(rng) * sigma * SCALE_STEP * 0.5 * Math.max(v, 2)), bound);
}

// --- structural mutation -----------------------------------------------------

function applyStructural(g: Genome, rng: Rng, lockSymmetry = false): void {
  const ops = [bumpRepeat, addAppendage, removeAppendage, changeTerminal, changeKind, reaim, changeBauplan, changeCovering, addChild, removeChild];
  if (!lockSymmetry) ops.push(flipSymmetry);
  pick(rng, ops)(g, rng);
}

/** Is this part the face? — eyes/mouth are protected from removal/retyping so a lineage keeps its
 *  face (M24); even if one slips through, grow's bauplan pass re-guarantees it. */
function isFace(a: AppendageGene): boolean {
  return a.terminal === 'eye' || a.terminal === 'mouth';
}
function isLeg(a: AppendageGene): boolean {
  return a.kind === 'leg';
}

/**
 * Basin-hop the limb count to an adjacent canonical value (M24) — add or drop a leg *pair*, never a
 * lone scattered leg. The bauplan pass then snaps the legs onto the new layout's slots.
 */
function changeBauplan(g: Genome, rng: Rng): void {
  if (g.symmetry === 'radial') return; // radialCount is the radial bauplan; point-mutated already
  // (on the section that carries the legs: the trunk, or an arthropod's thorax ahead of its abdomen)
  const seg = legBearer(g);
  const legs = seg.appendages.filter(isLeg);
  const grow = rng() < 0.5 ? -1 : 1;
  const target = clampInt(legs.length + grow, [0, 5]);
  if (target === legs.length) return;
  if (target < legs.length) {
    const idx = seg.appendages.indexOf(legs[Math.floor(rng() * legs.length)]);
    if (idx >= 0) seg.appendages.splice(idx, 1);
  } else {
    if (seg.appendages.length >= GENE_BOUNDS.segment.appendageCount[1]) return;
    seg.appendages.push(legs.length > 0 ? structuredClone(legs[0]) : freshLeg(rng));
  }
}

function freshLeg(rng: Rng): AppendageGene {
  const A = GENE_BOUNDS.appendage;
  return {
    kind: 'leg', style: range(rng, 0, 0.4), attachT: 0.5, attachAzimuth: range(rng, 3.8, 4.6),
    attachElevation: 0, roll: 0, segments: randint(rng, 2, 4),
    length: range(rng, 0.3, 0.6), thickness: range(rng, A.thickness[0], 0.3), taper: range(rng, 0.7, 0.85),
    curl: [range(rng, 0.2, 0.55), 0], terminal: pick(rng, ['foot', 'claw'] as const), pair: true,
  };
}

// Re-skin: swap the covering type or the color pattern (a furred cat → a scaled one).
function changeCovering(g: Genome, rng: Rng): void {
  if (rng() < 0.5) g.covering.type = pick(rng, COVERING_TYPES);
  else g.covering.pattern = pick(rng, PATTERN_TYPES);
}

function bumpRepeat(g: Genome, rng: Rng): void {
  const seg = pickSeg(rng, g);
  seg.repeat = clampInt(seg.repeat + (rng() < 0.5 ? -1 : 1), GENE_BOUNDS.segment.repeat);
}

function addAppendage(g: Genome, rng: Rng): void {
  let seg = pickSeg(rng, g);
  if (seg.appendages.length >= GENE_BOUNDS.segment.appendageCount[1]) return;
  const a = freshAppendage(rng);
  // A head's part grows on the head: an ear, a horn, a crest, whiskers, feelers —
  // near its crown (the front of its run along the chain is the muzzle) and on its upper half. (On
  // any section, anywhere round it, a mutant wore an ear on its rump, a horn under its belly.)
  if (HEAD_KINDS.has(a.kind)) {
    const chain = segments(g);
    const head = chain[chain.length - 1];
    if (head.appendages.length < GENE_BOUNDS.segment.appendageCount[1]) seg = head;
    a.attachT *= 0.35;
    a.attachAzimuth %= Math.PI;
  }
  seg.appendages.push(a);
}

function removeAppendage(g: Genome, rng: Rng): void {
  // never remove the face — only non-face parts (M24)
  const segs = segments(g).filter((s) => s.appendages.some((a) => !isFace(a)));
  if (segs.length === 0) return;
  const seg = pick(rng, segs);
  const idx = seg.appendages.indexOf(pick(rng, seg.appendages.filter((a) => !isFace(a))));
  if (idx >= 0) seg.appendages.splice(idx, 1);
}

function changeTerminal(g: Genome, rng: Rng): void {
  const apps = allAppendages(g).filter((a) => !isFace(a)); // don't retype eyes/mouth away
  if (apps.length === 0) return;
  // (a tip its kind can wear: a paw to a hoof, a tail's tuft to a club — not a leg to an eye)
  const a = pick(rng, apps);
  a.terminal = pick(rng, KIND_TERMINALS[a.kind]);
}

function changeKind(g: Genome, rng: Rng): void {
  const apps = allAppendages(g).filter((a) => !isFace(a));
  if (apps.length === 0) return;
  const a = pick(rng, apps);
  a.kind = pick(rng, DECOR_KINDS); // not → leg (legs are bauplan-managed, M24)
  // a part that becomes another keeps its tip only if the new kind can wear it (a tail turned ear
  // ended in a fin)
  const tips = KIND_TERMINALS[a.kind];
  if (!tips.includes(a.terminal)) a.terminal = pick(rng, tips);
  // …and one that becomes a head's part moves to the head (a tail turned horn stood on the rump)
  if (HEAD_KINDS.has(a.kind)) {
    const chain = segments(g);
    const head = chain[chain.length - 1];
    const from = chain.find((sg) => sg.appendages.includes(a));
    if (from && from !== head && head.appendages.length < GENE_BOUNDS.segment.appendageCount[1]) {
      from.appendages.splice(from.appendages.indexOf(a), 1);
      head.appendages.push(a);
    }
    if (from !== head || from === undefined) {
      a.attachT *= 0.35;
      a.attachAzimuth %= Math.PI;
    }
  }
}

// Re-aim a *decorative* part: swing it to a new direction (a side fin → a tail, a horn back). Legs
// and the face are off-limits — legs follow the bauplan slots, the face stays on the head (M24).
function reaim(g: Genome, rng: Rng): void {
  const apps = allAppendages(g).filter((a) => !isFace(a) && !isLeg(a));
  if (apps.length === 0) return;
  const a = pick(rng, apps);
  a.attachAzimuth = range(rng, 0, Math.PI * 2);
  a.attachElevation = range(rng, GENE_BOUNDS.appendage.attachElevation[0], GENE_BOUNDS.appendage.attachElevation[1]);
}

// A new body section grows in BEHIND the head (a longer neck, an extra trunk section) — appended past
// the head it put a fresh faceless segment in front of the face. A body with no head grows one on.
function addChild(g: Genome, rng: Rng): void {
  const chain = segments(g);
  if (chain.length >= DEPTH_MAX) return;
  const fresh = freshSegment(rng);
  const last = chain[chain.length - 1];
  if (chain.length >= 2 && last.appendages.some(isFace)) {
    fresh.child = last;
    chain[chain.length - 2].child = fresh;
  } else last.child = fresh;
}

// Lose a body section — but never the head: drop a faceless link from between trunk and head (a
// neck link, a trunk section) and close the gap. (Dropping the last segment beheaded the lineage:
// its face fell back onto the trunk and it became a blob.) Nor a section that carries legs — an
// insect's thorax: legs come and go a pair at a time (changeBauplan), never all six at a stroke.
function removeChild(g: Genome, rng: Rng): void {
  const chain = segments(g);
  const removable: number[] = [];
  for (let k = 1; k < chain.length; k++) {
    const isHead = k === chain.length - 1 && chain[k].appendages.some(isFace);
    if (!isHead && !chain[k].appendages.some(isFace) && !chain[k].appendages.some(isLeg)) removable.push(k);
  }
  if (removable.length === 0) return;
  const k = removable[Math.floor(rng() * removable.length)];
  chain[k - 1].child = chain[k].child;
}

function flipSymmetry(g: Genome, rng: Rng): void {
  const opts: Symmetry[] = (['bilateral', 'radial', 'none'] as const).filter((x) => x !== g.symmetry);
  g.symmetry = pick(rng, opts);
}

// --- duplication -------------------------------------------------------------

function applyDuplication(g: Genome, rng: Rng): void {
  if (rng() < 0.5) duplicateAppendage(g, rng);
  else duplicateSegment(g, rng);
}

function duplicateAppendage(g: Genome, rng: Rng): void {
  const withApps = segments(g).filter(
    (s) => s.appendages.length > 0 && s.appendages.length < GENE_BOUNDS.segment.appendageCount[1],
  );
  if (withApps.length === 0) return;
  const seg = pick(rng, withApps);
  const src = seg.appendages[Math.floor(rng() * seg.appendages.length)];
  seg.appendages.push(structuredClone(src));
}

function duplicateSegment(g: Genome, rng: Rng): void {
  const chain = segments(g);
  if (chain.length >= DEPTH_MAX) return;
  // never the head: a copy spliced in after it grew a second skull out of the first one's face
  const faceless = chain.filter((sg) => !sg.appendages.some(isFace));
  if (faceless.length === 0) return;
  const seg = pick(rng, faceless);
  const copy = structuredClone(seg) as SegmentGene;
  copy.child = seg.child; // splice the duplicate in directly after `seg`
  seg.child = copy;
}

// --- fresh within-bounds parts ----------------------------------------------

function freshAppendage(rng: Rng): AppendageGene {
  const A = GENE_BOUNDS.appendage;
  const kind = pick(rng, DECOR_KINDS); // not → leg: legs are added as pairs via changeBauplan (M24)
  return {
    kind,
    style: range(rng, 0, 1),
    attachT: range(rng, 0, 1),
    attachAzimuth: range(rng, 0, Math.PI * 2),
    attachElevation: range(rng, A.attachElevation[0], A.attachElevation[1]),
    roll: range(rng, A.roll[0], A.roll[1]),
    segments: randint(rng, 1, 4),
    length: range(rng, 0.3, 0.9),
    thickness: range(rng, A.thickness[0], 0.3),
    taper: range(rng, 0.6, 0.95),
    curl: [range(rng, -0.4, 0.4), range(rng, -0.2, 0.2)],
    terminal: pick(rng, KIND_TERMINALS[kind]),
    pair: rng() < 0.7,
  };
}

function freshSegment(rng: Rng): SegmentGene {
  return {
    size: [range(rng, 0.2, 0.6), range(rng, 0.2, 0.6), range(rng, 0.25, 0.7)],
    repeat: randint(rng, 1, 4),
    taper: range(rng, 0.75, 1.05),
    curve: [range(rng, -0.2, 0.2), range(rng, -0.1, 0.1)],
    appendages: rng() < 0.5 ? [freshAppendage(rng)] : [],
  };
}

// --- helpers -----------------------------------------------------------------

const KINDS: readonly PartKind[] = [
  'leg', 'arm', 'wing', 'fin', 'tail', 'horn', 'spine', 'frill', 'antenna', 'tentacle', 'eyestalk', 'maw',
  'plate', 'ear', 'gill', 'crest', 'whisker',
];
/** Kinds a free/changed appendage may become — everything but `leg` (legs are bauplan-managed, M24),
 *  and not a face: a maw's mouth and a stalk's eye count as the face, which is never removed, so one
 *  sprouted on a flank stayed there for good — a lineage gathered mouths and eyes down its body and
 *  could never lose them (grow guarantees the face itself) */
const DECOR_KINDS: readonly PartKind[] = KINDS.filter((k) => k !== 'leg' && k !== 'maw' && k !== 'eyestalk');
/**
 * The tips a part of each kind can end in, as the plan library grows them: a horn in a horn's point,
 * an ear in an ear, a wing or a frill in its membrane, a tail in a tuft, a fin, a barb, a club or a
 * claw. (Any tip on any part made a horn end in a hoof, a leg in an eye, an ear in a fin: a mutant was
 * a jumble of mismatched pieces, not a creature.)
 */
const KIND_TERMINALS: Record<PartKind, readonly Terminal[]> = {
  leg: ['foot', 'claw', 'paw', 'hoof'],
  arm: ['hand', 'claw', 'pincer', 'paw'],
  wing: ['fin'],
  fin: ['fin'],
  tail: ['none', 'fin', 'barb', 'club', 'claw'],
  horn: ['claw'],
  spine: ['claw', 'none'],
  frill: ['fin'],
  antenna: ['none'],
  tentacle: ['none', 'claw'],
  eyestalk: ['eye'],
  maw: ['mouth'],
  plate: ['none', 'carapace'],
  ear: ['ear'],
  gill: ['gill'],
  crest: ['crest'],
  whisker: ['whisker'],
};
/** the parts a head carries (a fresh one grows there) */
const HEAD_KINDS: ReadonlySet<PartKind> = new Set<PartKind>(['ear', 'horn', 'crest', 'whisker', 'antenna']);
const COH_BOUND: readonly [number, number] = [0, 1];
const COVERING_TYPES: readonly CoveringType[] = ['skin', 'scales', 'fur', 'feathers', 'chitin', 'slime', 'plates', 'crystal'];
const PATTERN_TYPES: readonly PatternType[] = [
  'plain', 'stripes', 'bands', 'spots', 'ocelli', 'reticulate', 'mottle', 'gradient',
];

/** The body's segment chain (each SegmentGene has at most one `child`). */
function segments(g: Genome): SegmentGene[] {
  const out: SegmentGene[] = [];
  let s: SegmentGene | undefined = g.body;
  while (s) {
    out.push(s);
    s = s.child;
  }
  return out;
}
function allAppendages(g: Genome): AppendageGene[] {
  return segments(g).flatMap((s) => s.appendages);
}
function pickSeg(rng: Rng, g: Genome): SegmentGene {
  return pick(rng, segments(g));
}
function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function randint(rng: Rng, min: number, max: number): number {
  return Math.round(range(rng, min, max));
}
function clampInt(v: number, bound: readonly [number, number]): number {
  return Math.round(clamp(v, bound));
}
/** Standard-normal sample via Box-Muller (deterministic given the Rng). */
function gaussian(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
