/**
 * The jawed mouth family (mouth overhaul) — herbivore · maw · fanged · underbite as ONE parametric
 * build over the mouth line, replacing four hand-placed primitive assemblies.
 *
 * Everything anchors to the surface-projected mouth line (`mouthLine.ts`): lips are variable-radius
 * tubes swept along the upper/lower curves (they wrap the corners as one closed loop — the thing a
 * top+bottom "sandwich" can never do), gum ridges run just inside the lips, teeth are ONE
 * InstancedMesh per row whose roots interpolate the same curves (floating is impossible by
 * construction), and a dark wet interior sheet spans the opening. On the carved smooth skin the
 * sheet recesses into the real cavity; on the capsule kit it sits a hair proud as a dark backdrop.
 *
 * Geometry is authored NODE-RELATIVE (world minus the mouth node's rest position, no rotation), so
 * the feature group's per-frame translation carries the whole mouth with the animated head. The
 * pure `buildJawed` does all of it headlessly (tested like every sibling variant); the component
 * is a thin wrapper that adds materials. (The mandible used to idle open/shut; the idle
 * animation pass was removed — creatures hold the rest pose grow() produced.)
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Phenotype } from '../../engine/grow';
import type { Vec3 } from '../../engine/genome';
import type { Carve } from '../bodyField';
import { norm3 } from '../bodyField';
import type { MeshFeature } from '../meshData';
import { buildMouthLine, mouthSpec, type MouthSample, type SkinSurface } from '../mouthLine';
import { sweepTube, type SweepPoint } from '../sweep';
import { bluntGeometry, fangGeometry, setToothInstances, toothRow, type ToothProfile, type ToothXform } from '../teeth';
import { INTERIOR, LIP } from './palette';
import { interiorBowl, muzzleSkirt, relRow } from './shared';

export type JawedVariant = 'herbivore' | 'maw' | 'fanged' | 'underbite';

interface JawedParams {
  upper: ToothProfile | null;
  lower: ToothProfile | null;
  lipR: (u: number) => number; // upper lip tube radius (× r) at |t| = u
  lowerLipR: (u: number) => number;
  /** upper-jaw (muzzle) and lower-jaw (mandible) MASS radii, × r — the volume behind the lips.
   *  Without these a mouth is only two thin tubes drawn on a smooth head: anatomically placed but
   *  reading as scratched-on lines. The masses give the jaw a silhouette to sit in. */
  muzzleR: number;
  jawR: number;
  /** how far the mouth's front centre projects off the skull, × r — this is what makes a SNOUT */
  project: number;
  /** blunt (grazer molars/incisors) vs the default pointed fang — the visible tooth-type variety */
  blunt?: boolean;
}

