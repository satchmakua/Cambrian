/**
 * The ring mouth family (mouth overhaul) — sucker · lamprey as ONE radial build over the mouth
 * ring, replacing the two hand-placed torus/cone assemblies.
 *
 * A radial orifice is not a torus stuck on the face; it is a hole IN the face: a fleshy lip wraps
 * a closed on-skin ring (`buildMouthRing`), and the interior is a funnel lofted from concentric
 * rings of the SAME fan, shrinking toward the throat. On the carved smooth skin the funnel sinks
 * into the real cavity (down to 0.9r); on the capsule kit no cavity exists, so the shell hugs the
 * skin a hair proud and depth reads through the near-black material (jawed's interior does the
 * same). Lampreys stud the funnel levels with concentric rasping tooth rings — one InstancedMesh,
 * deliberately ragged (odd counts, per-tooth jitter: a rotary rasp, not a gear). Suckers get no
 * teeth: a pale keratin rasp ring just inside the lip, radial pucker ridges, and a deep black
 * center disc where the suction hole reads. Roots always interpolate ring samples — floating is
 * impossible by construction.
 *
 * Geometry is authored NODE-RELATIVE (world minus the mouth node's rest position, no rotation), so
 * the feature group's per-frame translation carries the whole mouth with the animated head.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Phenotype } from '../../engine/grow';
import type { Vec3 } from '../../engine/genome';
import type { Carve } from '../bodyField';
import { basisToQuat, buildFieldPrims, projectToSurface, rayToSurface } from '../bodyField';
import type { MeshFeature } from '../meshData';
import { buildMouthRing, hash01, mouthSpec, type MouthSample, type SkinSurface } from '../mouthLine';
import { sweepTube, type SweepPoint } from '../sweep';
import { fangGeometry, setToothInstances, toothRing, type ToothXform } from '../teeth';
import { INTERIOR, KERATIN } from './palette';
import { relRow } from './shared';

export type RingVariant = 'sucker' | 'lamprey';

const SAMPLES = 20; // ring resolution — even, so exact mirror pairs exist: i ↔ (n/2 − i) mod n
const LEVELS = 4; // funnel loft rings, lip rim → throat
const SPREAD = 0.5; // lip ring cone half-angle (rad) around the aim

// lamprey rasp rings on the funnel levels, outward-in — odd/uneven counts so they never read
// as machined gears; toothRing's per-tooth jitter does the ragged sizing
const LAMPREY_RINGS = [
  { level: 1, count: 13, lenR: 0.22, salt: 3 },
  { level: 2, count: 9, lenR: 0.18, salt: 7 },
  { level: 3, count: 6, lenR: 0.14, salt: 11 },
] as const;

// pucker ridge ring indices — chosen in mirror pairs under i ↦ (n/2 − i) mod n (0↔10, 3↔7,
// 13↔17), so a midline sucker stays bilaterally exact (M18) while the spacing stays organic
const PUCKERS = [0, 3, 7, 10, 13, 17] as const;

export interface RingBuild {
  variant: RingVariant;
  r: number;
  lip: THREE.BufferGeometry; // closed swept lip torus on the true skin
  funnel: THREE.BufferGeometry; // lofted interior shell, rim → throat apex
  teeth: ToothXform[]; // lamprey only — all rings concat'd into one instanced draw
  rasp: THREE.BufferGeometry | null; // sucker only — pale keratin ring just inside the lip
  ridges: THREE.BufferGeometry[]; // sucker only — radial pucker folds down the funnel
  disc: { pos: Vec3; quat: [number, number, number, number]; scale: Vec3 } | null; // sucker hole
  lipSamples: MouthSample[]; // node-relative on-skin lip ring (tests anchor + mirror on these)
  levels: MouthSample[][]; // node-relative raw funnel traces, pre-offset (tests)
}

/**
 * Pure builder — everything the ring mouth renders, or null if the node isn't a mouth.
 * `recessed` says the smooth skin carved the real funnel cavity behind this mouth.
 */
