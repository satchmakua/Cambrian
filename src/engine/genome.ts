/**
 * The generative genome (DESIGN §4.3, MORPHOLOGY §3).
 *
 * The genome stores *growth rules*, not vertex positions. **v2** gives every part a
 * full **spherical aim** (azimuth + elevation + roll) and a `kind`, so parts can point
 * anywhere — tails back, fins/horns up, wings out-and-back — which the v1 sideways-only
 * splay could not express. This is the foundation of the creature grammar (MORPHOLOGY).
 */

export const GENOME_VERSION = 2 as const;

export type Symmetry = 'bilateral' | 'radial' | 'none';
/**
 * The tip cap of a part — drives its distinct feature geometry (MORPHOLOGY §6). The M9 core
 * (foot/fin/claw/eye/mouth/pincer) is joined in M23 by tail terminals (club/barb) and the
 * deferred decorative parts (ear/gill/crest/carapace/whisker), each a recognizable crude solid.
 */
export type Terminal =
  | 'none'
  | 'foot'
  | 'fin'
  | 'claw'
  | 'eye'
  | 'mouth'
  | 'pincer'
  | 'club' // a tail mace
  | 'barb' // a tail sting
  | 'ear' // a mammal ear (pointed / leaf / round by style)
  | 'gill' // a rake of slits
  | 'crest' // a feathered fan
  | 'carapace' // a domed shell over a region
  | 'whisker'; // a fan of fine filaments
/** What a part *is* (semantic). Tip shape is `terminal`; geometry per kind lands in M9/M23. */
export type PartKind =
  | 'leg'
  | 'arm'
  | 'wing'
  | 'fin'
  | 'tail'
  | 'horn'
  | 'spine'
  | 'frill'
  | 'antenna'
  | 'tentacle'
  | 'eyestalk'
  | 'maw'
  | 'plate' // a scute / carapace shell
  | 'ear'
  | 'gill'
  | 'crest'
  | 'whisker';
export type Vec3 = [number, number, number];

/** What the skin is *made of* — drives surface relief (bump) + material (MORPHOLOGY §7.2). */
export type CoveringType = 'skin' | 'scales' | 'fur' | 'feathers' | 'chitin' | 'slime' | 'plates';
/** The color field painted over the skin (MORPHOLOGY §7.1). */
export type PatternType =
  | 'plain'
  | 'stripes'
  | 'bands'
  | 'spots'
  | 'ocelli'
  | 'reticulate'
  | 'mottle'
  | 'gradient';

export interface Genome {
  version: typeof GENOME_VERSION;
  seed: number; // uint32 — drives deterministic growth jitter
  symmetry: Symmetry;
  radialCount: number; // 3..8, used only when symmetry === 'radial'
  body: SegmentGene; // root of the recursive body description
  covering: Covering;
  palette: Palette;
  /**
   * Structural coherence ∈ [0,1] — the "weirdness" dial (M24). Growth's bauplan pass pulls limbs onto
   * a canonical body-plan layout and guarantees the face, lerped by this: 1 = perfectly canonical, low
   * = the limbs/proportions wander (deliberate uncanny). Optional; absent ⇒ fully coherent (1).
   */
  coherence?: number;
}

export interface SegmentGene {
  size: Vec3; // ellipsoid radii (bu) — proportions
  repeat: number; // how many times this segment chains (spine length!)
  taper: number; // per-link size multiplier along the chain
  curve: [number, number]; // [pitchPerLink, yawPerLink] radians — arcs / necks
  appendages: AppendageGene[];
  child?: SegmentGene; // next body section (head / tail) — recursion
}

/**
 * A part attached along a segment chain. Its base direction is the spherical aim
 * (MORPHOLOGY §3.1):
 *   dir = cos(elev)·(cos(az)·X + sin(az)·Y) + sin(elev)·Z
 * az sweeps the cross-section (π/2 = up, 3π/2 = down, 0/π = sides); elev tilts toward
 * the body axis (+π/2 = forward, −π/2 = back); roll orients flat parts.
 */
export interface AppendageGene {
  kind: PartKind;
  style: number; // 0..1 — selects among that kind/terminal's render variants (MORPHOLOGY §6)
  attachT: number; // 0..1 — position along the segment chain
  attachAzimuth: number; // 0..2π — angle around the body axis
  attachElevation: number; // -π/2..π/2 — tilt toward the body axis (+forward / −back)
  roll: number; // -π..π — roll about the part's own axis (flat parts)
  segments: number; // articulation depth
  length: number; // per segment (bu)
  thickness: number; // radius (bu)
  taper: number; // thinning toward the tip
  curl: [number, number]; // [pitchPerSeg, yawPerSeg] radians — joints / bend
  terminal: Terminal;
  pair: boolean; // mirror across X=0 (bilateral)
}

