/**
 * Random genome generation (DESIGN §4, ROADMAP M1).
 *
 * NOT five fixed archetypes — that over-fits creatures to a handful of molds. Instead a
 * creature is **composed from independent traits**: a body on a length/girth continuum,
 * 0–3 leg pairs, optional dorsal/pectoral fins, an optional head + face. The familiar
 * forms emerge as *common cases* (compact body + 2 legs + head = quadruped; deep body +
 * 0 legs + fins = fish; long body + 3 legs = centipede) but so do hybrids in between.
 * Proportions stay animal-like (fat overlapping body, legs sized to the body, reaching
 * down). Every draw flows from the seed (Pillar 3); every gene stays within
 * `GENE_BOUNDS` (Pillar 1).
 *
 * Coordinate reminder (DESIGN §4.1): +Y up, +Z forward, +X right. An appendage's
 * `attachAzimuth` sweeps the cross-section: ~π/2 = up, ~4.2 = down, ~0/π = out to the sides.
 */
import { mulberry32, range, type Rng } from './rng';
import { GENE_BOUNDS, clamp } from './bounds';
import {
  GENOME_VERSION,
  type Genome,
  type SegmentGene,
  type AppendageGene,
  type Palette,
  type Symmetry,
} from './genome';

export type SymmetryMode = 'auto' | 'bilateral' | 'radial';

export function randomGenome(seed: number, mode: SymmetryMode = 'auto'): Genome {
  const s = seed >>> 0;
  const rng = mulberry32(s);
  const symmetry: Symmetry =
    mode === 'radial' ? 'radial' : mode === 'bilateral' ? 'bilateral' : rng() < 0.28 ? 'radial' : 'bilateral';
  return symmetry === 'radial' ? radial(rng, s) : bilateral(rng, s);
}

// --- bilateral: compose body + limbs + fins + head from independent traits ----

function bilateral(rng: Rng, seed: number): Genome {
  const girth = range(rng, 0.32, 0.72);
  const lengthClass = rng(); // 0 = stubby … 1 = serpentine
  const repeat = Math.round(lerp(2, 13, Math.pow(lengthClass, 1.4)));
  const elong = range(rng, 0.85, 1.35);
  const heightRatio = range(rng, 0.7, 1.1); // <1 flat, >1 deep (fish-like)
  const winds = lengthClass > 0.45 && chance(rng, 0.5);

  const appendages: AppendageGene[] = [];

  // limb plan — number of leg pairs is its own trait (0..3)
  const legPairs = weighted(rng, [
    [0, 0.22],
    [1, 0.2],
    [2, 0.38],
    [3, 0.2],
  ]);
  const legTerm = pick(rng, ['foot', 'claw'] as const);
  for (let i = 0; i < legPairs; i++) {
    const t = legPairs === 1 ? range(rng, 0.35, 0.6) : (i / (legPairs - 1)) * 0.68 + 0.16;
    appendages.push(leg(rng, t, girth, legTerm));
  }

  // fins — independent of legs (a creature can have both, either, or neither)
  if (chance(rng, legPairs === 0 ? 0.62 : 0.3)) appendages.push(dorsalFin(rng, range(rng, 0.3, 0.6), girth));
  if (chance(rng, legPairs === 0 ? 0.55 : 0.25)) appendages.push(pectoralFin(rng, range(rng, 0.25, 0.45), girth));

  const body: SegmentGene = {
    size: [girth, girth * heightRatio, girth * elong],
    repeat,
    taper: clamp(range(rng, 0.84, 1.0) - lengthClass * 0.03, GENE_BOUNDS.segment.taper),
    curve: [range(rng, -0.05, 0.03), winds ? range(rng, 0.05, 0.16) * (chance(rng, 0.5) ? -1 : 1) : range(rng, -0.02, 0.02)],
    appendages,
  };

  // head & face: usually a distinct head; otherwise eyes/mouth on the body's front
  if (chance(rng, 0.82)) {
    body.child = head(rng, girth, chance(rng, 0.28));
  } else {
    appendages.push(eyes(rng, range(rng, 0.85, 0.98), false, girth));
    if (chance(rng, 0.8)) appendages.push(mouth(rng, girth));
  }

  return scaffold(rng, seed, 'bilateral', body);
}

// --- radial: a domed body with a crown (or two) of arms --------------------

function radial(rng: Rng, seed: number): Genome {
  const girth = range(rng, 0.45, 0.85);
  const dome = range(rng, 0.55, 1.15);
  const apps: AppendageGene[] = [arm(rng, girth, range(rng, 0.3, 0.6))];
  // sometimes a second, smaller ring (spikes / eye-tips) for variety
  if (chance(rng, 0.35)) apps.push(arm(rng, girth * 0.6, range(rng, 0.45, 0.75), true));

  const body: SegmentGene = {
    size: [girth, girth * dome, girth * range(rng, 0.6, 0.95)],
    repeat: randint(rng, 1, 3),
    taper: range(rng, 0.8, 0.95),
    curve: [0, 0],
    appendages: apps,
  };
  const g = scaffold(rng, seed, 'radial', body);
  g.radialCount = randint(rng, GENE_BOUNDS.radialCount[0], GENE_BOUNDS.radialCount[1]);
  return g;
}

function scaffold(rng: Rng, seed: number, symmetry: Symmetry, body: SegmentGene): Genome {
  return { version: GENOME_VERSION, seed, symmetry, radialCount: 4, palette: randomPalette(rng), body };
}

