/**
 * Morphospace & coherence (MORPHOLOGY §11) — the attractor-basin engine's measuring tape.
 *
 * `describe()` reduces a grown creature to an ~8-D **morphospace descriptor** (computed, not
 * stored — so a creature reports its *true current* form). Each morphotype has a **centroid**
 * here (an attractor), sampled from the generator. `coherence()` reports the nearest centroid
 * and how close — high near a centroid (a clear species), low in the valleys between (uncanny
 * hybrids). Pure & deterministic. The niched breeder litters (selection.ts) use this space to
 * spread offspring; the menagerie (M14) will tile it.
 */
import { grow, type Phenotype } from './grow';
import type { CoveringType } from './genome';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from './random';

const DIMS = 10;

/** Terminals that cap a locomotor leg (so legged creatures count their limbs). */
const LEG_TIPS = new Set(['foot', 'claw', 'pincer', 'paw', 'hoof']);

/**
 * **Headedness** (§11.1) — how set apart the front of the body is from its bulk, i.e. does this
 * creature have a NECK and a distinct head, or is it one undifferentiated mass?
 *
 * Measured as the constriction between the body's widest point and the narrowest point of its
 * forward half: a heron or ratite pinches hard (→ 1), a slime or urchin never pinches at all
 * (→ 0), a tapered fish sits in between. Computed from the grown spine, so a lineage reports its
 * true current shape. Radial/chainless bodies have no forward axis and score 0 by construction.
 */
