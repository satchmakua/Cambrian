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
import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Phenotype } from '../../engine/grow';
import type { Vec3 } from '../../engine/genome';
import type { Carve } from '../bodyField';
import { norm3 } from '../bodyField';
import type { MeshFeature } from '../meshData';
import { buildMouthLine, hash01, mouthSpec, type MouthSample, type SkinSurface } from '../mouthLine';
import { sweepTube, type SweepPoint } from '../sweep';
import { bluntGeometry, fangGeometry, setToothInstances, toothRow, type ToothProfile, type ToothXform } from '../teeth';
import { INTERIOR, LIP } from './palette';
import { interiorBowl, muzzleSkirt, relRow } from './shared';
import { JawContext, hingeOf, poseJaw } from './jaw';

export type JawedVariant = 'herbivore' | 'maw' | 'fanged' | 'underbite';

/** how far a mammal's jaw hangs open at rest (0 = lips meeting) — a hair, so it reads alive */
const REST_SHUT = 0.04;
/** everything else rests with its jaws barely parted: the teeth show along a closed line (a croc's,
 *  a shark's grin) instead of the gaping mask the built pose holds */
const REST_PARTED = 0.05;

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
    blunt: true,
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

// A MAMMAL's mouth (a muzzled spec — furred, jawed) shuts. Its lips are a thin dark line along the
// muzzle, the jaw wears the coat, and only the teeth a closed mammal mouth really shows survive: a
// carnivore's canines over the lip, a grazer's or rodent's front incisors. The full rows of a
// reptile's grin were what made every cat and dog read as a frog in a fur suit.
const CANINE = { jitterLen: 0.08, jitterRock: 0.05, sink: 0.3, salt: 2 };
export const MUZZLED_TEETH: Record<JawedVariant, { upper: ToothProfile | null; lower: ToothProfile | null }> = {
  fanged: {
    upper: { ...CANINE, count: 2, len: () => 0.62, width: 0.3, curl: 0.12, margin: 0.62 },
    lower: { ...CANINE, count: 2, len: () => 0.34, width: 0.32, curl: 0.12, margin: 0.5, salt: 5 },
  },
  maw: { upper: { ...CANINE, count: 2, len: () => 0.36, width: 0.34, curl: 0.1, margin: 0.62 }, lower: null },
  herbivore: { upper: { ...CANINE, count: 2, len: () => 0.3, width: 0.62, curl: 0.04, margin: 0.9 }, lower: null },
  underbite: { upper: null, lower: { ...CANINE, count: 2, len: () => 0.5, width: 0.3, curl: -0.2, margin: 0.55, salt: 5 } },
};

/** a smooth bump of width ~0.16 centered at u = c — one emphasized canine position */
function spike(u: number, c: number): number {
  const d = (u - c) / 0.16;
  return Math.max(0, 1 - d * d);
}

export interface JawedBuild {
  r: number;
  aim: Vec3; // the mouth's forward aim (node-relative frame)
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
  /** a muzzled mouth's nose pad (node-relative), else null */
  nose: THREE.BufferGeometry | null;
  muzzled: boolean;
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
  const base: JawedParams = JAWED_PARAMS[variant];
  const muzzled = spec.muzzled;
  // a muzzled mouth sits ON a real snout (grow built one), so it barely projects; its lips are thin
  const params: JawedParams = muzzled
    ? {
        ...base,
        ...MUZZLED_TEETH[variant],
        project: base.project * 0.12,
        lipR: (u) => base.lipR(u) * 0.55,
        lowerLipR: (u) => base.lowerLipR(u) * 0.5,
        muzzleR: base.muzzleR * 0.5,
        jawR: base.jawR * 0.7,
      }
    : {
        // a reptile's, a fish's, a frog's mouth: no fleshy lips — a thin hard rim along the jaw line
        ...base,
        lipR: (u) => base.lipR(u) * 0.55,
        lowerLipR: (u) => base.lowerLipR(u) * 0.55,
      };
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


  // the jaw masses (and a mammal's lip fold) are skin: give them body-space coordinates so they can
  // wear the body's own covering material (pattern, countershading and relief continue across)
  for (const g of muzzled ? [muzzle, jawMass, upperFold] : [muzzle, jawMass]) bakeBodySpace(g, o);

  // the nose pad: a soft, flattened wedge seated on the muzzle tip, its broad face along the skin
  let nose: THREE.BufferGeometry | null = null;
  if (line.nose) {
    const n = norm3(line.nose.n);
    const upHint = norm3([spec.up[0] - n[0] * dot(spec.up, n), spec.up[1] - n[1] * dot(spec.up, n), spec.up[2] - n[2] * dot(spec.up, n)], [0, 1, 0]);
    const X = new THREE.Vector3(...upHint).cross(new THREE.Vector3(...n)).normalize();
    const Y = new THREE.Vector3(...n).cross(X).normalize();
    const Z = new THREE.Vector3(...n);
    const g = new THREE.SphereGeometry(1, 18, 12);
    // wider across the top than at the bottom: a rounded triangle, the classic mammal rhinarium
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setX(i, pos.getX(i) * (1 + 0.32 * y));
    }
    const m = new THREE.Matrix4().makeBasis(X, Y, Z).scale(new THREE.Vector3(r * 0.36, r * 0.22, r * 0.17));
    m.setPosition(line.nose.p[0] - o[0] + n[0] * r * 0.04, line.nose.p[1] - o[1] + n[1] * r * 0.04, line.nose.p[2] - o[2] + n[2] * r * 0.04);
    g.applyMatrix4(m);
    g.computeVertexNormals();
    nose = g;
  }

  return { r, aim: spec.aim, upper, lower, muzzle, upperFold, jawMass, upperLip, lowerLip, upperTeeth, lowerTeeth, interior, nose, muzzled };
}