// house tooth-profile shapes: u = |t| (0 front → 1 corner). Exported so the tests measure the
// REAL table instead of a copy that silently desyncs on retune.
export const JAWED_PARAMS = {
  herbivore: {
    upper: { count: 10, len: (u: number) => 0.52 - 0.10 * u, width: 0.62, curl: 0.05, jitterLen: 0.1, jitterRock: 0.06, sink: 0.4, margin: 0.3, salt: 2 },
    lower: null,
    lipR: (u: number) => 0.17 - 0.06 * u * u,
    lowerLipR: (u: number) => 0.18 - 0.06 * u * u,
    muzzleR: 0.42,
    jawR: 0.40,
    project: 0.55,
    blunt: true,
  },
  maw: {
    upper: { count: 13, len: (u: number) => 0.30 + 0.14 * u, width: 0.3, curl: 0.22, jitterLen: 0.22, jitterRock: 0.12, sink: 0.32, margin: 0.16, salt: 2 },
    lower: { count: 13, len: (u: number) => 0.26 + 0.12 * u, width: 0.3, curl: 0.2, jitterLen: 0.22, jitterRock: 0.12, sink: 0.32, margin: 0.16, salt: 5 },
    lipR: (u: number) => 0.13 - 0.04 * u * u,
    lowerLipR: (u: number) => 0.14 - 0.05 * u * u,
    muzzleR: 0.36,
    jawR: 0.40,
    project: 0.50,
  },
  fanged: {
    // canine spikes at the corner third — the crocodile read; tips clear the closed lip line
    upper: { count: 12, len: (u: number) => 0.28 + 0.15 * u + 0.5 * spike(u, 0.62), width: 0.26, curl: 0.3, jitterLen: 0.2, jitterRock: 0.12, sink: 0.3, margin: 0.14, salt: 2 },
    lower: { count: 12, len: (u: number) => 0.24 + 0.13 * u + 0.32 * spike(u, 0.38), width: 0.26, curl: 0.26, jitterLen: 0.2, jitterRock: 0.12, sink: 0.3, margin: 0.14, salt: 5 },
    lipR: (u: number) => 0.115 - 0.035 * u * u,
    lowerLipR: (u: number) => 0.12 - 0.04 * u * u,
    muzzleR: 0.34,
    jawR: 0.38,
    project: 0.72,
  },
  underbite: {
    // a jutting lower row of long up-raked tusks past a modest upper lip (deep-sea / ogre)
    upper: { count: 10, len: (u: number) => 0.09 + 0.04 * u, width: 0.34, curl: 0.18, jitterLen: 0.16, jitterRock: 0.1, sink: 0.34, margin: 0.22, salt: 2 },
    lower: { count: 10, len: (u: number) => 0.46 + 0.34 * u * u, width: 0.2, curl: -0.34, jitterLen: 0.24, jitterRock: 0.14, sink: 0.26, margin: 0.2, salt: 5 },
    lipR: (u: number) => 0.11 - 0.035 * u * u,
    lowerLipR: (u: number) => 0.19 - 0.06 * u * u,
    muzzleR: 0.28,
    jawR: 0.50,
    project: 0.52,
  },
} satisfies Record<JawedVariant, JawedParams>;

/** a smooth bump of width ~0.16 centered at u = c — one emphasized canine position */
function spike(u: number, c: number): number {
  const d = (u - c) / 0.16;
  return Math.max(0, 1 - d * d);
}

export interface JawedBuild {
  r: number;
  /** the node-relative, PROJECTED lip curves every piece is anchored to (tests verify against
   *  these: after projection the muzzle stands off the raw skull by design, so the anti-floating
   *  guarantee is "rooted in the mouth line", not "within sink-depth of the skull") */
  upper: MouthSample[];
  lower: MouthSample[];
  muzzle: THREE.BufferGeometry; // upper-jaw mass above the lip line
  upperFold: THREE.BufferGeometry; // overhanging upper lip that hides the tooth roots
  jawMass: THREE.BufferGeometry; // mandible mass below the lip line
  upperLip: THREE.BufferGeometry;
  lowerLip: THREE.BufferGeometry;
  upperTeeth: ToothXform[];
  lowerTeeth: ToothXform[];
  interior: THREE.BufferGeometry;
}

