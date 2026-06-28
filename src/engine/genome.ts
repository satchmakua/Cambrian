/**
 * The generative genome (DESIGN §4.3).
 *
 * The genome stores *growth rules*, not vertex positions — a one-gene change
 * ("repeat this segment 3 more times", "recurse this limb deeper") restructures the
 * whole body. This is the encoding that makes "wildly different forms" reachable.
 */

export const GENOME_VERSION = 1 as const;

export type Symmetry = 'bilateral' | 'radial' | 'none';
export type Terminal = 'none' | 'foot' | 'fin' | 'claw' | 'eye';
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
  return {
    version: GENOME_VERSION,
    seed,
    symmetry: 'bilateral',
    radialCount: 4,
    palette: { hueA: 0.07, hueB: 0.55, sat: 0.55, light: 0.5 },
    body: {
      size: [0.55, 0.45, 0.7],
      repeat: 6,
      taper: 0.9,
      curve: [-0.04, 0],
      appendages: [
        // front leg pair
        legPair(0.2, 0.55),
        // hind leg pair
        legPair(0.7, 0.55),
        // dorsal fin (unpaired, on top)
        {
          attachT: 0.45,
          attachAzimuth: Math.PI / 2,
          segments: 2,
          length: 0.5,
          thickness: 0.18,
          taper: 0.6,
          curl: [0.1, 0],
          terminal: 'fin',
          pair: false,
        },
      ],
      // a small head segment
      child: {
        size: [0.4, 0.42, 0.4],
        repeat: 2,
        taper: 0.85,
        curve: [0.12, 0],
        appendages: [eyePair(0.9, 0.4)],
      },
    },
  };
}

function legPair(attachT: number, azimuth: number): AppendageGene {
  return {
    attachT,
    attachAzimuth: azimuth,
    segments: 3,
    length: 0.42,
    thickness: 0.16,
    taper: 0.8,
    curl: [0.35, 0],
    terminal: 'foot',
    pair: true,
  };
}

function eyePair(attachT: number, azimuth: number): AppendageGene {
  return {
    attachT,
    attachAzimuth: azimuth,
    segments: 1,
    length: 0.22,
    thickness: 0.12,
    taper: 0.9,
    curl: [-0.2, 0],
    terminal: 'eye',
    pair: true,
  };
}
