/**
 * The mandibles mouth (mouth overhaul) — paired arthropod shear-blades hinged at the mouth
 * corners, replacing the legacy pair of floating cones.
 *
 * Real mandibles articulate at the SIDES of the head and swing inward across each other — they are
 * tools in FRONT of a mouth, not the mouth itself. So the hinge points are the mouth line's two
 * corners (on the true skin by construction), each blade is a chitin sweep along a caliper arc —
 * leaving the hinge purely forward, arriving at the tip purely inward, drooping a touch — with the
 * tips stopping just short of meeting by the gape. Serrations root ON the blade centerline's inner
 * rim (a saw edge raking toward the opposing blade), and behind the pair sits the actual mouth:
 * thin lip beads swept along the upper/lower lines and a dark recessed-aware interior sheet.
 *
 * Geometry is authored NODE-RELATIVE (world minus the mouth node's rest position, no rotation), so
 * the feature group's per-frame translation carries the whole assembly with the animated head.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Phenotype } from '../../engine/grow';
import type { Vec3 } from '../../engine/genome';
import { basisToQuat, cross3, dot3, norm3, type Carve } from '../bodyField';
import type { MeshFeature } from '../meshData';
import { buildMouthLine, hash01, mouthSpec, type MouthSample, type MouthSpec, type SkinSurface } from '../mouthLine';
import { sweepTube, type SweepPoint } from '../sweep';
import { fangGeometry, setToothInstances, type ToothXform } from '../teeth';
import { INTERIOR, LIP, jig } from './palette';
import { interiorSheet, relRow } from './shared';

const PATH_PTS = 8; // centerline samples per blade
const SERR_FROM = 2; // serrations root at path points 2..5 — the mid-blade shear edge
const SERR_TO = 5;

export interface MandiblesBuild {
  spec: MouthSpec;
  r: number;
  /** node-relative blade centerlines, [t=−1 corner, t=+1 corner]; index 0 is the on-skin hinge */
  bladePaths: [Vec3[], Vec3[]];
  blades: [THREE.BufferGeometry, THREE.BufferGeometry];
  /** serration fangs, node-relative — the first 4 belong to bladePaths[0], the last 4 to [1] */
  serrations: ToothXform[];
  upperLip: THREE.BufferGeometry;
  lowerLip: THREE.BufferGeometry;
  interior: THREE.BufferGeometry;
}

