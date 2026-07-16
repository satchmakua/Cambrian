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
 * is a thin wrapper that adds materials and the per-frame mandible gape.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Phenotype } from '../../engine/grow';
import type { Vec3 } from '../../engine/genome';
import type { Carve } from '../bodyField';
import { basisToQuat, norm3 } from '../bodyField';
import type { MeshFeature } from '../meshData';
import { jawGape } from '../animation';
import { buildMouthLine, hash01, mouthSpec, type MouthSample, type SkinSurface } from '../mouthLine';
import { sweepTube, type SweepPoint } from '../sweep';
import { fangGeometry, setToothInstances, toothRow, type ToothProfile, type ToothXform } from '../teeth';
import { GUM, INTERIOR, LIP, TONGUE } from './palette';
import { interiorSheet, relRow } from './shared';

export type JawedVariant = 'herbivore' | 'maw' | 'fanged' | 'underbite';

interface JawedParams {
  upper: ToothProfile | null;
  lower: ToothProfile | null;
  lipR: (u: number) => number; // upper lip tube radius (× r) at |t| = u
  lowerLipR: (u: number) => number;
  tongue: boolean;
  nosePad: boolean;
}

// house tooth-profile shapes: u = |t| (0 front → 1 corner). Exported so the tests measure the
// REAL table instead of a copy that silently desyncs on retune.
export const JAWED_PARAMS = {
  herbivore: {
    upper: { count: 6, len: (u: number) => 0.13 - 0.03 * u, width: 0.62, curl: 0.05, jitterLen: 0.1, jitterRock: 0.06, sink: 0.4, margin: 0.3, salt: 2 },
    lower: null,
    lipR: (u: number) => 0.15 - 0.05 * u * u,
    lowerLipR: (u: number) => 0.16 - 0.05 * u * u,
    tongue: true,
    nosePad: true,
  },
  maw: {
    upper: { count: 9, len: (u: number) => 0.17 + 0.09 * u, width: 0.3, curl: 0.22, jitterLen: 0.22, jitterRock: 0.12, sink: 0.32, margin: 0.16, salt: 2 },
    lower: { count: 9, len: (u: number) => 0.14 + 0.07 * u, width: 0.3, curl: 0.2, jitterLen: 0.22, jitterRock: 0.12, sink: 0.32, margin: 0.16, salt: 5 },
    lipR: (u: number) => 0.11 - 0.035 * u * u,
    lowerLipR: (u: number) => 0.12 - 0.04 * u * u,
    tongue: true,
    nosePad: false,
  },
  fanged: {
    // canine spikes at the corner third — the crocodile read; tips clear the closed lip line
    upper: { count: 9, len: (u: number) => 0.16 + 0.1 * u + 0.34 * spike(u, 0.62), width: 0.26, curl: 0.3, jitterLen: 0.2, jitterRock: 0.12, sink: 0.3, margin: 0.14, salt: 2 },
    lower: { count: 9, len: (u: number) => 0.13 + 0.08 * u + 0.2 * spike(u, 0.38), width: 0.26, curl: 0.26, jitterLen: 0.2, jitterRock: 0.12, sink: 0.3, margin: 0.14, salt: 5 },
    lipR: (u: number) => 0.095 - 0.03 * u * u,
    lowerLipR: (u: number) => 0.1 - 0.03 * u * u,
    tongue: true,
    nosePad: false,
  },
  underbite: {
    // a jutting lower row of long up-raked tusks past a modest upper lip (deep-sea / ogre)
    upper: { count: 7, len: (u: number) => 0.09 + 0.04 * u, width: 0.34, curl: 0.18, jitterLen: 0.16, jitterRock: 0.1, sink: 0.34, margin: 0.22, salt: 2 },
    lower: { count: 7, len: (u: number) => 0.3 + 0.28 * u * u, width: 0.2, curl: -0.34, jitterLen: 0.24, jitterRock: 0.14, sink: 0.26, margin: 0.2, salt: 5 },
    lipR: (u: number) => 0.09 - 0.03 * u * u,
    lowerLipR: (u: number) => 0.17 - 0.06 * u * u,
    tongue: false,
    nosePad: false,
  },
} satisfies Record<JawedVariant, JawedParams>;

/** a smooth bump of width ~0.16 centered at u = c — one emphasized canine position */
function spike(u: number, c: number): number {
  const d = (u - c) / 0.16;
  return Math.max(0, 1 - d * d);
}

export interface JawedBuild {
  r: number;
  upperLip: THREE.BufferGeometry;
  lowerLip: THREE.BufferGeometry;
  upperGum: THREE.BufferGeometry | null;
  lowerGum: THREE.BufferGeometry | null;
  upperTeeth: ToothXform[];
  lowerTeeth: ToothXform[];
  jaw: { pivot: Vec3; axis: Vec3; amp: number; omega: number; phase: number };
  interior: THREE.BufferGeometry;
  tongue: { pos: Vec3; quat: [number, number, number, number] } | null;
  nose: { pos: Vec3 } | null;
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

  const upper = relRow(line.upper, o);
  const lower = relRow(line.lower, o);