/** Pure, node-relative jawed-mouth build — everything derived from the surface mouth line. */
export function buildJawed(
  phenotype: Phenotype,
  idx: number,
  carves: readonly Carve[],
  recessed: boolean,
  variant: JawedVariant,
  surface: SkinSurface = 'kit',
): JawedBuild | null {
  const spec = mouthSpec(phenotype, idx);
  if (!spec) return null;
  const params: JawedParams = JAWED_PARAMS[variant];
  const r = spec.r;
  const seed = phenotype.genomeRef.seed;
  const line = buildMouthLine(phenotype, spec, carves, 17, surface);
  const o = spec.node.pos; // node-relative frame origin

  // PROJECT the muzzle. The lip curves are traced onto the existing skull surface, so on their own
  // they can only ever be a decal on a smooth head — no snout. Pushing each sample out along the
  // aim, weighted to peak at the front centre and vanish at the corners, pulls the mouth forward
  // into an actual protruding muzzle while the corners stay welded where they were traced.
  const project = (row: MouthSample[]): MouthSample[] =>
    row.map((s) => {
      const w = Math.pow(Math.cos((s.t * Math.PI) / 2), 1.3); // 1 at the front centre → 0 at corners
      const d = params.project * r * w;
      const dir = norm3([
        spec.aim[0] * 0.8 + s.n[0] * 0.2,
        spec.aim[1] * 0.8 + s.n[1] * 0.2,
        spec.aim[2] * 0.8 + s.n[2] * 0.2,
      ]);
      return { ...s, p: [s.p[0] + dir[0] * d, s.p[1] + dir[1] * d, s.p[2] + dir[2] * d] as Vec3 };
    });
  const upperBase = relRow(line.upper, o); // where the curve was traced, ON the skull
  const lowerBase = relRow(line.lower, o);
  const upper = project(upperBase);
  const lower = project(lowerBase);

  // lips — swept along the true-lip curves, flattened onto the skin, thinning into the corners
  const lipPts = (row: MouthSample[]): SweepPoint[] => row.map((s) => ({ p: s.p, n: s.n }));
  const upperLip = sweepTube(lipPts(upper), {
    radius: (u) => r * params.lipR(Math.abs(u * 2 - 1)),
    flatten: 0.45,
    radialSegments: 10,
  });
  const lowerLip = sweepTube(lipPts(lower), {
    radius: (u) => r * params.lowerLipR(Math.abs(u * 2 - 1)),
    flatten: 0.45,
    radialSegments: 10,
  });

  // jaw MASSES — lofted from the projected rim back to the traced curve on the skull, so the snout
  // is a welded volume rather than a shell standing off the head. (Fat tubes near the rim left a
  // hollow behind deep projections: an adversarial probe saw through ~19% of the view sphere on
  // fanged mouths. Lofting removes the failure mode instead of tuning around it.)
  const muzzle = muzzleSkirt(upper, upperBase, r * params.muzzleR * 0.55);
  const jawMass = muzzleSkirt(lower, lowerBase, r * params.jawR * 0.55);

  // An OVERHANGING upper lip. Without it the upper tooth row sits exposed on the rim and you see
  // straight over the roots into the top of the mouth. This is a fatter fold, pushed forward off
  // the tooth line (+aim) and draping down (−away), so it covers the roots and closes that view —
  // a convex labial covering. The upper teeth then root a touch back (−aim), tucked behind it, so
  // only their downward tips show below the fold's edge.
  const foldPts: SweepPoint[] = upper.map((s) => ({
    p: [
      s.p[0] + spec.aim[0] * r * 0.16 - s.away[0] * r * 0.05,
      s.p[1] + spec.aim[1] * r * 0.16 - s.away[1] * r * 0.05,
      s.p[2] + spec.aim[2] * r * 0.16 - s.away[2] * r * 0.05,
    ] as Vec3,
    n: s.n,
  }));
  const upperFold = sweepTube(foldPts, {
    radius: (u) => r * params.lipR(Math.abs(u * 2 - 1)) * 1.9,
    flatten: 0.62,
    radialSegments: 10,
  });

  // teeth — roots interpolate the same curves; the lower row interlocks into the upper's gaps.
  // Rows stay separate: the lower row belongs to the mandible group and swings with the gape.
  // The upper row is pulled back under the fold so its roots hide behind the overhang.
  const upperTucked: MouthSample[] = upper.map((s) => ({
    ...s,
    p: [s.p[0] - spec.aim[0] * r * 0.06, s.p[1] - spec.aim[1] * r * 0.06, s.p[2] - spec.aim[2] * r * 0.06] as Vec3,
  }));
  const upperTeeth: ToothXform[] = params.upper ? toothRow(upperTucked, params.upper, r, seed) : [];
  const lowerTeeth: ToothXform[] = params.lower ? toothRow(lower, params.lower, r, seed, true) : [];


  // the interior — a sheet spanning the opening: recessed into the real carve on smooth skin,
  // a hair proud of the capsule kit as a dark throat backdrop (depth by shading, not geometry)
  // a real concave throat: now that the muzzle projects, the bowl has room to recede INTO it
  // without vanishing inside the skull, on the capsule kit as well as the carved smooth skin
  const interior = interiorBowl(upper, lower, [-spec.aim[0], -spec.aim[1], -spec.aim[2]],
    r * (recessed ? 0.95 : 0.62));


  return { r, upper, lower, muzzle, upperFold, jawMass, upperLip, lowerLip, upperTeeth, lowerTeeth, interior };
}