// --- parts (sized to the body girth, clamped to bounds) ----------------------

function head(rng: Rng, bodyGirth: number, antennae: boolean): SegmentGene {
  const g = bodyGirth * range(rng, 0.7, 1.05);
  const apps: AppendageGene[] = [];
  if (chance(rng, 0.92)) apps.push(eyes(rng, range(rng, 0.7, 0.98), antennae, g));
  if (chance(rng, 0.85)) apps.push(mouth(rng, g));
  return {
    size: [g, g * range(rng, 0.85, 1.05), g * range(rng, 0.8, 1.1)],
    repeat: randint(rng, 1, 2),
    taper: range(rng, 0.85, 1.0),
    curve: [range(rng, 0.0, 0.14), 0],
    appendages: apps,
  };
}

// A leg: down-and-out with a knee, sized so it reaches the ground for this body.
function leg(rng: Rng, attachT: number, girth: number, terminal: 'foot' | 'claw'): AppendageGene {
  return {
    attachT: clamp(attachT, GENE_BOUNDS.appendage.attachT),
    attachAzimuth: range(rng, 4.0, 4.5),
    segments: 3, // thigh → shin → foot
    length: clamp(girth * range(rng, 0.44, 0.64), GENE_BOUNDS.appendage.length),
    thickness: clamp(girth * range(rng, 0.3, 0.46), GENE_BOUNDS.appendage.thickness),
    taper: range(rng, 0.7, 0.85),
    curl: [range(rng, 0.4, 0.6), range(rng, -0.06, 0.06)],
    terminal,
    pair: true,
  };
}

function dorsalFin(rng: Rng, attachT: number, girth: number): AppendageGene {
  return {
    attachT,
    attachAzimuth: Math.PI / 2,
    segments: randint(rng, 1, 2),
    length: clamp(girth * range(rng, 0.7, 1.3), GENE_BOUNDS.appendage.length),
    thickness: clamp(girth * range(rng, 0.22, 0.4), GENE_BOUNDS.appendage.thickness),
    taper: range(rng, 0.5, 0.75),
    curl: [range(rng, -0.1, 0.2), 0],
    terminal: 'fin',
    pair: false,
  };
}

function pectoralFin(rng: Rng, attachT: number, girth: number): AppendageGene {
  return {
    attachT,
    attachAzimuth: range(rng, 2.9, 3.5), // out to the sides
    segments: randint(rng, 1, 2),
    length: clamp(girth * range(rng, 0.8, 1.4), GENE_BOUNDS.appendage.length),
    thickness: clamp(girth * range(rng, 0.16, 0.3), GENE_BOUNDS.appendage.thickness),
    taper: range(rng, 0.5, 0.75),
    curl: [range(rng, -0.1, 0.1), range(rng, -0.1, 0.1)],
    terminal: 'fin',
    pair: true,
  };
}

function eyes(rng: Rng, attachT: number, antennae: boolean, refGirth: number): AppendageGene {
  return {
    attachT: clamp(attachT, GENE_BOUNDS.appendage.attachT),
    attachAzimuth: range(rng, 0.7, 1.3),
    segments: antennae ? randint(rng, 2, 3) : 1,
    length: clamp(refGirth * range(rng, antennae ? 0.8 : 0.45, antennae ? 1.4 : 0.7), GENE_BOUNDS.appendage.length),
    thickness: clamp(refGirth * range(rng, antennae ? 0.14 : 0.24, antennae ? 0.22 : 0.4), GENE_BOUNDS.appendage.thickness),
    taper: range(rng, 0.85, 0.95),
    curl: [range(rng, -0.2, 0.1), 0],
    terminal: 'eye',
    pair: true,
  };
}

function mouth(rng: Rng, refGirth: number): AppendageGene {
  return {
    attachT: range(rng, 0.85, 1.0),
    attachAzimuth: range(rng, 4.4, 5.0), // underside, facing down-forward
    segments: 1,
    length: clamp(refGirth * range(rng, 0.4, 0.6), GENE_BOUNDS.appendage.length),
    thickness: clamp(refGirth * range(rng, 0.22, 0.38), GENE_BOUNDS.appendage.thickness),
    taper: 0.9,
    curl: [0, 0],
    terminal: 'mouth',
    pair: false,
  };
}

// A radial arm; grow arrays it `radialCount` times around the body axis.
function arm(rng: Rng, girth: number, attachT: number, spiky = false): AppendageGene {
  return {
    attachT: clamp(attachT, GENE_BOUNDS.appendage.attachT),
    attachAzimuth: range(rng, 0, 0.4),
    segments: spiky ? randint(rng, 1, 2) : randint(rng, 2, 4),
    length: clamp(girth * range(rng, spiky ? 0.4 : 0.6, spiky ? 0.8 : 1.4), GENE_BOUNDS.appendage.length),
    thickness: clamp(girth * range(rng, 0.16, 0.34), GENE_BOUNDS.appendage.thickness),
    taper: range(rng, 0.6, 0.88),
    curl: [range(rng, -0.3, 0.4), range(rng, -0.1, 0.1)],
    terminal: spiky ? pick(rng, ['eye', 'claw'] as const) : pick(rng, ['claw', 'fin', 'none'] as const),
    pair: false,
  };
}

function randomPalette(rng: Rng): Palette {
  return { hueA: rng(), hueB: rng(), sat: range(rng, 0.4, 0.85), light: range(rng, 0.35, 0.65) };
}

// --- helpers -----------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
/** Weighted choice from [value, weight] pairs. */
function weighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}