export function buildRing(
  phenotype: Phenotype,
  idx: number,
  carves: readonly Carve[],
  recessed: boolean,
  surface: SkinSurface = 'kit',
): RingBuild | null {
  const spec = mouthSpec(phenotype, idx);
  if (!spec) return null;
  const variant: RingVariant = spec.variant === 'lamprey' ? 'lamprey' : 'sucker';
  const r = spec.r;
  const seed = phenotype.genomeRef.seed;
  const o = spec.node.pos; // node-relative frame origin


  // outer lip — traced on the real (possibly carved) surface so it hugs whatever rim exists
  const lipSamples = relRow(buildMouthRing(phenotype, spec, SPREAD, carves, SAMPLES, surface), o);

  // seeded lip girth wobble keyed on sin(angle): invariant under the ring's X-mirror (a → π−a),
  // so twin samples draw identical girth (M18) while the ring still swells and thins organically
  const lipR = (u: number): number => {
    const key = Math.round((Math.sin((2 * u - 1) * Math.PI) + 1) * 512);
    return r * 0.14 * (1 + (hash01(seed, idx * 131 + key) * 2 - 1) * 0.18);
  };
  const lip = sweepTube(
    lipSamples.map((s): SweepPoint => ({ p: s.p, n: s.n })),
    { radius: lipR, flatten: 0.6, radialSegments: 10, closed: true },
  );

  // funnel levels — concentric rings of the SAME fan, traced on the pristine skin (the recess is
  // applied below by depth, so tracing inside the cavity would double-count it)
  const levels: MouthSample[][] = [];
  for (let k = 0; k < LEVELS; k++) {
    levels.push(relRow(buildMouthRing(phenotype, spec, SPREAD * (1 - k / LEVELS), [], SAMPLES, surface), o));
  }

  // recessed: sink the shell down the carved throat along −aim, rim → 0.9r deep.
  // capsule kit: no cavity exists — keep every ring a hair proud of its own trace (never hide
  // geometry inside the body), grading the proudness down toward the throat for a subtle dish.
  const depth = (k: number): number => (recessed ? r * (0.15 + (0.75 * k) / (LEVELS - 1)) : 0);
  const proud = (k: number): number => (recessed ? 0 : r * (0.018 - 0.002 * k));
  const shell: MouthSample[][] = levels.map((ring, k) =>
    ring.map((s) => ({
      ...s,
      p: [
        s.p[0] - spec.aim[0] * depth(k) + s.n[0] * proud(k),
        s.p[1] - spec.aim[1] * depth(k) + s.n[1] * proud(k),
        s.p[2] - spec.aim[2] * depth(k) + s.n[2] * proud(k),
      ] as Vec3,
    })),
  );

  // throat apex — the on-axis skin trace, sunk past the innermost ring (recessed) or a hair proud
  const f = buildFieldPrims(phenotype, 'body');
  const origin: Vec3 = [
    spec.anchor.pos[0] - spec.aim[0] * spec.anchor.radius * 0.2,
    spec.anchor.pos[1] - spec.aim[1] * spec.anchor.radius * 0.2,
    spec.anchor.pos[2] - spec.aim[2] * spec.anchor.radius * 0.2,
  ];
  const axis =
    rayToSurface(f, [], origin, spec.aim) ??
    projectToSurface(f, [], [origin[0] + spec.aim[0] * r, origin[1] + spec.aim[1] * r, origin[2] + spec.aim[2] * r]);
  const apexOff = recessed ? -1.02 * r : 0;
  const apexProud = recessed ? 0 : 0.012 * r;
  const apex: Vec3 = [
    axis.p[0] - o[0] + spec.aim[0] * apexOff + axis.n[0] * apexProud,
    axis.p[1] - o[1] + spec.aim[1] * apexOff + axis.n[1] * apexProud,
    axis.p[2] - o[2] + spec.aim[2] * apexOff + axis.n[2] * apexProud,
  ];
  const funnel = funnelShell(shell, apex);

  // lamprey — concentric tooth rings rooted on the funnel levels, raking down the throat
  const teeth: ToothXform[] = [];
  if (variant === 'lamprey') {
    // no carved throat on the un-carved kit — tilt crowns outward so they skate across the skin-level dish instead of diving through the body
    const inward: Vec3 = recessed
      ? [-spec.aim[0], -spec.aim[1], -spec.aim[2]]
      : [spec.aim[0] * 0.33, spec.aim[1] * 0.33, spec.aim[2] * 0.33];
    for (const ring of LAMPREY_RINGS) {
      teeth.push(...toothRing(shell[ring.level], ring.count, ring.lenR, r, seed, ring.salt, inward));
    }
  }

  // sucker — no teeth: a keratin rasp ring, pucker folds, and the black suction hole
  let rasp: THREE.BufferGeometry | null = null;
  const ridges: THREE.BufferGeometry[] = [];
  let disc: RingBuild['disc'] = null;
  if (variant === 'sucker') {
    rasp = sweepTube(
      shell[1].map((s): SweepPoint => ({ p: s.p, n: s.n })),
      { radius: () => r * 0.038, flatten: 0.7, radialSegments: 8, closed: true },
    );
    for (const j of PUCKERS) {
      const pts: SweepPoint[] = [];
      for (let k = 0; k < LEVELS; k++) pts.push({ p: shell[k][j].p, n: shell[k][j].n });
      ridges.push(sweepTube(pts, { radius: (u) => r * (0.05 - 0.028 * u), flatten: 0.6, radialSegments: 7 }));
    }
    disc = {
      pos: [apex[0] + spec.aim[0] * r * 0.02, apex[1] + spec.aim[1] * r * 0.02, apex[2] + spec.aim[2] * r * 0.02],
      quat: basisToQuat(spec.right, spec.up, spec.aim),
      scale: [r * 0.34, r * 0.34, r * 0.09],
    };
  }

  return { variant, r, lip, funnel, teeth, rasp, ridges, disc, lipSamples, levels };
}

