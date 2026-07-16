/**
 * The baleen mouth (mouth overhaul) — a filter-feeder slot: a fringed keratin curtain hanging in
 * a huge lower jaw line, replacing the legacy floating box-and-bars assembly.
 *
 * Everything anchors to the surface-projected mouth line (`mouthLine.ts`): a modest upper lip and
 * a FAT lower lip (the whale's heavy jaw) are variable-radius tubes swept along the true-lip
 * curves; ~13 baleen plates hang from the upper curve — their frames come from `toothRow` (roots
 * interpolate the same on-surface samples, so floating is impossible by construction) but each
 * renders as its OWN thin box, narrow along the lip line and broad front-to-back, an anisotropy
 * one shared fang instance can't express (13 meshes is cheap). A dark interior sheet spans the
 * opening behind the curtain. No teeth — the curtain IS the feeding surface. Everything scales in
 * multiples of r; max forward protrusion stays under 0.4·r (the lips reach 0.17·r off the skin).
 *
 * Geometry is authored NODE-RELATIVE (world minus the mouth node's rest position, no rotation), so
 * the feature group's per-frame translation carries the whole mouth with the animated head.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Phenotype } from '../../engine/grow';
import type { Carve } from '../bodyField';
import type { MeshFeature } from '../meshData';
import { buildMouthLine, mouthSpec, type MouthSample, type SkinSurface } from '../mouthLine';
import { sweepTube, type SweepPoint } from '../sweep';
import { toothRow, type ToothProfile, type ToothXform } from '../teeth';
import { INTERIOR, LIP } from './palette';
import { interiorSheet, relRow } from './shared';

// Pale grimy whalebone — lighter than beak KERATIN but still bone-dark, never white.
const BALEEN_KERATIN = 0x9a8d72;

// lip radii (× r) at |t| = u — a modest upper lip over the heavy jaw line, thinning to the corners
const upperLipR = (u: number) => 0.09 - 0.03 * u * u;
const lowerLipR = (u: number) => 0.17 - 0.05 * u * u;

// the curtain: center plates hang longest, seeded raggedness + alternating rock, roots in the gum
const CURTAIN: ToothProfile = {
  count: 13,
  len: (u) => 0.5 - 0.18 * u,
  width: 0.1, // unused — plates carry their own anisotropic box scale, not the fang taper
  curl: 0.05,
  jitterLen: 0.12,
  jitterRock: 0.08,
  sink: 0.15,
  margin: 0.12,
  salt: 2,
};

export interface BaleenBuild {
  r: number;
  upper: MouthSample[]; // node-relative anchor rows every piece derives from
  lower: MouthSample[];
  upperLip: THREE.BufferGeometry;
  lowerLip: THREE.BufferGeometry;
  plate: THREE.BufferGeometry; // shared unit box — root at the origin, hanging along +Y
  plates: ToothXform[]; // per-plate frames off the upper curve (+Y = hang axis, +Z ≈ out of face)
  interior: THREE.BufferGeometry;
}

/** Pure build (headless-testable): all baleen geometry + plate frames, node-relative. */
export function buildBaleen(
  phenotype: Phenotype,
  idx: number,
  carves: readonly Carve[],
  recessed: boolean,
  surface: SkinSurface = 'kit',
): BaleenBuild | null {
  const spec = mouthSpec(phenotype, idx);
  if (!spec) return null;
  const r = spec.r;
  const seed = phenotype.genomeRef.seed;
  const line = buildMouthLine(phenotype, spec, carves, 17, surface);
  const o = spec.node.pos; // node-relative frame origin

  const upper = relRow(line.upper, o);
  const lower = relRow(line.lower, o);

  // lips — swept along the true-lip curves, flattened onto the skin; the lower is the fat one
  const lipPts = (row: MouthSample[]): SweepPoint[] => row.map((s) => ({ p: s.p, n: s.n }));
  const upperLip = sweepTube(lipPts(upper), {
    radius: (u) => r * upperLipR(Math.abs(u * 2 - 1)),
    flatten: 0.6,
    radialSegments: 10,
  });
  const lowerLip = sweepTube(lipPts(lower), {
    radius: (u) => r * lowerLipR(Math.abs(u * 2 - 1)),
    flatten: 0.6,
    radialSegments: 10,
  });

  // the curtain — plate frames hang off the upper curve exactly like a tooth row (mirrored
  // jitter keeps M18 symmetry); rendering stretches each into a thin, broad plate
  const plates = toothRow(upper, CURTAIN, r, seed);

  // clamp the curtain to the real opening: measure the mid-mouth gape (middle upper sample →
  // middle lower sample, both node-relative) and uniformly shrink every plate so the longest
  // hangs at most 0.92× that separation — the curtain must never punch through the fat lower lip
  const mu = upper[(upper.length / 2) | 0].p;
  const ml = lower[(lower.length / 2) | 0].p;
  const opening = Math.hypot(ml[0] - mu[0], ml[1] - mu[1], ml[2] - mu[2]);
  const longest = plates.reduce((m, pl) => Math.max(m, pl.len), 0);
  if (longest > opening * 0.92) {
    const shrink = (opening * 0.92) / longest;
    for (const pl of plates) pl.len *= shrink;
  }

  // shared plate box: root plane at y = 0 so the scaled plate hangs from its root, not through it
  const plate = new THREE.BoxGeometry(1, 1, 1);
  plate.translate(0, 0.5, 0);

  // the interior — a sheet spanning the opening behind the curtain: recessed into the real carve
  // on smooth skin, a hair proud of the capsule kit as a dark backdrop between the plates
  const inset = recessed ? -0.34 * r : 0.012 * r;
  const interior = interiorSheet(upper, lower, inset, recessed ? -0.5 * r : 0);

  return { r, upper, lower, upperLip, lowerLip, plate, plates, interior };
}

