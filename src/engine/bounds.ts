/**
 * Growth invariants and per-gene bounds (DESIGN §4.3–§4.4).
 *
 * Bounded genes are what keep *most* mutations viable (Pillar 1), and the growth
 * caps are what keep *any* evolved skeleton meshable without exploding (Pillar 2).
 * Everything tunable lives here, in one place.
 */

/** Hard growth invariants — enforced by grow(), asserted by the fuzz test. */
export const R_MIN = 0.04; // minimum capsule radius (bu); no node may be thinner
export const NODE_MAX = 640; // total skeleton nodes; expansion stops if this is hit
export const DEPTH_MAX = 4; // maximum SegmentGene `child` recursion depth

/** Inclusive numeric bounds for every mutable gene. [min, max]. */
export const GENE_BOUNDS = {
  segment: {
    size: [0.15, 2.5] as [number, number], // ellipsoid radius per axis (bu)
    repeat: [1, 24] as [number, number], // links in this segment chain (spine length)
    taper: [0.6, 1.15] as [number, number], // per-link size multiplier
    curvePitch: [-0.5, 0.5] as [number, number], // radians per link
    curveYaw: [-0.5, 0.5] as [number, number],
    appendageCount: [0, 16] as [number, number], // legs+wings+fins+tail+spines can stack (NODE_MAX is the real cap)
  },
  appendage: {
    style: [0, 1] as [number, number], // selects render variant (eye/mouth/etc. style)
    attachT: [0, 1] as [number, number], // position along the segment chain
    attachAzimuth: [0, Math.PI * 2] as [number, number], // angle around the body axis
    attachElevation: [-Math.PI / 2, Math.PI / 2] as [number, number], // tilt fwd/back (v2 aim)
    roll: [-Math.PI, Math.PI] as [number, number], // roll about the part axis (v2 aim)
    segments: [1, 6] as [number, number], // limb length (its own recursion depth)
    length: [0.2, 2.0] as [number, number], // per limb-segment (bu)
    thickness: [0.05, 0.6] as [number, number], // limb radius (bu)
    taper: [0.5, 1.0] as [number, number], // limb thinning toward the tip
    curlPitch: [-0.6, 0.6] as [number, number], // radians per limb segment
    curlYaw: [-0.6, 0.6] as [number, number],
  },
  radialCount: [3, 12] as [number, number], // up to 12 for many-tentacled cephalopods (v2)
  covering: {
    patternScale: [0.5, 8] as [number, number], // pattern spatial frequency
    patternContrast: [0, 1] as [number, number], // pattern strength
    sheen: [0, 1] as [number, number], // matte ↔ wet/iridescent
  },
  palette: {
    hue: [0, 1] as [number, number],
    sat: [0, 1] as [number, number],
    light: [0.2, 0.8] as [number, number],
  },
} as const;

/** Clamp a value to an inclusive [min, max] bound. */
export function clamp(value: number, [min, max]: readonly [number, number]): number {
  return value < min ? min : value > max ? max : value;
}
