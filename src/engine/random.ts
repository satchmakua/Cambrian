/**
 * Random genome generation by **morphotype** (MORPHOLOGY §4, §10, ROADMAP M10).
 *
 * A morphotype is a *multivariate prior* — coupled parameter ranges + characteristic
 * parts — not a fixed mold. Sampling one then jittering yields endless creatures that
 * still read as their kind (cat, crab, heron, dragon, cephalopod). The distribution is
 * **bimodal**: ~45% a Familiar morphotype, ~35% an Uncanny one, ~20% the free
 * "wild" compositional generator (the in-between tail). Every draw flows from the seed
 * (Pillar 3); every gene stays within `GENE_BOUNDS` (Pillar 1).
 */
import { mulberry32, range, type Rng } from './rng';
import { GENE_BOUNDS, clamp } from './bounds';
import {
  GENOME_VERSION,
  type Genome,
  type SegmentGene,
  type AppendageGene,
  type Symmetry,
  type Terminal,
  type PartKind,
} from './genome';

export type SymmetryMode = 'auto' | 'bilateral' | 'radial';
type Rg = readonly [number, number];

const A = GENE_BOUNDS.appendage;

// =============================================================================
// Morphotype priors
// =============================================================================

interface Morpho {
  id: string;
  cluster: 'familiar' | 'uncanny';
  weight: number;
  symmetry?: Symmetry; // default bilateral
  radialCount?: Rg;
  girth: Rg;
  repeat: Rg; // body segment count
  height?: Rg; // cross-section y/x
  elong?: Rg; // z stretch
  taper?: Rg;
  wind?: number; // prob of a serpentine S-curve
  legPairs?: readonly number[]; // bilateral only
  legLen?: Rg; // ×girth
  legThick?: Rg; // ×girth
  legAz?: Rg; // sprawl azimuth (4.7 ≈ straight down)
  legTerm?: readonly Terminal[];
  wings?: number;
  dorsal?: number;
  pectoral?: number;
  tail?: number;
  tailTerm?: readonly Terminal[];
  horns?: number;
  spines?: number;
  frill?: number;
  antennae?: number;
  head?: number; // default 0.9
  eyeStyle?: Rg; // 0 round … 1 glowing
  eyeCount?: readonly number[];
  eyeAz?: Rg; // placement (1.0 up-fwd, ~0.3 side, ~1.6 top)
  mouthStyle?: Rg; // 0 maw … 1 baleen
  hue?: Rg;
  sat?: Rg;
  light?: Rg;
}