export function BaleenMouth({
  f,
  phenotype,
  carves,
  recessed,
  dark,
  surface = 'kit',
}: {
  f: MeshFeature;
  phenotype: Phenotype;
  carves: readonly Carve[];
  recessed: boolean; // true when the smooth skin actually carved the cavity behind this mouth
  dark: number;
  surface?: SkinSurface; // which rendered skin to trace lips onto (kit vs blended smooth/hybrid)
}) {
  const built = useMemo(
    () => buildBaleen(phenotype, f.idx, carves, recessed, surface),
    [phenotype, f.idx, carves, recessed, surface],
  );

  const mats = useMemo(() => {
    const lip = new THREE.Color(dark).lerp(new THREE.Color(LIP), 0.4);
    return {
      lip: new THREE.MeshStandardMaterial({ color: lip, roughness: 0.52 }),
      plate: new THREE.MeshStandardMaterial({ color: BALEEN_KERATIN, roughness: 0.68 }),
      interior: new THREE.MeshStandardMaterial({ color: INTERIOR, roughness: 0.3, side: THREE.DoubleSide }),
    };
  }, [dark]);

  // dispose per lifetime: the per-creature geometries (the plate box included — it is rebuilt with
  // every build) turn over with `built`, but the materials must NOT be disposed on every phenotype
  // swap while still in use
  useEffect(
    () => () => {
      if (built) {
        built.upperLip.dispose();
        built.lowerLip.dispose();
        built.plate.dispose();
        built.interior.dispose();
      }
    },
    [built],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  if (!built) return null;
  const r = built.r;
  return (
    <group>
      <mesh geometry={built.interior} material={mats.interior} />
      <mesh geometry={built.upperLip} material={mats.lip} castShadow />
      <mesh geometry={built.lowerLip} material={mats.lip} castShadow />
      {built.plates.map((pl, i) => (
        // thin along the lip line (x), hanging by its own length (y), broad front-to-back (z)
        <mesh
          key={i}
          geometry={built.plate}
          material={mats.plate}
          position={pl.pos}
          quaternion={pl.quat}
          scale={[r * 0.03, pl.len, r * 0.16]}
        />
      ))}
    </group>
  );
}