function headedness(p: Phenotype): number {
  const spine = p.nodes.filter((n) => n.kind === 'spine');
  if (spine.length < 3) return 0;
  let rMax = 0;
  for (const n of spine) if (n.radius > rMax) rMax = n.radius;
  if (rMax <= 1e-6) return 0;
  // +Z is forward (DESIGN §4.1), so the forward half of the chain is where a neck would be
  const sorted = [...spine].sort((a, b) => a.pos[2] - b.pos[2]);
  const front = sorted.slice(Math.floor(sorted.length / 2));
  let neckMin = Infinity;
  for (const n of front) if (n.radius < neckMin) neckMin = n.radius;
  const v = 1 - neckMin / rMax;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** [elongation, limbCount, finniness, bulk, eyeCount, winged, tailed, radial, headedness, sheen]
 *  — each ~[0,1]. The last two complete the §11.1 dimension set: without them look-alike basins
 *  that differ only by surface or by whether they own a head collapse onto each other. */
export function describe(p: Phenotype): number[] {
  const { min, max } = p.bounds;
  const dx = max[0] - min[0];
  const dy = max[1] - min[1];
  const dz = max[2] - min[2];

  let legs = 0;
  let fins = 0;
  let wings = 0;
  let tails = 0;
  let eyes = 0;
  let tentacles = 0;
  let rMax = 0;
  for (const n of p.nodes) {
    if (n.radius > rMax) rMax = n.radius;
    if (LEG_TIPS.has(n.terminal as string)) legs++;
    else if (n.terminal === 'eye') eyes++;
    const k = n.part?.kind;
    if (k === 'fin') fins++;
    else if (k === 'wing') wings++;
    else if (k === 'tail') tails++;
    else if (k === 'tentacle') tentacles++;
  }

  const t = (x: number, c: number) => Math.tanh(x / c); // soft-normalize positives to ~[0,1)
  return [
    t(dz / Math.max((dx + dy) / 2, 0.1), 4), // elongation
    t(legs, 4), // limb count
    (fins + wings) / (fins + wings + legs + 1), // finniness
    t(rMax / Math.max((dx + dy + dz) / 3, 0.1), 0.4), // bulk
    t(eyes, 3), // eye count
    wings > 0 ? 1 : 0, // winged
    tails > 0 ? 1 : 0, // tailed
    p.genomeRef.symmetry === 'radial' || tentacles > 0 ? 1 : 0, // radial
    headedness(p), // neck / distinct head vs. one undifferentiated mass
    // sheen is the one descriptor read off the genome rather than the skeleton: it is the surface
    // axis the doc calls for, and it is what separates basins that are structurally identical —
    // a chitinous insectoid from a furred ursid, a wet cephalopod from a dry horror.
    Math.min(1, Math.max(0, p.genomeRef.covering.sheen)),
  ];
}

export function distance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < DIMS; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

// --- identity: which plan a body is ------------------------------------------
// The descriptor measures how a body is built, and it blurs what tells close basins apart: a deer and a
// dog are both four furred legs, a trunk, a tail and a head (a deer was named a dog or a bear 38 times in
// 40, a turtle 31), an ostrich without its tail an upright two-legged ape. So WHICH plan a body is also
// weighs its hide and the parts a plan is known by — hooves, paws, pincers, a shell, horns, and whether it
// stands on two legs or four. (How near it is to a plan — coherence's score — stays the descriptor's.)

/** how much a hide its plan never wears, and the telltale parts, weigh against the descriptor's dims */
const W_COVER = 0.6;
const W_PART = 0.5;

/** …and how much a tail counts, of the descriptor's whole unit: most plans grow one only most of the time
 *  (a deer 7 in 10), and at a whole unit a tailless deer, turtle or ostrich lay further from its own
 *  plan than from a spider, a lizard or an ape */
const W_TAIL = 0.4;
const TAILED = 6; // the descriptor's tailed dimension

/** a telltale part tells only where its plan's founders always grow it (this share of them or more) or
 *  never do (this share or fewer): a mixed plan's optional parts (a chimera's pincers, a deer's horns) say
 *  nothing either way */
const TELL_ALWAYS = 0.8;
const TELL_NEVER = 0.2;

export interface Identity {
  /** the descriptor itself */
  d: number[];
  /** the descriptor as identity weighs it, then how far its tail reaches */
  v: number[];
  /** the telltale parts it has: hooves, paws, pincers, a shell, horns, two legs, a fin */
  flags: number[];
  cover: CoveringType;
}

/** The descriptor, the telltale parts and the hide. */
export function identity(p: Phenotype): Identity {
  const d = describe(p);
  let hoof = 0, paw = 0, pincer = 0, shell = 0, horn = 0, legs = 0, fin = 0;
  // how long its tail runs against its trunk (a bear's is a stub, a dog's as long as its back)
  const parent = new Map<number, number>();
  for (const [a, b] of p.edges) parent.set(b, a);
  let tailLen = 0;
  let z0 = Infinity, z1 = -Infinity;
  p.nodes.forEach((n, i) => {
    if (n.kind === 'spine' && (n.segment ?? 0) === 0) {
      z0 = Math.min(z0, n.pos[2]);
      z1 = Math.max(z1, n.pos[2]);
    }
    const a = parent.get(i);
    if (n.part?.kind === 'tail' && a !== undefined) {
      const q = p.nodes[a].pos;
      tailLen += Math.hypot(n.pos[0] - q[0], n.pos[1] - q[1], n.pos[2] - q[2]);
    }
  });
  const tailReach = Math.min(1, tailLen / Math.max(z1 - z0, 0.1) / 2);
  for (const n of p.nodes) {
    if (n.terminal === 'hoof') hoof = 1;
    else if (n.terminal === 'paw') paw = 1;
    else if (n.terminal === 'pincer') pincer = 1;
    else if (n.terminal === 'carapace') shell = 1;
    // (legs by their own parts: a membrane wing's claw is no foot)
    if (n.part?.kind === 'leg' && n.terminal) legs++;
    if (n.part?.kind === 'horn') horn = 1;
    else if (n.part?.kind === 'fin') fin = 1;
  }
  const w = d.slice();
  w[TAILED] *= W_TAIL;
  return {
    d,
    v: [...w, tailReach * W_PART],
    flags: [hoof, paw, pincer, shell, horn, legs === 2 ? 1 : 0, fin],
    cover: p.genomeRef.covering.type,
  };
}

/** How far a body's identity lies from a plan's: its build by the plan's mean; a telltale part where the
 *  plan always grows it and the body lacks it, or never and the body has it; its hide where the plan's
 *  founders never wear it (by a mean, a scaled dragon was pulled toward the wyvern, which wears only
 *  scales). */
function identityDistance(a: Identity, c: Centroid): number {
  let s = 0;
  for (let i = 0; i < a.v.length; i++) {
    const d = a.v[i] - c.iv[i];
    s += d * d;
  }
  for (let i = 0; i < a.flags.length; i++) {
    const f = c.fl[i];
    if ((f >= TELL_ALWAYS && !a.flags[i]) || (f <= TELL_NEVER && a.flags[i])) s += W_PART * W_PART;
  }
  if (!c.covers.has(a.cover)) s += W_COVER * W_COVER;
  return Math.sqrt(s);
}

// --- attractor centroids (sampled once per morphotype, memoized) -------------

interface Centroid {
  id: string;
  v: number[];
  /** the mean identity (see identity), the share of its founders with each telltale part, and every hide
   *  they wear */
  iv: number[];
  fl: number[];
  covers: Set<CoveringType>;
}
let CENTROIDS: Centroid[] | null = null;

function centroids(): Centroid[] {
  if (CENTROIDS) return CENTROIDS;
  const N = 16;
  CENTROIDS = MORPHOTYPE_IDS.map((id) => {
    let acc: number[] | null = null;
    let fl: number[] | null = null;
    const v = new Array<number>(DIMS).fill(0);
    const covers = new Set<CoveringType>();
    for (let s = 0; s < N; s++) {
      const d = identity(grow(genomeOfMorphotype(s * 131 + 7, id)));
      if (!acc) acc = new Array<number>(d.v.length).fill(0);
      if (!fl) fl = new Array<number>(d.flags.length).fill(0);
      for (let i = 0; i < d.v.length; i++) acc[i] += d.v[i];
      for (let i = 0; i < d.flags.length; i++) fl[i] += d.flags[i];
      for (let i = 0; i < DIMS; i++) v[i] += d.d[i];
      covers.add(d.cover);
    }
    return { id, v: v.map((x) => x / N), iv: acc!.map((x) => x / N), fl: fl!.map((x) => x / N), covers };
  });
  return CENTROIDS;
}

export interface Coherence {
  nearest: string; // the closest morphotype
  score: number; // 0..1 — high = a clear species, low = an uncanny valley
}

/** How clearly a creature reads as a known morphotype (and which one). */
export function coherence(p: Phenotype): Coherence {
  const iv = identity(p);
  const d = iv.d;
  const cs = centroids();
  let nearest = cs[0].id;
  let best = Infinity; // the descriptor's distance to the nearest plan: how clearly it is one
  let bestId = Infinity; // …and which plan it is, by its identity
  for (const c of cs) {
    best = Math.min(best, distance(d, c.v));
    const di = identityDistance(iv, c);
    if (di < bestId) {
      bestId = di;
      nearest = c.id;
    }
  }
  const sigma = 0.32;
  return { nearest, score: Math.exp(-(best * best) / (2 * sigma * sigma)) };
}

/** Human labels for the descriptor dimensions, in `describe()` order (for inspectors/plots). */
export const DESCRIPTOR_LABELS: readonly string[] = [
  'elongation',
  'limbs',
  'finniness',
  'bulk',
  'eyes',
  'winged',
  'tailed',
  'radial',
  'headedness',
  'sheen',
];

/** The `k` plans a body is likeliest to be, by its identity (the descriptor, its hide and its telltale
 *  parts), likeliest first. */
export function nearestKinds(p: Phenotype, k = 3): { id: string; dist: number; score: number }[] {
  const iv = identity(p);
  const sigma = 0.32;
  return centroids()
    .map((c) => {
      const dist = identityDistance(iv, c);
      return { id: c.id, dist, score: Math.exp(-(dist * dist) / (2 * sigma * sigma)) };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, k);
}