// Terse priors. Unspecified fields fall back to sensible defaults in `compile`.
const MORPHOTYPES: readonly Morpho[] = [
  // --- familiar ---
  { id: 'felid', cluster: 'familiar', weight: 1, girth: [0.45, 0.6], repeat: [3, 4], height: [0.85, 1.0], elong: [1.1, 1.4], legPairs: [2], legLen: [0.5, 0.66], legTerm: ['claw'], tail: 0.97, horns: 0.03, eyeStyle: [0, 0.15], mouthStyle: [0, 0.2], hue: [0.05, 0.12], sat: [0.4, 0.7] },
  { id: 'canid', cluster: 'familiar', weight: 1, girth: [0.42, 0.56], repeat: [3, 4], elong: [1.15, 1.45], legPairs: [2], legLen: [0.55, 0.72], legTerm: ['foot'], tail: 0.95, frill: 0.4, eyeStyle: [0, 0.15], mouthStyle: [0.1, 0.3], hue: [0.05, 0.1] },
  { id: 'rodent', cluster: 'familiar', weight: 0.9, girth: [0.3, 0.45], repeat: [2, 3], height: [0.9, 1.1], legPairs: [2], legLen: [0.4, 0.55], tail: 0.9, eyeStyle: [0, 0.15], eyeCount: [2], mouthStyle: [0, 0.15], hue: [0.04, 0.1] },
  { id: 'ungulate', cluster: 'familiar', weight: 0.8, girth: [0.45, 0.62], repeat: [3, 4], legPairs: [2], legLen: [0.7, 0.95], legTerm: ['foot'], tail: 0.7, horns: 0.55, eyeStyle: [0, 0.1], eyeAz: [0.3, 0.6], mouthStyle: [0, 0.15], hue: [0.06, 0.11] },
  { id: 'ursid', cluster: 'familiar', weight: 0.7, girth: [0.55, 0.78], repeat: [3, 4], legPairs: [2], legLen: [0.42, 0.55], legTerm: ['claw'], tail: 0.3, eyeStyle: [0, 0.15], mouthStyle: [0, 0.2], hue: [0.04, 0.09] },
  { id: 'lizard', cluster: 'familiar', weight: 0.9, girth: [0.32, 0.46], repeat: [4, 6], height: [0.6, 0.8], elong: [1.2, 1.5], legPairs: [2], legLen: [0.4, 0.55], legAz: [4.0, 4.3], legTerm: ['claw'], tail: 0.95, frill: 0.25, eyeStyle: [0.4, 0.6], mouthStyle: [0, 0.25], hue: [0.22, 0.42], sat: [0.5, 0.85] },
  { id: 'crocodilian', cluster: 'familiar', weight: 0.6, girth: [0.4, 0.55], repeat: [5, 7], height: [0.55, 0.75], elong: [1.3, 1.6], legPairs: [2], legLen: [0.35, 0.48], legAz: [3.9, 4.2], legTerm: ['claw'], tail: 0.95, spines: 0.7, eyeStyle: [0.4, 0.6], eyeAz: [1.4, 1.7], mouthStyle: [0, 0.15], hue: [0.2, 0.35], sat: [0.3, 0.6] },
  { id: 'serpent', cluster: 'familiar', weight: 0.9, girth: [0.3, 0.44], repeat: [9, 16], wind: 0.9, legPairs: [0], tail: 0.0, eyeStyle: [0.4, 0.6], mouthStyle: [0, 0.2], hue: [0.1, 0.4], sat: [0.5, 0.85] },
  { id: 'anuran', cluster: 'familiar', weight: 0.7, girth: [0.5, 0.7], repeat: [1, 2], height: [0.85, 1.05], legPairs: [2], legLen: [0.55, 0.8], tail: 0.0, eyeStyle: [0, 0.2], eyeAz: [1.3, 1.7], mouthStyle: [0, 0.15], hue: [0.25, 0.45], sat: [0.5, 0.85] },
  { id: 'fish', cluster: 'familiar', weight: 1, girth: [0.4, 0.58], repeat: [4, 6], height: [1.05, 1.45], elong: [1.3, 1.6], taper: [0.78, 0.9], legPairs: [0], dorsal: 0.95, pectoral: 0.9, tail: 0.9, tailTerm: ['fin'], head: 0.3, eyeStyle: [0, 0.2], eyeAz: [0.3, 0.6], mouthStyle: [0, 0.4], hue: [0.45, 0.65], sat: [0.4, 0.8] },
  { id: 'shark', cluster: 'familiar', weight: 0.7, girth: [0.45, 0.62], repeat: [5, 7], height: [0.95, 1.2], elong: [1.4, 1.7], taper: [0.78, 0.9], legPairs: [0], dorsal: 1, pectoral: 0.9, tail: 0.95, tailTerm: ['fin'], head: 0.3, eyeStyle: [0.1, 0.3], eyeAz: [0.3, 0.6], mouthStyle: [0, 0.15], hue: [0.55, 0.62], sat: [0.2, 0.45] },
  { id: 'bird', cluster: 'familiar', weight: 1, girth: [0.34, 0.5], repeat: [2, 3], height: [1.0, 1.3], legPairs: [1], legLen: [0.7, 1.0], legTerm: ['claw'], wings: 0.95, tail: 0.7, tailTerm: ['fin'], eyeStyle: [0, 0.2], mouthStyle: [0.2, 0.4], hue: [0.05, 0.65], sat: [0.5, 0.9] },
  { id: 'raptor', cluster: 'familiar', weight: 0.7, girth: [0.4, 0.54], repeat: [2, 3], height: [1.0, 1.25], legPairs: [1], legLen: [0.7, 0.95], legTerm: ['claw'], wings: 1, tail: 0.7, tailTerm: ['fin'], eyeStyle: [0, 0.15], mouthStyle: [0.25, 0.4], hue: [0.06, 0.12] },
  { id: 'crab', cluster: 'familiar', weight: 0.9, girth: [0.45, 0.62], repeat: [1, 2], height: [0.5, 0.7], elong: [0.7, 0.95], legPairs: [3], legLen: [0.6, 0.85], legAz: [3.6, 4.0], legTerm: ['pincer', 'claw'], tail: 0.0, antennae: 0.6, eyeStyle: [0, 0.3], eyeAz: [1.2, 1.6], mouthStyle: [0.4, 0.6], hue: [0.02, 0.1], sat: [0.5, 0.85] },
  { id: 'insectoid', cluster: 'familiar', weight: 0.85, girth: [0.3, 0.44], repeat: [4, 6], height: [0.75, 0.95], legPairs: [3], legLen: [0.55, 0.8], legAz: [3.7, 4.1], legTerm: ['claw'], antennae: 0.9, eyeStyle: [0.6, 0.8], eyeCount: [2], mouthStyle: [0.4, 0.6], hue: [0.1, 0.6], sat: [0.5, 0.9] },
  { id: 'arachnid', cluster: 'familiar', weight: 0.6, girth: [0.36, 0.52], repeat: [1, 2], height: [0.8, 1.05], legPairs: [4], legLen: [0.7, 1.0], legAz: [3.6, 4.0], legTerm: ['claw'], eyeStyle: [0.2, 0.4], eyeCount: [4, 6], mouthStyle: [0.4, 0.6], hue: [0.02, 0.09], sat: [0.3, 0.6] },
  // --- uncanny ---
  { id: 'dragon', cluster: 'uncanny', weight: 1.2, girth: [0.5, 0.72], repeat: [4, 6], elong: [1.2, 1.5], legPairs: [2], legLen: [0.5, 0.68], legTerm: ['claw'], wings: 0.85, tail: 0.95, horns: 0.9, spines: 0.8, eyeStyle: [0.4, 0.9], mouthStyle: [0, 0.2], hue: [0.0, 0.95], sat: [0.5, 0.9] },
  { id: 'wyvern', cluster: 'uncanny', weight: 0.8, girth: [0.42, 0.58], repeat: [3, 5], elong: [1.2, 1.5], legPairs: [1], legLen: [0.55, 0.75], legTerm: ['claw'], wings: 1, tail: 0.95, tailTerm: ['claw'], horns: 0.8, spines: 0.6, eyeStyle: [0.4, 0.9], mouthStyle: [0, 0.3], hue: [0.0, 0.95], sat: [0.5, 0.9] },
  { id: 'cephalopod', cluster: 'uncanny', weight: 1, symmetry: 'radial', radialCount: [6, 10], girth: [0.5, 0.78], height: [0.7, 1.1], repeat: [1, 2], eyeStyle: [0.8, 1], hue: [0.6, 0.95], sat: [0.4, 0.85] },
  { id: 'horror', cluster: 'uncanny', weight: 0.9, symmetry: 'radial', radialCount: [5, 9], girth: [0.45, 0.75], repeat: [1, 2], eyeStyle: [0.7, 1], hue: [0.7, 1.0], sat: [0.3, 0.7] },
  { id: 'slime', cluster: 'uncanny', weight: 0.7, girth: [0.55, 0.85], repeat: [1, 2], height: [0.85, 1.1], legPairs: [0], tail: 0.0, head: 0.0, eyeStyle: [0.7, 1], hue: [0.25, 0.7], sat: [0.5, 0.9], light: [0.45, 0.7] },
  { id: 'urchin', cluster: 'uncanny', weight: 0.6, symmetry: 'radial', radialCount: [8, 12], girth: [0.45, 0.7], repeat: [1, 1], height: [0.9, 1.1], hue: [0.6, 0.95], sat: [0.4, 0.8] },
  { id: 'starfish', cluster: 'uncanny', weight: 0.6, symmetry: 'radial', radialCount: [4, 6], girth: [0.4, 0.6], repeat: [1, 1], height: [0.4, 0.6], hue: [0.02, 0.15], sat: [0.5, 0.85] },
];

