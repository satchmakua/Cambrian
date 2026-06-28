/**
 * Bounds-driven random genome generation (DESIGN §4, ROADMAP M1).
 *
 * Produces *coherent* random critters — recognizable bodies with limb belts, the
 * occasional fin, sometimes a head — rather than the maximally-chaotic genomes the
 * fuzz test throws at grow(). Every draw flows from the seed, so `randomGenome(s)` is
 * deterministic: the same seed always regrows the same creature (Pillar 3). Every gene
 * is produced within `GENE_BOUNDS`, so the result is always viable (Pillar 1).
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
  type Terminal,
} from './genome';

export function randomGenome(seed: number): Genome {
  const s = seed >>> 0;
  const rng = mulberry32(s);
  const symmetry = weightedSymmetry(rng);
  return {
    version: GENOME_VERSION,
    seed: s,
    symmetry,
    radialCount: randint(rng, GENE_BOUNDS.radialCount[0], GENE_BOUNDS.radialCount[1]),
    palette: randomPalette(rng),
    body: randomBody(rng),
  };
}

// --- structure ---------------------------------------------------------------

function randomBody(rng: Rng): SegmentGene {
  const seg: SegmentGene = {
    size: [range(rng, 0.3, 0.9), range(rng, 0.25, 0.8), range(rng, 0.4, 1.0)],
    repeat: randint(rng, 2, 12),
    taper: range(rng, 0.82, 1.05),
    curve: [range(rng, -0.12, 0.12), range(rng, -0.05, 0.05)],
    appendages: bodyAppendages(rng),
  };
  // ~60% of creatures get a head/tail segment, occasionally with eyes
  if (chance(rng, 0.6)) {
    seg.child = {
      size: [range(rng, 0.25, 0.55), range(rng, 0.25, 0.55), range(rng, 0.3, 0.6)],
      repeat: randint(rng, 1, 3),
      taper: range(rng, 0.8, 1.0),
      curve: [range(rng, -0.2, 0.2), 0],
      appendages: chance(rng, 0.7) ? [eyePair(rng)] : [],
    };
  }
  return seg;
}

function bodyAppendages(rng: Rng): AppendageGene[] {
  const out: AppendageGene[] = [];
  const legPairs = randint(rng, 1, 3);
  const terminal = pick(rng, ['foot', 'claw', 'fin'] as const);
  const segments = randint(rng, 2, 4);
  for (let i = 0; i < legPairs; i++) {
    const t = legPairs === 1 ? 0.5 : (i / (legPairs - 1)) * 0.7 + 0.15; // spread 0.15..0.85
    out.push(limb(rng, t, range(rng, Math.PI * 1.2, Math.PI * 1.8), segments, terminal));
  }
  if (chance(rng, 0.4)) out.push(dorsalFin(rng));
  if (chance(rng, 0.3)) out.push(limb(rng, 0.5, Math.PI / 2, randint(rng, 1, 2), 'fin')); // side fins
  return out;
}

// --- appendage archetypes ----------------------------------------------------

function limb(rng: Rng, attachT: number, azimuth: number, segments: number, terminal: Terminal): AppendageGene {
  return {
    attachT: clamp(attachT, GENE_BOUNDS.appendage.attachT),
    attachAzimuth: azimuth,
    segments,
    length: range(rng, 0.3, 0.7),
    thickness: range(rng, 0.08, 0.22),
    taper: range(rng, 0.7, 0.95),
    curl: [range(rng, 0.1, 0.5), range(rng, -0.1, 0.1)],
    terminal,
    pair: true,
  };
}

function dorsalFin(rng: Rng): AppendageGene {
  return {
    attachT: range(rng, 0.3, 0.7),
    attachAzimuth: Math.PI / 2, // straight up
    segments: randint(rng, 1, 3),
    length: range(rng, 0.3, 0.6),
    thickness: range(rng, 0.1, 0.25),
    taper: range(rng, 0.5, 0.8),
    curl: [range(rng, -0.1, 0.2), 0],
    terminal: 'fin',
    pair: false,
  };
}

function eyePair(rng: Rng): AppendageGene {
  return {
    attachT: range(rng, 0.7, 1),
    attachAzimuth: range(rng, 0.6, 1.2), // up-and-forward
    segments: 1,
    length: range(rng, 0.2, 0.3), // ≥ GENE_BOUNDS.appendage.length floor
    thickness: range(rng, 0.08, 0.16),
    taper: 0.9,
    curl: [range(rng, -0.3, 0), 0],
    terminal: 'eye',
    pair: true,
  };
}

function randomPalette(rng: Rng): Palette {
  return { hueA: rng(), hueB: rng(), sat: range(rng, 0.4, 0.85), light: range(rng, 0.35, 0.65) };
}

// --- small helpers -----------------------------------------------------------

function weightedSymmetry(rng: Rng): Symmetry {
  const r = rng();
  return r < 0.7 ? 'bilateral' : r < 0.9 ? 'radial' : 'none';
}
function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
/** Integer in [min, max] inclusive. */
function randint(rng: Rng, min: number, max: number): number {
  return Math.round(range(rng, min, max));
}