/** Pure build — everything derives from the mouth line; null if the node isn't a mouth. */
export function buildMandibles(
  phenotype: Phenotype,
  idx: number,
  carves: readonly Carve[],
  recessed: boolean,
  surface: SkinSurface = 'kit',
): MandiblesBuild | null {
  const spec = mouthSpec(phenotype, idx);
  if (!spec) return null;
  const r = spec.r;
  const seed = phenotype.genomeRef.seed;
  const line = buildMouthLine(phenotype, spec, carves, 17, surface);
  const o = spec.node.pos; // node-relative frame origin

  const upper = relRow(line.upper, o);
  const lower = relRow(line.lower, o);
  const last = upper.length - 1;

  // blade arc: forward reach + tip clearance — seeded once, shared by both sides (M18). Reach
  // stays under the 1.3r protrusion cap (1.2r centerline + the 0.025r tip radius).
  const reach = r * (0.95 + 0.25 * hash01(seed, idx + 41));
  const droop = r * (0.12 + 0.12 * hash01(seed, idx + 59));
  const gap = r * (0.12 + 0.2 * spec.gape); // tip-to-tip clearance — nearly meeting, never touching
  const latMax = Math.max(0, (line.width - gap) / 2);

  const buildBlade = (side: -1 | 1) => {
    const hinge = upper[side < 0 ? 0 : last]; // the corner sample — ON the skin by construction
    // inward lateral = toward the midline, derived from the shared frame via the corner's sign so
    // the pair is an exact mirror on a midline mouth
    const L: Vec3 = [-side * spec.right[0], -side * spec.right[1], -side * spec.right[2]];
    const path: Vec3[] = [];
    for (let k = 0; k < PATH_PTS; k++) {
      const u = k / (PATH_PTS - 1);
      // a caliper arc: leaves the hinge purely forward, arrives at the tip purely inward
      const fwd = reach * Math.sin((u * Math.PI) / 2);
      const lat = latMax * (1 - Math.cos((u * Math.PI) / 2));
      const drop = droop * u * u; // accelerating downward droop — heavy, not perky
      path.push([
        hinge.p[0] + spec.aim[0] * fwd + L[0] * lat - spec.up[0] * drop,
        hinge.p[1] + spec.aim[1] * fwd + L[1] * lat - spec.up[1] * drop,
        hinge.p[2] + spec.aim[2] * fwd + L[2] * lat - spec.up[2] * drop,
      ]);
    }
    // the blade: flattened against the horizontal shear plane, stout at the hinge, tapering to a
    // near-point (the stag-beetle read — the pair scissors past each other, edge to edge)
    const pts: SweepPoint[] = path.map((p) => ({ p, n: spec.up }));
    const geo = sweepTube(pts, { radius: (u) => r * (0.15 - 0.125 * u), flatten: 0.35, radialSegments: 10 });

    // serrations — 4 per blade, rooted on the path's inner rim, raking toward the opposing blade
    const teeth: ToothXform[] = [];
    for (let k = SERR_FROM; k <= SERR_TO; k++) {
      const u = k / (PATH_PTS - 1);
      const bladeR = r * (0.15 - 0.125 * u);
      const root: Vec3 = [
        path[k][0] + L[0] * bladeR * 0.85,
        path[k][1] + L[1] * bladeR * 0.85,
        path[k][2] + L[2] * bladeR * 0.85,
      ];
      // emerge = inward + slightly forward; Z ⊥ the path tangent, pinned up-face so both sides
      // curl the same way (mirror-true)
      const Y = norm3([L[0] + spec.aim[0] * 0.3, L[1] + spec.aim[1] * 0.3, L[2] + spec.aim[2] * 0.3]);
      const tan = norm3([
        path[k + 1][0] - path[k - 1][0],
        path[k + 1][1] - path[k - 1][1],
        path[k + 1][2] - path[k - 1][2],
      ]);
      let Z = cross3(tan, Y);
      if (Math.hypot(Z[0], Z[1], Z[2]) < 1e-6) Z = cross3(spec.up, Y); // degenerate tangent
      Z = norm3(Z);
      if (dot3(Z, spec.up) < 0) Z = [-Z[0], -Z[1], -Z[2]];
      const X = cross3(Y, Z);
      const len = r * 0.1 * (1 + 0.3 * jig(k, 7)); // keyed on the path index — twins match (M18)
      teeth.push({
        pos: [root[0] - Y[0] * len * 0.3, root[1] - Y[1] * len * 0.3, root[2] - Y[2] * len * 0.3],
        quat: basisToQuat(X, Y, Z),
        len,
        w: len * 0.3,
      });
    }
    return { path, geo, teeth };
  };
  const bladeL = buildBlade(-1);
  const bladeR = buildBlade(1);

  // the true mouth behind the tools — thin lip beads pressed along both line curves
  const lipPts = (row: MouthSample[]): SweepPoint[] => row.map((s) => ({ p: s.p, n: s.n }));
  const upperLip = sweepTube(lipPts(upper), { radius: () => r * 0.06, flatten: 0.6, radialSegments: 8 });
  const lowerLip = sweepTube(lipPts(lower), { radius: () => r * 0.06, flatten: 0.6, radialSegments: 8 });

  // the interior — recessed into the real carve on smooth skin, a hair proud of the capsule kit
  // as a dark throat backdrop (depth by shading, not geometry)
  const inset = recessed ? -0.34 * r : 0.012 * r;
  const interior = interiorSheet(upper, lower, inset, recessed ? -0.5 * r : 0);

  return {
    spec,
    r,
    bladePaths: [bladeL.path, bladeR.path],
    blades: [bladeL.geo, bladeR.geo],
    serrations: [...bladeL.teeth, ...bladeR.teeth],
    upperLip,
    lowerLip,
    interior,
  };
}

export function MandiblesMouth({
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
    () => buildMandibles(phenotype, f.idx, carves, recessed, surface),
    [phenotype, f.idx, carves, recessed, surface],
  );

  const fang = useMemo(() => fangGeometry(), []);
  const mats = useMemo(() => {
    const chitin = new THREE.Color(dark).lerp(new THREE.Color(0x241d18), 0.55);
    const lip = new THREE.Color(dark).lerp(new THREE.Color(LIP), 0.4);
    return {
      chitin: new THREE.MeshStandardMaterial({ color: chitin, roughness: 0.35, metalness: 0.12 }),
      lip: new THREE.MeshStandardMaterial({ color: lip, roughness: 0.52 }),
      interior: new THREE.MeshStandardMaterial({ color: INTERIOR, roughness: 0.3, side: THREE.DoubleSide }),
      teeth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }),
    };
  }, [dark]);

  // dispose per lifetime: the per-creature geometries turn over with `built`, but the shared fang
  // and the materials must NOT be disposed on every phenotype swap while still in use
  useEffect(
    () => () => {
      if (built) {
        built.blades[0].dispose();
        built.blades[1].dispose();
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
      <mesh geometry={built.upperLip} material={mats.lip} />
      <mesh geometry={built.lowerLip} material={mats.lip} />
      <mesh geometry={built.blades[0]} material={mats.chitin} castShadow />
      <mesh geometry={built.blades[1]} material={mats.chitin} castShadow />
      {built.serrations.length > 0 && (
        <instancedMesh
          args={[fang, mats.teeth, built.serrations.length]}
          frustumCulled={false}
          ref={(m: THREE.InstancedMesh | null) => {
            if (m) setToothInstances(m, built.serrations);
          }}
        />
      )}
    </group>
  );
}

/**
 * A 3-row sheet spanning the mouth opening (adapted from jawed.tsx): upper lip line → a deepened
 * center → lower lip line. `inset` pulls the rim rows along −normal (negative = into the face);
 * `deepen` sinks the center row further for a throat. Drawn DoubleSide.
 */