const FAMILIAR = MORPHOTYPES.filter((m) => m.cluster === 'familiar');
const UNCANNY = MORPHOTYPES.filter((m) => m.cluster === 'uncanny');

/** Morphotype ids (the attractor names) — used by the morphospace centroids (M11). */
export const MORPHOTYPE_IDS: readonly string[] = MORPHOTYPES.map((m) => m.id);

/** Compile a specific morphotype by id — for sampling its morphospace centroid. */
export function genomeOfMorphotype(seed: number, id: string): Genome {
  const m = MORPHOTYPES.find((x) => x.id === id) ?? MORPHOTYPES[0];
  return compile(mulberry32(seed >>> 0), seed >>> 0, m);
}

// =============================================================================
// Sampler
// =============================================================================

export function randomGenome(seed: number, mode: SymmetryMode = 'auto'): Genome {
  const s = seed >>> 0;
  const rng = mulberry32(s);

  if (mode === 'radial') {
    const radials = MORPHOTYPES.filter((m) => m.symmetry === 'radial');
    return rng() < 0.85 ? compile(rng, s, weightedMorpho(rng, radials)) : wild(rng, s, 'radial');
  }
  if (mode === 'bilateral') {
    const bils = MORPHOTYPES.filter((m) => (m.symmetry ?? 'bilateral') !== 'radial');
    return rng() < 0.85 ? compile(rng, s, weightedMorpho(rng, bils)) : wild(rng, s, 'bilateral');
  }
  // auto — bimodal: 45% familiar, 35% uncanny, 20% wild
  const roll = rng();
  if (roll < 0.45) return compile(rng, s, weightedMorpho(rng, FAMILIAR));
  if (roll < 0.8) return compile(rng, s, weightedMorpho(rng, UNCANNY));
  return wild(rng, s, rng() < 0.3 ? 'radial' : 'bilateral');
}