/**
 * The procedural skin (MORPHOLOGY §7). `type` picks the surface relief + material
 * preset; `pattern` picks the in-shader color field; the numeric genes tune both. No
 * asset files — everything is generated in-shader from these + the seed.
 */
export interface Covering {
  type: CoveringType;
  pattern: PatternType;
  patternScale: number; // spatial frequency of the pattern (bu⁻¹)
  patternContrast: number; // 0 = invisible … 1 = bold
  sheen: number; // 0 matte … 1 wet/iridescent
}

export interface Palette {
  hueA: number; // 0..1
  hueB: number; // 0..1
  sat: number; // 0..1
  light: number; // 0..1
}

/**
 * A hand-tuned demo creature: a short-bodied quadruped with two leg pairs, a tail
 * (now aimed *backward* — the v2 unlock), a head with eyes + mouth, and a pair of
 * horns aimed up-and-forward. Deterministic — `seed` only perturbs jitter.
 */
export function defaultGenome(seed = 0xc0ffee): Genome {
  const girth = 0.6;
  return {
    version: GENOME_VERSION,
    seed,
    symmetry: 'bilateral',
    radialCount: 4,
    coherence: 1,
    covering: { type: 'fur', pattern: 'spots', patternScale: 3.5, patternContrast: 0.55, sheen: 0.12 },
    palette: { hueA: 0.08, hueB: 0.55, sat: 0.55, light: 0.5 },
    body: {
      size: [girth, girth * 0.92, girth * 1.0],
      repeat: 3,
      taper: 0.95,
      curve: [-0.03, 0],
      appendages: [legPair(0.2), legPair(0.82), tail(0.0)],
      child: {
        size: [0.45, 0.46, 0.42],
        repeat: 2,
        taper: 0.9,
        curve: [0.1, 0],
        appendages: [eyePair(0.85), mouthPart(0.95), hornPair(0.5)],
      },
    },
  };
}

// Legs: down-and-out (azimuth ≈ 4.2, lower hemisphere), elevation 0, knee bend.
function legPair(attachT: number): AppendageGene {
  return {
    kind: 'leg',
    style: 0.3,
    attachT,
    attachAzimuth: 4.2,
    attachElevation: 0,
    roll: 0,
    segments: 3,
    length: 0.36,
    thickness: 0.2,
    taper: 0.8,
    curl: [0.45, 0],
    terminal: 'foot',
    pair: true,
  };
}

// Tail: aimed BACK and slightly down — only expressible with v2 elevation.
function tail(attachT: number): AppendageGene {
  return {
    kind: 'tail',
    style: 0.2,
    attachT,
    attachAzimuth: 4.71, // down...
    attachElevation: -1.0, // ...and back (the unlock)
    roll: 0,
    segments: 5,
    length: 0.34,
    thickness: 0.18,
    taper: 0.7,
    curl: [0.05, 0],
    terminal: 'none',
    pair: false,
  };
}

// Horns: up-and-forward on the head.
function hornPair(attachT: number): AppendageGene {
  return {
    kind: 'horn',
    style: 0.2,
    attachT,
    attachAzimuth: 1.4, // up, slightly to the side
    attachElevation: 0.5, // forward
    roll: 0,
    segments: 2,
    length: 0.26,
    thickness: 0.12,
    taper: 0.55,
    curl: [0.1, 0],
    terminal: 'claw',
    pair: true,
  };
}

// Eyes: up-and-forward on the head.
function eyePair(attachT: number): AppendageGene {
  return {
    kind: 'eyestalk',
    style: 0.0, // round eye
    attachT,
    attachAzimuth: 1.0,
    attachElevation: 0.3,
    roll: 0,
    segments: 1,
    length: 0.22,
    thickness: 0.13,
    taper: 0.9,
    curl: [-0.15, 0],
    terminal: 'eye',
    pair: true,
  };
}

// Mouth: on the front of the face (down-and-forward), big enough to read as an organ.
function mouthPart(attachT: number): AppendageGene {
  return {
    kind: 'maw',
    style: 0.1, // a toothed maw
    attachT,
    attachAzimuth: 4.71, // down…
    attachElevation: 0.65, // …and well forward, so it sits on the face, not the underside
    roll: 0,
    segments: 1,
    length: 0.26,
    thickness: 0.28,
    taper: 0.9,
    curl: [0, 0],
    terminal: 'mouth',
    pair: false,
  };
}