  // lips — swept along the true-lip curves, flattened onto the skin, thinning into the corners
  const lipPts = (row: MouthSample[]): SweepPoint[] => row.map((s) => ({ p: s.p, n: s.n }));
  const upperLip = sweepTube(lipPts(upper), {
    radius: (u) => r * params.lipR(Math.abs(u * 2 - 1)),
    flatten: 0.6,
    radialSegments: 10,
  });
  const lowerLip = sweepTube(lipPts(lower), {
    radius: (u) => r * params.lowerLipR(Math.abs(u * 2 - 1)),
    flatten: 0.6,
    radialSegments: 10,
  });

  // gum ridges — thinner, wetter tubes just inside each lip (where the tooth roots live)
  const gumPts = (row: MouthSample[]): SweepPoint[] =>
    row.map((s) => ({
      p: [
        s.p[0] - s.away[0] * r * 0.07 - s.n[0] * r * 0.01,
        s.p[1] - s.away[1] * r * 0.07 - s.n[1] * r * 0.01,
        s.p[2] - s.away[2] * r * 0.07 - s.n[2] * r * 0.01,
      ] as Vec3,
      n: s.n,
    }));
  const upperGum = params.upper ? sweepTube(gumPts(upper), { radius: (u) => r * params.lipR(Math.abs(u * 2 - 1)) * 0.6, flatten: 0.75, radialSegments: 8 }) : null;
  const lowerGum = params.lower ? sweepTube(gumPts(lower), { radius: (u) => r * params.lowerLipR(Math.abs(u * 2 - 1)) * 0.6, flatten: 0.75, radialSegments: 8 }) : null;

  // teeth — roots interpolate the same curves; the lower row interlocks into the upper's gaps.
  // Rows stay separate: the lower row belongs to the mandible group and swings with the gape.
  const upperTeeth: ToothXform[] = params.upper ? toothRow(upper, params.upper, r, seed) : [];
  const lowerTeeth: ToothXform[] = params.lower ? toothRow(lower, params.lower, r, seed, true) : [];

  // the mandible hinge — an axis through the mouth corners, pulled back toward the jaw joint.
  // Everything below the mouth line (lower lip/gum/teeth, tongue) rotates about it per frame.
  const cornerL = upper[0].p;
  const cornerR = upper[upper.length - 1].p;
  const pivot: Vec3 = [
    (cornerL[0] + cornerR[0]) / 2 - spec.aim[0] * r * 0.3,
    (cornerL[1] + cornerR[1]) / 2 - spec.aim[1] * r * 0.3,
    (cornerL[2] + cornerR[2]) / 2 - spec.aim[2] * r * 0.3,
  ];
  // degenerate fallback [1,0,0]: the hinge is corner-to-corner, which IS ±X on a midline mouth
  let axis: Vec3 = norm3([cornerR[0] - cornerL[0], cornerR[1] - cornerL[1], cornerR[2] - cornerL[2]], [1, 0, 0]);
  // sign-fix: a positive gape must swing the chin AWAY from the upper lip (down the face)
  const mid = lower[(lower.length / 2) | 0].p;
  const v: Vec3 = [mid[0] - pivot[0], mid[1] - pivot[1], mid[2] - pivot[2]];
  const move: Vec3 = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
  if (move[0] * spec.up[0] + move[1] * spec.up[1] + move[2] * spec.up[2] > 0) axis = [-axis[0], -axis[1], -axis[2]];
  // herbivores chew fast and shallow; predators hang slow and wide
  const jaw = {
    pivot,
    axis,
    amp: variant === 'herbivore' ? 0.07 : variant === 'maw' ? 0.09 : variant === 'fanged' ? 0.12 : 0.05,
    omega: (variant === 'herbivore' ? 2.6 : 0.8) * (0.85 + hash01(seed, idx + 97) * 0.3),
    phase: hash01(seed, idx + 83) * Math.PI * 2,
  };

  // the interior — a sheet spanning the opening: recessed into the real carve on smooth skin,
  // a hair proud of the capsule kit as a dark throat backdrop (depth by shading, not geometry)
  const inset = recessed ? -0.34 * r : 0.012 * r;
  const interior = interiorSheet(upper, lower, inset, recessed ? -0.5 * r : 0);

  // tongue — lolling on the lower interior, anchored to the line's center
  let tongue: JawedBuild['tongue'] = null;
  if (params.tongue) {
    const tm = lower[(lower.length / 2) | 0];
    tongue = {
      pos: [
        tm.p[0] - tm.away[0] * r * 0.18 - tm.n[0] * r * (recessed ? 0.16 : 0.02),
        tm.p[1] - tm.away[1] * r * 0.18 - tm.n[1] * r * (recessed ? 0.16 : 0.02),
        tm.p[2] - tm.away[2] * r * 0.18 - tm.n[2] * r * (recessed ? 0.16 : 0.02),
      ],
      quat: basisToQuat(tm.tan, tm.n, tm.away),
    };
  }
  // nose pad — a grazer's leathery rhinarium riding the upper lip's center
  let nose: JawedBuild['nose'] = null;
  if (params.nosePad) {
    const nm = upper[(upper.length / 2) | 0];
    nose = {
      pos: [nm.p[0] + nm.away[0] * r * 0.22, nm.p[1] + nm.away[1] * r * 0.22, nm.p[2] + nm.away[2] * r * 0.22],
    };
  }