function weightedMorpho(rng: Rng, pool: readonly Morpho[]): Morpho {
  const total = pool.reduce((t, m) => t + m.weight, 0);
  let r = rng() * total;
  for (const m of pool) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return pool[pool.length - 1];
}

// =============================================================================
// Compiler: morphotype → genome
// =============================================================================

function compile(rng: Rng, seed: number, m: Morpho): Genome {
  const symmetry: Symmetry = m.symmetry ?? 'bilateral';
  const girth = rg(rng, m.girth);
  return symmetry === 'radial' ? compileRadial(rng, seed, m, girth) : compileBilateral(rng, seed, m, girth);
}

function compileBilateral(rng: Rng, seed: number, m: Morpho, girth: number): Genome {
  const height = rg(rng, m.height, [0.8, 1.05]);
  const elong = rg(rng, m.elong, [1.0, 1.3]);
  const wind = chance(rng, m.wind ?? 0);
  const apps: AppendageGene[] = [];

  // legs
  const lp = pick(rng, m.legPairs ?? ([2] as const));
  const legTerm = pick(rng, m.legTerm ?? (['foot'] as const));
  for (let i = 0; i < lp; i++) {
    const t = lp === 1 ? range(rng, 0.4, 0.62) : (i / (lp - 1)) * 0.66 + 0.17;
    apps.push(leg(rng, t, girth, { term: legTerm, lenMul: m.legLen, thickMul: m.legThick, azimuth: m.legAz }));
  }
  // wings, fins
  if (chance(rng, m.wings ?? 0)) apps.push(wing(rng, range(rng, 0.3, 0.5), girth));
  if (chance(rng, m.dorsal ?? 0)) apps.push(dorsalFin(rng, range(rng, 0.3, 0.6), girth));
  if (chance(rng, m.pectoral ?? 0)) apps.push(pectoralFin(rng, range(rng, 0.25, 0.45), girth));
  // tail
  if (chance(rng, m.tail ?? 0.5)) apps.push(tail(rng, girth, pick(rng, m.tailTerm ?? (['none', 'fin'] as const))));
  // dorsal spine ridge
  if (chance(rng, m.spines ?? 0)) for (let i = 0; i < 3; i++) apps.push(spine(rng, 0.2 + i * 0.25, girth));

  const body: SegmentGene = {
    size: [girth, girth * height, girth * elong],
    repeat: randint(rng, m.repeat[0], m.repeat[1]),
    taper: clamp(rg(rng, m.taper, [0.86, 1.0]), GENE_BOUNDS.segment.taper),
    curve: [range(rng, -0.05, 0.03), wind ? range(rng, 0.06, 0.16) * (chance(rng, 0.5) ? -1 : 1) : range(rng, -0.02, 0.02)],
    appendages: apps,
  };

  if (chance(rng, m.head ?? 0.9)) {
    body.child = headSeg(rng, girth, m);
  } else {
    faceOnBody(rng, apps, girth, m);
  }
  return scaffold(rng, seed, 'bilateral', 4, body, m);
}