export function RingMouth({
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
  recessed: boolean; // true when the smooth skin actually carved the funnel behind this mouth
  dark: number;
  surface?: SkinSurface; // which rendered skin to trace the ring onto (kit vs blended smooth/hybrid)
}) {
  const built = useMemo(
    () => buildRing(phenotype, f.idx, carves, recessed, surface),
    [phenotype, f.idx, carves, recessed, surface],
  );
  const fang = useMemo(() => fangGeometry(), []);
  const mats = useMemo(() => {
    const lip = new THREE.Color(dark).lerp(new THREE.Color(0x7a2f33), 0.45);
    const pucker = new THREE.Color(dark).lerp(new THREE.Color(0x4a2026), 0.55);
    return {
      lip: new THREE.MeshStandardMaterial({ color: lip, roughness: 0.5 }),
      funnel: new THREE.MeshStandardMaterial({ color: INTERIOR, roughness: 0.3, side: THREE.DoubleSide }),
      teeth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }),
      rasp: new THREE.MeshStandardMaterial({ color: KERATIN, roughness: 0.55 }),
      pucker: new THREE.MeshStandardMaterial({ color: pucker, roughness: 0.45 }),
      disc: new THREE.MeshStandardMaterial({ color: 0x0b0203, roughness: 0.25 }),
    };
  }, [dark]);

  // dispose per lifetime: the per-creature geometries turn over with `built`, but the shared fang
  // and the materials must NOT be disposed on every phenotype swap while still in use
  useEffect(
    () => () => {
      if (built) {
        built.lip.dispose();
        built.funnel.dispose();
        built.rasp?.dispose();
        built.ridges.forEach((g) => g.dispose());
      }
    },
    [built],
  );
  useEffect(() => () => fang.dispose(), [fang]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  if (!built) return null;
  return (
    <group>
      <mesh geometry={built.funnel} material={mats.funnel} />
      <mesh geometry={built.lip} material={mats.lip} castShadow />
      {built.rasp && <mesh geometry={built.rasp} material={mats.rasp} />}
      {built.ridges.map((g, i) => (
        <mesh key={i} geometry={g} material={mats.pucker} />
      ))}
      {built.disc && (
        <mesh position={built.disc.pos} quaternion={built.disc.quat} scale={built.disc.scale} material={mats.disc}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
      )}
      {built.teeth.length > 0 && (
        <instancedMesh
          args={[fang, mats.teeth, built.teeth.length]}
          frustumCulled={false}
          ref={(m: THREE.InstancedMesh | null) => {
            if (m) setToothInstances(m, built.teeth);
          }}
        />
      )}
    </group>
  );
}

/**
 * Loft the concentric shell rings into one funnel surface, closed at the throat by an apex fan.
 * Rings share a sample grid (same fan, same count), so quads connect index-to-index — exactly
 * radial. Normals via computeVertexNormals; drawn DoubleSide.
 */
function funnelShell(shell: readonly MouthSample[][], apex: Vec3): THREE.BufferGeometry {
  const K = shell.length;
  const n = shell[0].length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of shell) for (const s of ring) positions.push(s.p[0], s.p[1], s.p[2]);
  const apexIdx = K * n;
  positions.push(apex[0], apex[1], apex[2]);
  for (let k = 0; k < K - 1; k++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = k * n + i, b = k * n + i2, c = (k + 1) * n + i, d = (k + 1) * n + i2;
      indices.push(a, c, b, b, c, d);
    }
  }
  for (let i = 0; i < n; i++) {
    indices.push(apexIdx, (K - 1) * n + ((i + 1) % n), (K - 1) * n + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