export function JawedMouth({
  f,
  phenotype,
  carves,
  recessed,
  variant,
  dark,
  surface = 'kit',
}: {
  f: MeshFeature;
  phenotype: Phenotype;
  carves: readonly Carve[];
  recessed: boolean; // true when the smooth skin actually carved the cavity behind this mouth
  variant: JawedVariant;
  dark: number;
  surface?: SkinSurface; // which rendered skin to trace lips onto (kit vs blended smooth/hybrid)
}) {
  const built = useMemo(
    () => buildJawed(phenotype, f.idx, carves, recessed, variant, surface),
    [phenotype, f.idx, carves, recessed, variant, surface],
  );

  const fang = useMemo(() => ((JAWED_PARAMS[variant] as JawedParams).blunt ? bluntGeometry() : fangGeometry()), [variant]);
  const mats = useMemo(() => {
    const lip = new THREE.Color(dark).lerp(new THREE.Color(LIP), 0.4);
    return {
      lip: new THREE.MeshStandardMaterial({ color: lip, roughness: 0.52 }),
      // the jaw masses wear the body's own dark skin tone so they read as part of the head
      jaw: new THREE.MeshStandardMaterial({ color: dark, roughness: 0.62 }),
      interior: new THREE.MeshStandardMaterial({ color: INTERIOR, roughness: 0.3, side: THREE.DoubleSide }),
      teeth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }),
    };
  }, [dark]);

  // dispose per lifetime: the per-creature geometries turn over with `built`, but the shared fang
  // and the materials must NOT be disposed on every phenotype swap while still in use
  useEffect(
    () => () => {
      if (built) {
        built.muzzle.dispose();
        built.upperFold.dispose();
        built.jawMass.dispose();
        built.upperLip.dispose();
        built.lowerLip.dispose();
        built.interior.dispose();
      }
    },
    [built],
  );
  useEffect(() => () => fang.dispose(), [fang]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);


  if (!built) return null;
  return (
    <group>
      <mesh geometry={built.interior} material={mats.interior} />
      <mesh geometry={built.muzzle} material={mats.jaw} castShadow />
      <mesh geometry={built.upperLip} material={mats.lip} castShadow />
      <mesh geometry={built.upperFold} material={mats.lip} castShadow />
      {built.upperTeeth.length > 0 && (
        <instancedMesh
          args={[fang, mats.teeth, built.upperTeeth.length]}
          frustumCulled={false}
          ref={(m: THREE.InstancedMesh | null) => {
            if (m) setToothInstances(m, built.upperTeeth);
          }}
        />
      )}
      {/* the lower jaw: lip, mass and tooth row */}
      <group>
            <mesh geometry={built.jawMass} material={mats.jaw} castShadow />
            <mesh geometry={built.lowerLip} material={mats.lip} castShadow />
            {built.lowerTeeth.length > 0 && (
              <instancedMesh
                args={[fang, mats.teeth, built.lowerTeeth.length]}
                frustumCulled={false}
                ref={(m: THREE.InstancedMesh | null) => {
                  if (m) setToothInstances(m, built.lowerTeeth);
                }}
              />
            )}
      </group>
    </group>
  );
}