function compileRadial(rng: Rng, seed: number, m: Morpho, girth: number): Genome {
  const n = randint(rng, ...(m.radialCount ?? ([4, 8] as const)));
  const height = rg(rng, m.height, [0.7, 1.1]);
  const apps: AppendageGene[] = [arm(rng, girth, range(rng, 0.3, 0.6), m)];
  if (chance(rng, 0.4)) apps.push(arm(rng, girth * 0.6, range(rng, 0.45, 0.75), m, true)); // a second ring
  if (chance(rng, 0.6)) apps.push(eyes(rng, range(rng, 0.6, 0.95), false, girth, { style: m.eyeStyle, az: 1.5 })); // a crown of eyes

  const body: SegmentGene = {
    size: [girth, girth * height, girth * rg(rng, m.elong, [0.6, 0.95])],
    repeat: randint(rng, m.repeat[0], m.repeat[1]),
    taper: rg(rng, m.taper, [0.8, 0.95]),
    curve: [0, 0],
    appendages: apps,
  };
  return scaffold(rng, seed, 'radial', n, body, m);
}

function headSeg(rng: Rng, bodyGirth: number, m: Morpho): SegmentGene {
  const g = bodyGirth * range(rng, 0.7, 1.05);
  const apps: AppendageGene[] = [];
  const eyeCount = pick(rng, m.eyeCount ?? ([2] as const));
  for (let p = 0; p < Math.max(1, Math.round(eyeCount / 2)); p++) {
    apps.push(eyes(rng, range(rng, 0.7, 0.98), false, g, { style: m.eyeStyle, az: m.eyeAz ? rg(rng, m.eyeAz) : range(rng, 0.7, 1.3) + p * 0.4 }));
  }
  if (chance(rng, 0.85)) apps.push(mouth(rng, g, m.mouthStyle));
  if (chance(rng, m.horns ?? 0)) apps.push(horns(rng, g));
  if (chance(rng, m.antennae ?? 0)) apps.push(antenna(rng, g));
  return {
    size: [g, g * range(rng, 0.85, 1.05), g * range(rng, 0.8, 1.1)],
    repeat: randint(rng, 1, 2),
    taper: range(rng, 0.85, 1.0),
    curve: [range(rng, 0.0, 0.14), 0],
    appendages: apps,
  };
}

function faceOnBody(rng: Rng, apps: AppendageGene[], girth: number, m: Morpho): void {
  apps.push(eyes(rng, range(rng, 0.85, 0.98), false, girth, { style: m.eyeStyle, az: m.eyeAz ? rg(rng, m.eyeAz) : range(rng, 0.4, 0.7) }));
  if (chance(rng, 0.8)) apps.push(mouth(rng, girth, m.mouthStyle));
}

function scaffold(rng: Rng, seed: number, symmetry: Symmetry, radialCount: number, body: SegmentGene, m: Morpho): Genome {
  return {
    version: GENOME_VERSION,
    seed,
    symmetry,
    radialCount,
    palette: { hueA: rg(rng, m.hue, [0, 1]), hueB: rng(), sat: rg(rng, m.sat, [0.4, 0.85]), light: rg(rng, m.light, [0.35, 0.65]) },
    body,
  };
}

// =============================================================================
// Part builders (parameterized)
// =============================================================================

interface LegOpts {
  term?: Terminal;
  lenMul?: Rg;
  thickMul?: Rg;
  azimuth?: Rg;
}
function leg(rng: Rng, attachT: number, girth: number, o: LegOpts = {}): AppendageGene {
  return part('leg', o.term ?? 'foot', true, range(rng, 0, 0.4), {
    attachT: clamp(attachT, A.attachT),
    attachAzimuth: rg(rng, o.azimuth, [4.0, 4.5]),
    attachElevation: range(rng, -0.1, 0.1),
    segments: 3,
    length: clamp(girth * rg(rng, o.lenMul, [0.44, 0.64]), A.length),
    thickness: clamp(girth * rg(rng, o.thickMul, [0.3, 0.46]), A.thickness),
    taper: range(rng, 0.7, 0.85),
    curl: [range(rng, 0.4, 0.6), range(rng, -0.06, 0.06)],
  });
}

