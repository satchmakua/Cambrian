/**
 * Random genome generation by **body-plan archetype** (DESIGN §4, ROADMAP M1).
 *
 * Instead of one uniform random chain (which reads as a stick/worm), each creature is
 * built from a recognizable archetype — quadruped, hexapod, fish, serpent, or a radial
 * crown — with proportions chosen to look like an *animal*: a chunky torso, limbs aimed
 * sensibly (legs down, fins out/up), and a distinct head. Every draw flows from the seed
 * (Pillar 3) and every gene stays within `GENE_BOUNDS` (Pillar 1).
 *
 * Coordinate reminder (DESIGN §4.1): +Y up, +Z forward, +X right. An appendage's
 * `attachAzimuth` sweeps the body cross-section: ~π/2 = up, ~3π/2 (4.2–5.0) = down,
 * ~0/π = out to the sides.
 */
import { mulberry32, range, type Rng } from './rng';
import { GENE_BOUNDS, clamp } from './bounds';
import {
  GENOME_VERSION,
  type Genome,
  type SegmentGene,
  type AppendageGene,
  type Palette,
} from './genome';

export type SymmetryMode = 'auto' | 'bilateral' | 'radial';

export function randomGenome(seed: number, mode: SymmetryMode = 'auto'): Genome {
  const s = seed >>> 0;
  const rng = mulberry32(s);
  return chooseArchetype(rng, mode)(rng, s);
}

type Archetype = (rng: Rng, seed: number) => Genome;

function chooseArchetype(rng: Rng, mode: SymmetryMode): Archetype {
  if (mode === 'radial') return radial;
  const bilateral: Archetype[] = [quadruped, quadruped, hexapod, fish, fish, serpent];
  if (mode === 'bilateral') return pick(rng, bilateral);
  // auto: ~75% bilateral, ~25% radial
  return rng() < 0.25 ? radial : pick(rng, bilateral);
}

// --- archetypes --------------------------------------------------------------

function quadruped(rng: Rng, seed: number): Genome {
  const girth = range(rng, 0.52, 0.78);
  return bilateralGenome(rng, seed, {
    size: [girth, girth * range(rng, 0.82, 1.0), girth * range(rng, 0.8, 1.05)],
    repeat: randint(rng, 3, 4),
    taper: range(rng, 0.9, 0.98),
    curve: [range(rng, -0.05, 0.02), range(rng, -0.03, 0.03)],
    appendages: [leg(rng, range(rng, 0.12, 0.22)), leg(rng, range(rng, 0.74, 0.9))],
    child: head(rng, girth),
  });
}

function hexapod(rng: Rng, seed: number): Genome {
  const girth = range(rng, 0.4, 0.52);
  return bilateralGenome(rng, seed, {
    size: [girth, girth * range(rng, 0.7, 0.9), girth * range(rng, 1.1, 1.5)],
    repeat: randint(rng, 4, 5),
    taper: range(rng, 0.92, 1.0),
    curve: [range(rng, -0.04, 0.04), 0],
    appendages: [leg(rng, 0.2), leg(rng, 0.5), leg(rng, 0.8)],
    child: head(rng, girth, /* antennae */ true),
  });
}

function fish(rng: Rng, seed: number): Genome {
  const girth = range(rng, 0.44, 0.62);
  return bilateralGenome(rng, seed, {
    // taller than wide, elongated, tapering to a caudal point
    size: [girth * range(rng, 0.65, 0.85), girth, girth * range(rng, 1.3, 1.7)],
    repeat: randint(rng, 4, 6),
    taper: range(rng, 0.76, 0.88),
    curve: [range(rng, -0.03, 0.03), 0],
    appendages: [
      dorsalFin(rng, range(rng, 0.35, 0.55)),
      pectoralFin(rng, range(rng, 0.25, 0.4)),
      eyes(rng, 0.9),
      mouth(rng),
    ],
  });
}

function serpent(rng: Rng, seed: number): Genome {
  const girth = range(rng, 0.33, 0.46);
  return bilateralGenome(rng, seed, {
    size: [girth, girth * range(rng, 0.9, 1.1), girth * range(rng, 1.0, 1.4)],
    repeat: randint(rng, 8, 14),
    taper: range(rng, 0.95, 1.0),
    curve: [range(rng, -0.1, 0.1), range(rng, 0.05, 0.16)], // winds in an S
    appendages: [],
    child: head(rng, girth),
  });
}

function radial(rng: Rng, seed: number): Genome {
  const girth = range(rng, 0.5, 0.85);
  return {
    version: GENOME_VERSION,
    seed,
    symmetry: 'radial',
    radialCount: randint(rng, GENE_BOUNDS.radialCount[0], GENE_BOUNDS.radialCount[1]),
    palette: randomPalette(rng),
    body: {
      // a short, fat dome; grow arrays the single arm into a crown
      size: [girth, girth * range(rng, 0.7, 1.0), girth * range(rng, 0.6, 0.9)],
      repeat: randint(rng, 1, 2),
      taper: range(rng, 0.8, 0.95),
      curve: [0, 0],
      appendages: [arm(rng)],
    },
  };
}