  return { r, upperLip, lowerLip, upperGum, lowerGum, upperTeeth, lowerTeeth, jaw, interior, tongue, nose };
}

export function JawedMouth({
  f,
  phenotype,
  carves,
  recessed,
  variant,
  dark,
  surface = 'kit',
  animate = false,
}: {
  f: MeshFeature;
  phenotype: Phenotype;
  carves: readonly Carve[];
  recessed: boolean; // true when the smooth skin actually carved the cavity behind this mouth
  variant: JawedVariant;
  dark: number;
  surface?: SkinSurface; // which rendered skin to trace lips onto (kit vs blended smooth/hybrid)
  animate?: boolean; // gape idles only when the body itself animates (never thumbnails/smooth)
}) {
  const built = useMemo(
    () => buildJawed(phenotype, f.idx, carves, recessed, variant, surface),
    [phenotype, f.idx, carves, recessed, variant, surface],
  );

  const fang = useMemo(() => fangGeometry(), []);
  const mats = useMemo(() => {
    const lip = new THREE.Color(dark).lerp(new THREE.Color(LIP), 0.4);
    return {
      lip: new THREE.MeshStandardMaterial({ color: lip, roughness: 0.52 }),
      gum: new THREE.MeshStandardMaterial({ color: GUM, roughness: 0.32 }),
      interior: new THREE.MeshStandardMaterial({ color: INTERIOR, roughness: 0.3, side: THREE.DoubleSide }),
      teeth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }),
      tongue: new THREE.MeshStandardMaterial({ color: TONGUE, roughness: 0.3 }),
      nose: new THREE.MeshStandardMaterial({ color: 0x18120e, roughness: 0.45 }),
    };
  }, [dark]);

  // dispose per lifetime: the per-creature geometries turn over with `built`, but the shared fang
  // and the materials must NOT be disposed on every phenotype swap while still in use
  useEffect(
    () => () => {
      if (built) {
        built.upperLip.dispose();
        built.lowerLip.dispose();
        built.upperGum?.dispose();
        built.lowerGum?.dispose();
        built.interior.dispose();
      }
    },
    [built],
  );
  useEffect(() => () => fang.dispose(), [fang]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // the mandible idles open/shut about the corner hinge — only while the body itself animates
  const jawRef = useRef<THREE.Group>(null);
  const jawAxis = useMemo(
    () => (built ? new THREE.Vector3(built.jaw.axis[0], built.jaw.axis[1], built.jaw.axis[2]) : null),
    [built],
  );
  useFrame((st) => {
    if (!animate || !built || !jawRef.current || !jawAxis) return;
    const a = jawGape(st.clock.elapsedTime, built.jaw.phase, built.jaw.omega, built.jaw.amp);
    jawRef.current.quaternion.setFromAxisAngle(jawAxis, a);
  });

  if (!built) return null;
  const r = built.r;
  const pv = built.jaw.pivot;
  return (
    <group>
      <mesh geometry={built.interior} material={mats.interior} />
      <mesh geometry={built.upperLip} material={mats.lip} castShadow />
      {built.upperGum && <mesh geometry={built.upperGum} material={mats.gum} />}
      {built.upperTeeth.length > 0 && (
        <instancedMesh
          args={[fang, mats.teeth, built.upperTeeth.length]}
          frustumCulled={false}
          ref={(m: THREE.InstancedMesh | null) => {
            if (m) setToothInstances(m, built.upperTeeth);
          }}
        />
      )}
      {/* the mandible — everything below the mouth line swings together about the corner hinge */}
      <group position={pv}>
        <group ref={jawRef}>
          <group position={[-pv[0], -pv[1], -pv[2]]}>
            <mesh geometry={built.lowerLip} material={mats.lip} castShadow />
            {built.lowerGum && <mesh geometry={built.lowerGum} material={mats.gum} />}
            {built.lowerTeeth.length > 0 && (
              <instancedMesh
                args={[fang, mats.teeth, built.lowerTeeth.length]}
                frustumCulled={false}
                ref={(m: THREE.InstancedMesh | null) => {
                  if (m) setToothInstances(m, built.lowerTeeth);
                }}
              />
            )}
            {built.tongue && (
              <mesh position={built.tongue.pos} quaternion={built.tongue.quat} scale={[r * 0.26, r * 0.07, r * 0.4]} material={mats.tongue}>
                <sphereGeometry args={[1, 12, 8]} />
              </mesh>
            )}
          </group>
        </group>
      </group>
      {built.nose && (
        <mesh position={built.nose.pos} scale={[r * 0.3, r * 0.2, r * 0.22]} material={mats.nose}>
          <sphereGeometry args={[1, 12, 8]} />
        </mesh>
      )}
    </group>
  );
}