function wing(rng: Rng, attachT: number, girth: number): AppendageGene {
  return part('wing', 'fin', true, range(rng, 0, 0.3), {
    attachT,
    attachAzimuth: range(rng, 1.6, 2.4), // up-and-side
    attachElevation: range(rng, -0.4, -0.1), // swept back
    roll: range(rng, -0.6, 0.6),
    segments: randint(rng, 2, 3),
    length: clamp(girth * range(rng, 1.0, 1.8), A.length),
    thickness: clamp(girth * range(rng, 0.18, 0.3), A.thickness),
    taper: range(rng, 0.6, 0.8),
    curl: [range(rng, -0.1, 0.2), 0],
  });
}

function tail(rng: Rng, girth: number, terminal: Terminal): AppendageGene {
  return part('tail', terminal, false, range(rng, 0, 0.4), {
    attachT: range(rng, 0.0, 0.06),
    attachAzimuth: range(rng, 4.4, 5.0),
    attachElevation: range(rng, -1.25, -0.75),
    segments: randint(rng, 3, 6),
    length: clamp(girth * range(rng, 0.7, 1.4), A.length),
    thickness: clamp(girth * range(rng, 0.18, 0.34), A.thickness),
    taper: range(rng, 0.62, 0.82),
    curl: [range(rng, -0.1, 0.15), range(rng, -0.05, 0.05)],
  });
}

function horns(rng: Rng, refGirth: number): AppendageGene {
  return part('horn', 'claw', true, range(rng, 0, 0.6), {
    attachAzimuth: range(rng, 1.0, 1.7),
    attachElevation: range(rng, 0.3, 0.7),
    segments: randint(rng, 1, 2),
    length: clamp(refGirth * range(rng, 0.5, 1.0), A.length),
    thickness: clamp(refGirth * range(rng, 0.18, 0.32), A.thickness),
    taper: range(rng, 0.5, 0.7),
    curl: [range(rng, -0.1, 0.25), 0],
  });
}

function spine(rng: Rng, attachT: number, girth: number): AppendageGene {
  return part('spine', 'claw', false, range(rng, 0, 0.4), {
    attachT,
    attachAzimuth: Math.PI / 2, // straight up
    attachElevation: range(rng, -0.1, 0.1),
    segments: 1,
    length: clamp(girth * range(rng, 0.4, 0.8), A.length),
    thickness: clamp(girth * range(rng, 0.12, 0.22), A.thickness),
    taper: range(rng, 0.5, 0.65),
    curl: [0, 0],
  });
}

function antenna(rng: Rng, refGirth: number): AppendageGene {
  return part('antenna', 'none', true, 0.5, {
    attachT: range(rng, 0.85, 1.0),
    attachAzimuth: range(rng, 1.1, 1.5),
    attachElevation: range(rng, 0.3, 0.6),
    segments: randint(rng, 2, 3),
    length: clamp(refGirth * range(rng, 0.6, 1.1), A.length),
    thickness: clamp(refGirth * range(rng, 0.06, 0.12), A.thickness),
    taper: range(rng, 0.7, 0.9),
    curl: [range(rng, -0.3, 0.3), 0],
  });
}

function dorsalFin(rng: Rng, attachT: number, girth: number): AppendageGene {
  return part('fin', 'fin', false, range(rng, 0, 0.3), {
    attachT,
    attachAzimuth: Math.PI / 2,
    attachElevation: range(rng, -0.15, 0.05),
    segments: randint(rng, 1, 2),
    length: clamp(girth * range(rng, 0.7, 1.3), A.length),
    thickness: clamp(girth * range(rng, 0.22, 0.4), A.thickness),
    taper: range(rng, 0.5, 0.75),
    curl: [range(rng, -0.1, 0.2), 0],
  });
}

function pectoralFin(rng: Rng, attachT: number, girth: number): AppendageGene {
  return part('fin', 'fin', true, range(rng, 0, 0.3), {
    attachT,
    attachAzimuth: range(rng, 2.9, 3.5),
    attachElevation: range(rng, -0.2, 0.0),
    roll: range(rng, -0.4, 0.4),
    segments: randint(rng, 1, 2),
    length: clamp(girth * range(rng, 0.8, 1.4), A.length),
    thickness: clamp(girth * range(rng, 0.16, 0.3), A.thickness),
    taper: range(rng, 0.5, 0.75),
    curl: [range(rng, -0.1, 0.1), range(rng, -0.1, 0.1)],
  });
}

