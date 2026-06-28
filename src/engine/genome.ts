/**
 * The generative genome (DESIGN §4.3).
 *
 * The genome stores *growth rules*, not vertex positions — a one-gene change
 * ("repeat this segment 3 more times", "recurse this limb deeper") restructures the
 * whole body. This is the encoding that makes "wildly different forms" reachable.
 */

export const GENOME_VERSION = 1 as const;

export type Symmetry = 'bilateral' | 'radial' | 'none';
export type Terminal = 'none' | 'foot' | 'fin' | 'claw' | 'eye' | 'mouth';
export type Vec3 = [number, number, number];

export interface Genome {
  version: typeof GENOME_VERSION;
  seed: number; // uint32 — drives deterministic growth jitter
  symmetry: Symmetry;
  radialCount: number; // 3..8, used only when symmetry === 'radial'
  body: SegmentGene; // root of the recursive body description
  palette: Palette;
}

export interface SegmentGene {
  size: Vec3; // ellipsoid radii (bu) — proportions
  repeat: number; // how many times this segment chains (spine length!)
  taper: number; // per-link size multiplier along the chain
  curve: [number, number]; // [pitchPerLink, yawPerLink] radians — arcs / necks
  appendages: AppendageGene[];
  child?: SegmentGene; // next body section (head / tail) — recursion
}

export interface AppendageGene {
  attachT: number; // 0..1 — position along the segment chain it sprouts from
  attachAzimuth: number; // 0..2π — angle around the body axis
  segments: number; // limb length (its own recursion depth)
  length: number; // per limb-segment (bu)
  thickness: number; // limb radius (bu)
  taper: number; // limb thinning toward the tip
  curl: [number, number]; // [pitchPerSeg, yawPerSeg] radians — bend / curl
  terminal: Terminal;
  pair: boolean; // mirror across X=0 (bilateral)
}

export interface Palette {
  hueA: number; // 0..1
  hueB: number; // 0..1
  sat: number; // 0..1
  light: number; // 0..1
}

/**
 * A hand-tuned demo creature for M0: a short-bodied quadruped-ish critter with two
 * mirrored leg pairs and stubby fins. Deterministic — `seed` only perturbs jitter.
 * (M1 replaces this with bounds-driven random genomes; M2 adds mutation.)
 */
export function defaultGenome(seed = 0xc0ffee): Genome {
  const girth = 0.6;
  return {
    version: GENOME_VERSION,
    seed,
    symmetry: 'bilateral',
    radialCount: 4,
    palette: { hueA: 0.08, hueB: 0.55, sat: 0.55, light: 0.5 },
    body: {
      size: [girth, girth * 0.92, girth * 1.0], // width, height, forward stretch
      repeat: 3,
      taper: 0.95,
      curve: [-0.03, 0],
      appendages: [legPair(0.18), legPair(0.82)], // front + hind legs
      // a distinct head with eyes and a mouth
      child: {
        size: [0.45, 0.46, 0.42],
        repeat: 2,
        taper: 0.9,
        curve: [0.1, 0],
        appendages: [
          eyePair(0.85),
          {
            attachT: 0.95,
            attachAzimuth: 4.71, // straight down — under the snout
            segments: 1,
            length: 0.24,
            thickness: 0.16,
            taper: 0.9,
            curl: [0, 0],
            terminal: 'mouth',
            pair: false,
          },
        ],
      },
    },
  };
}

// Legs aim down-and-out (azimuth ≈ 4.2 rad is the lower hemisphere) with a knee bend.
function legPair(attachT: number): AppendageGene {
  return {
    attachT,
    attachAzimuth: 4.2,
    segments: 3,
    length: 0.36,
    thickness: 0.2,
    taper: 0.8,
    curl: [0.45, 0],
    terminal: 'foot',
    pair: true,
  };
}

// Eyes aim up-and-forward (azimuth ≈ 1.0 rad) on the head.
function eyePair(attachT: number): AppendageGene {
  return {
    attachT,
    attachAzimuth: 1.0,
    segments: 1,
    length: 0.22,
    thickness: 0.13,
    taper: 0.9,
    curl: [-0.15, 0],
    terminal: 'eye',
    pair: true,
  };
}