/** The covering shader's per-vertex inputs for a node-relative feature mesh (rest body space = local + o). */
function bakeBodySpace(g: THREE.BufferGeometry, o: Vec3): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    arr[i * 3] = pos.getX(i) + o[0];
    arr[i * 3 + 1] = pos.getY(i) + o[1];
    arr[i * 3 + 2] = pos.getZ(i) + o[2];
  }
  g.setAttribute('aBodyPos', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('aFlesh', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(pos.count).fill(1), 1));
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function JawedMouth({
  f,
  phenotype,
  carves,
  recessed,
  variant,
  dark,
  skin,
  surface = 'kit',
}: {
  f: MeshFeature;
  phenotype: Phenotype;
  carves: readonly Carve[];
  recessed: boolean; // true when the smooth skin actually carved the cavity behind this mouth
  variant: JawedVariant;
  dark: number;
  skin?: THREE.Material; // the body's covering material — a mammal's jaw wears it
  surface?: SkinSurface; // which rendered skin to trace lips onto (kit vs blended smooth/hybrid)
}) {
  const built = useMemo(
    () => buildJawed(phenotype, f.idx, carves, recessed, variant, surface),
    [phenotype, f.idx, carves, recessed, variant, surface],
  );
  const pal = phenotype.genomeRef.palette;
  const coat = useMemo(() => new THREE.Color().setHSL(pal.hueA, pal.sat * 0.85, pal.light * 0.92).getHex(), [pal]);
  // a wet nose: mostly near-black, sometimes the dusky pink of a cat's or a pig's
  const noseColor = useMemo(
    () => (hash01(phenotype.genomeRef.seed, 0x4e05) < 0.62 ? 0x1c1416 : new THREE.Color().setHSL(0.98, 0.32, 0.42).getHex()),
    [phenotype],
  );

  const fang = useMemo(() => ((JAWED_PARAMS[variant] as JawedParams).blunt ? bluntGeometry() : fangGeometry()), [variant]);
  const muzzled = built?.muzzled ?? false;
  const mats = useMemo(() => {
    // a mammal's lip line is a dark crease; a reptile's rim a darker tone of its own hide
    const lip = muzzled ? new THREE.Color(dark).multiplyScalar(0.55) : new THREE.Color(dark).lerp(new THREE.Color(LIP), 0.2).multiplyScalar(0.85);
    return {
      lip: new THREE.MeshStandardMaterial({ color: lip, roughness: 0.52 }),
      // the jaw masses wear the body's own dark skin tone so they read as part of the head — a
      // mammal's wear its coat (the chin and the lip fold are fur)
      jaw: new THREE.MeshStandardMaterial({ color: muzzled ? coat : dark, roughness: muzzled ? 0.85 : 0.62 }),
      nose: new THREE.MeshPhysicalMaterial({ color: noseColor, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.35 }),
      interior: new THREE.MeshStandardMaterial({ color: INTERIOR, roughness: 0.3, side: THREE.DoubleSide }),
      teeth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }),
    };
  }, [dark, muzzled, coat, noseColor]);

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
        built.nose?.dispose();
      }
    },
    [built],
  );
  useEffect(() => () => fang.dispose(), [fang]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);


  // the World articulates the lower jaw (closed at rest, chewing, biting); elsewhere it keeps the
  // built gape. The hinge is measured from the built lip curves.
  const jaw = useContext(JawContext);
  const lowerJaw = useRef<THREE.Group>(null);
  const hinge = useMemo(() => (built ? hingeOf(built.upper, built.lower, built.aim) : null), [built]);
  const throat = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!hinge || !lowerJaw.current) return;
    // no control (Breed / Studio still): a mammal holds its mouth shut, everything else the built gape
    const open = jaw ? jaw.open : muzzled ? REST_SHUT : REST_PARTED;
    poseJaw(lowerJaw.current, hinge, open);
    if (throat.current) throat.current.visible = open > 0.35;
  });

  if (!built) return null;
  const coatMat = skin ?? mats.jaw;
  return (
    <group>
      {/* the throat stays with the skull; when the jaw nearly shuts there is no opening to show it
          through (and swinging it with the jaw pushed its upper edge out through the face) */}
      <mesh ref={throat} geometry={built.interior} material={mats.interior} />
      <mesh geometry={built.muzzle} material={coatMat} castShadow />
      <mesh geometry={built.upperLip} material={mats.lip} castShadow />
      <mesh geometry={built.upperFold} material={muzzled ? coatMat : mats.lip} castShadow />
      {built.nose && <mesh geometry={built.nose} material={mats.nose} castShadow />}
      {built.upperTeeth.length > 0 && (
        <instancedMesh
          args={[fang, mats.teeth, built.upperTeeth.length]}
          frustumCulled={false}
          ref={(m: THREE.InstancedMesh | null) => {
            if (m) setToothInstances(m, built.upperTeeth);
          }}
        />
      )}
      {/* the lower jaw: lip, mass and tooth row — one group, so it can swing on its hinge */}
      <group ref={lowerJaw}>
            <mesh geometry={built.jawMass} material={coatMat} castShadow />
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