interface EyeOpts {
  style?: Rg;
  az?: number;
}
function eyes(rng: Rng, attachT: number, antennae: boolean, refGirth: number, o: EyeOpts = {}): AppendageGene {
  return part('eyestalk', 'eye', true, rg(rng, o.style, [0, 1]), {
    attachT: clamp(attachT, A.attachT),
    attachAzimuth: o.az ?? range(rng, 0.7, 1.3),
    attachElevation: range(rng, 0.1, 0.4),
    segments: antennae ? randint(rng, 2, 3) : 1,
    length: clamp(refGirth * range(rng, 0.45, 0.7), A.length),
    thickness: clamp(refGirth * range(rng, 0.24, 0.4), A.thickness),
    taper: range(rng, 0.85, 0.95),
    curl: [range(rng, -0.2, 0.1), 0],
  });
}

function mouth(rng: Rng, refGirth: number, style?: Rg): AppendageGene {
  return part('maw', 'mouth', false, rg(rng, style, [0, 1]), {
    attachT: range(rng, 0.85, 1.0),
    attachAzimuth: range(rng, 4.4, 5.0),
    attachElevation: range(rng, 0.0, 0.3),
    segments: 1,
    length: clamp(refGirth * range(rng, 0.4, 0.6), A.length),
    thickness: clamp(refGirth * range(rng, 0.22, 0.38), A.thickness),
    taper: 0.9,
    curl: [0, 0],
  });
}

// A radial arm; grow arrays it `radialCount` times around the body axis.
function arm(rng: Rng, girth: number, attachT: number, m: Morpho, spiky = false): AppendageGene {
  const term: Terminal =
    m.id === 'urchin' ? 'claw' : m.id === 'cephalopod' ? pick(rng, ['none', 'fin'] as const) : spiky ? pick(rng, ['eye', 'claw'] as const) : pick(rng, ['claw', 'fin', 'none'] as const);
  const long = m.id === 'cephalopod' || m.id === 'horror';
  return part(long ? 'tentacle' : 'spine', term, false, range(rng, 0, 1), {
    attachT: clamp(attachT, A.attachT),
    attachAzimuth: range(rng, 0, 0.4),
    attachElevation: long ? range(rng, -0.6, -0.1) : range(rng, -0.3, 0.3),
    segments: spiky ? randint(rng, 1, 2) : long ? randint(rng, 3, 5) : randint(rng, 2, 4),
    length: clamp(girth * range(rng, spiky ? 0.4 : long ? 0.9 : 0.6, spiky ? 0.8 : long ? 1.8 : 1.4), A.length),
    thickness: clamp(girth * range(rng, 0.12, 0.3), A.thickness),
    taper: range(rng, 0.6, 0.88),
    curl: [range(rng, -0.3, 0.4), range(rng, -0.1, 0.1)],
  });
}

// =============================================================================
// Wild fallback — free composition (the ~20% in-between tail)
// =============================================================================

function wild(rng: Rng, seed: number, symmetry: 'bilateral' | 'radial'): Genome {
  // pick a morphotype but shatter it: random legs/wings/fins/tail/horns regardless of prior
  const base: Morpho = pick(rng, MORPHOTYPES);
  const m: Morpho = {
    ...base,
    symmetry,
    legPairs: [Math.floor(rng() * 4)], // 0..3
    wings: rng() < 0.35 ? 1 : 0,
    dorsal: rng() < 0.4 ? 1 : 0,
    pectoral: rng() < 0.3 ? 1 : 0,
    tail: rng() < 0.5 ? 1 : 0,
    horns: rng() < 0.4 ? 1 : 0,
    spines: rng() < 0.3 ? 1 : 0,
    eyeStyle: [0, 1],
    mouthStyle: [0, 1],
    hue: [0, 1],
  };
  return compile(rng, seed, m);
}

// =============================================================================
// Helpers
// =============================================================================

/** Build an AppendageGene with v2 defaults; `o` supplies the required shape fields. */
function part(
  kind: PartKind,
  terminal: Terminal,
  pair: boolean,
  style: number,
  o: Pick<AppendageGene, 'attachAzimuth' | 'segments' | 'length' | 'thickness' | 'taper' | 'curl'> & Partial<AppendageGene>,
): AppendageGene {
  return { kind, style, attachT: 0.5, attachElevation: 0, roll: 0, terminal, pair, ...o };
}

function rg(rng: Rng, r: Rg | undefined, dflt: Rg = [0, 1]): number {
  return range(rng, ...(r ?? dflt));
}
function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
function randint(rng: Rng, min: number, max: number): number {
  return Math.round(range(rng, min, max));
}