// --- shared genome scaffold --------------------------------------------------

function bilateralGenome(rng: Rng, seed: number, body: SegmentGene): Genome {
  return {
    version: GENOME_VERSION,
    seed,
    symmetry: 'bilateral',
    radialCount: 4,
    palette: randomPalette(rng),
    body,
  };
}

function head(rng: Rng, bodyGirth: number, antennae = false): SegmentGene {
  const g = bodyGirth * range(rng, 0.72, 1.02);
  const apps: AppendageGene[] = [];
  if (chance(rng, 0.92)) apps.push(eyes(rng, range(rng, 0.7, 0.98), antennae));
  if (chance(rng, 0.85)) apps.push(mouth(rng));
  return {
    size: [g, g * range(rng, 0.85, 1.05), g * range(rng, 0.8, 1.1)],
    repeat: randint(rng, 1, 2),
    taper: range(rng, 0.85, 1.0),
    curve: [range(rng, 0.0, 0.14), 0], // tips up a little
    appendages: apps,
  };
}

// A mouth on the lower-front of the face/snout. Rendered as a dark slit.
function mouth(rng: Rng): AppendageGene {
  return {
    attachT: range(rng, 0.85, 1.0),
    attachAzimuth: range(rng, 4.4, 5.0), // underside, facing down-forward
    segments: 1,
    length: range(rng, 0.2, 0.34),
    thickness: range(rng, 0.1, 0.2),
    taper: 0.9,
    curl: [0, 0],
    terminal: 'mouth',
    pair: false,
  };
}

// --- appendage builders (all within GENE_BOUNDS) -----------------------------

// A leg: down-and-out with a knee bend, ending in a foot or claw.
function leg(rng: Rng, attachT: number): AppendageGene {
  return {
    attachT: clamp(attachT, GENE_BOUNDS.appendage.attachT),
    attachAzimuth: range(rng, 4.0, 4.5), // lower hemisphere → points down & to the side
    segments: 3, // thigh → shin → foot
    length: range(rng, 0.3, 0.46),
    thickness: range(rng, 0.16, 0.26),
    taper: range(rng, 0.7, 0.85), // shin thins toward the foot
    curl: [range(rng, 0.4, 0.6), range(rng, -0.06, 0.06)], // a clear knee bend
    terminal: pick(rng, ['foot', 'claw'] as const),
    pair: true,
  };
}

// A dorsal fin: straight up, unpaired, swept back a touch.
function dorsalFin(rng: Rng, attachT: number): AppendageGene {
  return {
    attachT,
    attachAzimuth: Math.PI / 2,
    segments: randint(rng, 1, 2),
    length: range(rng, 0.3, 0.6),
    thickness: range(rng, 0.1, 0.22),
    taper: range(rng, 0.5, 0.75),
    curl: [range(rng, -0.1, 0.2), 0],
    terminal: 'fin',
    pair: false,
  };
}

// Pectoral fins: out to the sides, mirrored.
function pectoralFin(rng: Rng, attachT: number): AppendageGene {
  return {
    attachT,
    attachAzimuth: range(rng, 2.9, 3.5), // near π → straight out to the sides
    segments: randint(rng, 1, 2),
    length: range(rng, 0.4, 0.7),
    thickness: range(rng, 0.08, 0.16),
    taper: range(rng, 0.5, 0.75),
    curl: [range(rng, -0.1, 0.1), range(rng, -0.1, 0.1)],
    terminal: 'fin',
    pair: true,
  };
}

// Eyes (or antennae): up-and-forward, mirrored.
function eyes(rng: Rng, attachT: number, antennae = false): AppendageGene {
  return {
    attachT: clamp(attachT, GENE_BOUNDS.appendage.attachT),
    attachAzimuth: range(rng, 0.7, 1.3),
    segments: antennae ? randint(rng, 2, 3) : 1,
    length: range(rng, antennae ? 0.3 : 0.2, antennae ? 0.5 : 0.3),
    thickness: range(rng, antennae ? 0.06 : 0.1, antennae ? 0.1 : 0.16),
    taper: range(rng, 0.85, 0.95),
    curl: [range(rng, -0.2, 0.1), 0],
    terminal: 'eye',
    pair: true,
  };
}

// A radial arm: grow arrays it `radialCount` times around the body axis.
function arm(rng: Rng): AppendageGene {
  return {
    attachT: range(rng, 0.3, 0.6),
    attachAzimuth: range(rng, 0, 0.4),
    segments: randint(rng, 2, 4),
    length: range(rng, 0.4, 0.8),
    thickness: range(rng, 0.1, 0.2),
    taper: range(rng, 0.6, 0.85),
    curl: [range(rng, -0.2, 0.3), range(rng, -0.1, 0.1)],
    terminal: pick(rng, ['claw', 'fin', 'none'] as const),
    pair: false,
  };
}

function randomPalette(rng: Rng): Palette {
  return { hueA: rng(), hueB: rng(), sat: range(rng, 0.4, 0.85), light: range(rng, 0.35, 0.65) };
}

// --- helpers -----------------------------------------------------------------

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
