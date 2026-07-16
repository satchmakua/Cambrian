/**
 * The beak mouth (mouth overhaul) — a hard keratin beak GROWING from the face (raptor / turtle /
 * cephalopod), replacing the legacy build's two cones floating in front of it.
 *
 * Everything anchors to a closed ring traced onto the true skin (`buildMouthRing`): a fleshy cere
 * collar sweeps the ring and seats the beak into the face, and the two mandibles are blade-cones
 * lofted from the ring's upper/lower half-centroids — roots buried a touch behind the skin so the
 * horn emerges THROUGH flesh instead of resting on it. The upper mandible runs forward along the
 * aim with a downward hook that accelerates into the tip (deeper on the seeded raptor draw); the
 * lower is a 0.75-scale counter-piece pitched down by the gape, so the beak hangs slightly open —
 * alive, hungry. A small dark wedge fills the gape at the base: recessed into the real cavity on
 * the carved smooth skin, a hair proud of the capsule kit as a dark backdrop. Slenderness and hook
 * depth key on the style's position inside the beak band, so beaks visibly evolve. No teeth.
 *
 * Geometry is authored NODE-RELATIVE (world minus the mouth node's rest position, no rotation), so
 * the feature group's per-frame translation carries the beak with the animated head.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Phenotype } from '../../engine/grow';
import type { Vec3 } from '../../engine/genome';
import { buildFieldPrims, norm3, projectToSurface, type Carve } from '../bodyField';
import type { MeshFeature } from '../meshData';
import { buildMouthRing, hash01, mouthSpec, type MouthSample, type MouthSpec, type SkinSurface } from '../mouthLine';
import { sweepTube } from '../sweep';
import { INTERIOR, KERATIN } from './palette';

export interface BeakBuild {
  spec: MouthSpec;
  r: number;
  collar: THREE.BufferGeometry; // the cere — a closed flattened tube riding the socket ring
  upper: THREE.BufferGeometry; // hooked upper mandible
  lower: THREE.BufferGeometry; // 0.75-scale counter-piece, pitched down by the gape
  interior: THREE.BufferGeometry; // dark wedge in the gape at the base
  ring: MouthSample[]; // node-relative socket anchors — every one sits on the true skin
  seat: { p: Vec3; n: Vec3 }; // node-relative on-surface mouth center + outward normal
  upperPath: Vec3[]; // node-relative loft spines (tests: protrusion, hook, symmetry)
  lowerPath: Vec3[];
  upperLen: number; // forward run along the aim (world units)
  lowerLen: number;
  hook: number; // tip pull-down (world units) — 0.25r..0.45r
}

/**
 * Pure builder — all geometry from the phenotype, deterministic, headless. Returns null when the
 * node isn't a mouth. Randomness only via `hash01(seed, salt)`; every draw keys on the node index,
 * never on a side, so the midline beak stays exactly bilateral (M18).
 */
export function buildBeak(
  phenotype: Phenotype,
  idx: number,
  carves: readonly Carve[],
  recessed: boolean,
  surface: SkinSurface = 'kit',
): BeakBuild | null {
  const spec = mouthSpec(phenotype, idx);
  if (!spec) return null;
  const r = spec.r;
  const seed = phenotype.genomeRef.seed;
  const f = buildFieldPrims(phenotype, 'body');
  const o = spec.node.pos; // node-relative frame origin

  // the socket ring: a 0.42-rad cone around the aim traced to the true skin. Its t parameter runs
  // the full turn (t = ±0.5 top/bottom, 0 and −1 the sides), so each open half is a mirror-closed
  // sample set — the half-centroids land exactly on the midline for a midline mouth.
  const ringW = buildMouthRing(phenotype, spec, 0.42, carves, 20, surface);
  const centerW = meanP(ringW);
  const c0 = projectToSurface(f, carves, centerW); // on-surface mouth center (the wedge's seat)
  const cu = meanP(ringW.filter((s) => s.t > 1e-6)); // upper-half centroid — the upper root
  const cl = meanP(ringW.filter((s) => s.t < -1e-6 && s.t > -1 + 1e-6)); // lower root
  let ringR = 0;
  for (const s of ringW) ringR += Math.hypot(s.p[0] - centerW[0], s.p[1] - centerW[1], s.p[2] - centerW[2]);
  ringR /= ringW.length;

  // style position inside the beak band [0.25, 0.375): high-band beaks run longer and slimmer;
  // the raptor draw deepens the hook. All bounds keep the tip inside the 1.5r protrusion budget.
  const style = spec.node.part?.style ?? 0.3;
  const sPos = Math.min(1, Math.max(0, (style - 0.25) / 0.125));
  const deep = hash01(seed, idx + 61) > 0.5;
  const upperLen = r * (1.0 + 0.35 * sPos + 0.12 * (hash01(seed, idx + 13) - 0.5));
  const lowerLen = upperLen * 0.75;
  const hook = r * Math.min(0.45, 0.25 + 0.08 * sPos + (deep ? 0.12 : 0));
  const slim = 1 - 0.22 * sPos + 0.06 * (hash01(seed, idx + 47) - 0.5);
  const upperR0 = r * 0.42 * slim;

  // both mandibles root a touch behind the skin so they emerge through the cere, not rest on it
  const back = 0.15 * r;
  const baseU: Vec3 = [cu[0] - spec.aim[0] * back, cu[1] - spec.aim[1] * back, cu[2] - spec.aim[2] * back];
  const baseL: Vec3 = [cl[0] - spec.aim[0] * back, cl[1] - spec.aim[1] * back, cl[2] - spec.aim[2] * back];
  const upperPathW = loftPath(baseU, spec.aim, upperLen, spec.up, (u) => hook * Math.pow(u, 2.7));
  // the lower pitches down off the aim by gape·0.3 — the hanging-open counter-piece
  const phi = spec.gape * 0.3;
  const dirL = norm3([
    spec.aim[0] * Math.cos(phi) - spec.up[0] * Math.sin(phi),
    spec.aim[1] * Math.cos(phi) - spec.up[1] * Math.sin(phi),
    spec.aim[2] * Math.cos(phi) - spec.up[2] * Math.sin(phi),
  ]);
  const lowerPathW = loftPath(baseL, dirL, lowerLen, spec.up, () => 0);

  const rel = (v: Vec3): Vec3 => [v[0] - o[0], v[1] - o[1], v[2] - o[2]];
  const ring = ringW.map((s) => ({ ...s, p: rel(s.p) }));
  const upperPath = upperPathW.map(rel);
  const lowerPath = lowerPathW.map(rel);
  const seat = { p: rel(c0.p), n: c0.n };

  const collar = sweepTube(
    ring.map((s) => ({ p: s.p, n: s.n })),
    { radius: () => r * 0.07, flatten: 0.7, radialSegments: 8, closed: true },
  );
  // blade-cones: the flatten axis is side-to-side (spec.right), NOT the surface normal — squashing
  // along `up` reads flat duck-bill/cartoon; a tall narrow blade reads raptor.
  const upper = sweepTube(
    upperPath.map((p) => ({ p, n: spec.right })),
    { radius: (u) => Math.max(r * 0.04, upperR0 * Math.pow(1 - u, 1.2)), flatten: 0.55, radialSegments: 10 },
  );
  const lower = sweepTube(
    lowerPath.map((p) => ({ p, n: spec.right })),
    { radius: (u) => Math.max(r * 0.03, upperR0 * 0.75 * Math.pow(1 - u, 1.2)), flatten: 0.55, radialSegments: 10 },
  );

  // the interior wedge: rim near the skin, throat point sunk — into the real carve when recessed,
  // a hair proud (+0.012r..0.015r) otherwise so the dark backdrop never hides inside the body
  const w = Math.max(0.1 * r, ringR * 0.5);
  const h = Math.max(0.08 * r, 0.45 * Math.hypot(cu[0] - cl[0], cu[1] - cl[1], cu[2] - cl[2]));
  const rimInset = recessed ? -0.3 * r : 0.015 * r;
  const centerInset = recessed ? -0.65 * r : 0.012 * r;
  const interior = interiorWedge(seat.p, seat.n, spec.right, spec.up, w, h, rimInset, centerInset);

  return { spec, r, collar, upper, lower, interior, ring, seat, upperPath, lowerPath, upperLen, lowerLen, hook };
}

/** Loft spine: `len` forward along `dir` from `base`, pulled down along `up` by `drop(u)`. */
function loftPath(base: Vec3, dir: Vec3, len: number, up: Vec3, drop: (u: number) => number, k = 9): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < k; i++) {
    const u = i / (k - 1);
    const d = drop(u);
    pts.push([
      base[0] + dir[0] * len * u - up[0] * d,
      base[1] + dir[1] * len * u - up[1] * d,
      base[2] + dir[2] * len * u - up[2] * d,
    ]);
  }
  return pts;
}

/**
 * A 5-vertex diamond spanning the gape between the mandible roots: rim at left/top/right/bottom
 * (`rimInset` along the seat normal), throat point at the center sunk to `centerInset`. Drawn
 * DoubleSide; depth reads through darkness on the capsule kit, through real recession when carved.
 */
function interiorWedge(p: Vec3, n: Vec3, right: Vec3, up: Vec3, w: number, h: number, rimInset: number, centerInset: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const at = (dx: number, dy: number, inset: number): void => {
    positions.push(
      p[0] + right[0] * dx + up[0] * dy + n[0] * inset,
      p[1] + right[1] * dx + up[1] * dy + n[1] * inset,
      p[2] + right[2] * dx + up[2] * dy + n[2] * inset,
    );
  };
  at(-w, 0, rimInset);
  at(0, h, rimInset);
  at(w, 0, rimInset);
  at(0, -h, rimInset);
  at(0, 0, centerInset); // vertex 4 — the throat point
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);
  geo.computeVertexNormals();
  return geo;
}

export function BeakMouth({
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
  surface?: SkinSurface; // which rendered skin to trace the socket ring onto (kit vs blended smooth/hybrid)
}) {
  const built = useMemo(
    () => buildBeak(phenotype, f.idx, carves, recessed, surface),
    [phenotype, f.idx, carves, recessed, surface],
  );

  const mats = useMemo(() => {
    // keratin darkened toward the body tone — horn, never toy plastic; the lower mandible darker
    const horn = new THREE.Color(KERATIN).lerp(new THREE.Color(dark), 0.3);
    const hornLo = new THREE.Color(KERATIN).lerp(new THREE.Color(dark), 0.5);
    const cere = new THREE.Color(dark).lerp(new THREE.Color(0x33201a), 0.45);
    return {
      upper: new THREE.MeshStandardMaterial({ color: horn, roughness: 0.38 }),
      lower: new THREE.MeshStandardMaterial({ color: hornLo, roughness: 0.42 }),
      cere: new THREE.MeshStandardMaterial({ color: cere, roughness: 0.62 }),
      interior: new THREE.MeshStandardMaterial({ color: INTERIOR, roughness: 0.3, side: THREE.DoubleSide }),
    };
  }, [dark]);

  // dispose per lifetime: the per-creature geometries turn over with `built`, but the materials
  // must NOT be disposed on every phenotype swap while still in use
  useEffect(
    () => () => {
      if (built) {
        built.collar.dispose();
        built.upper.dispose();
        built.lower.dispose();
        built.interior.dispose();
      }
    },
    [built],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  if (!built) return null;
  return (
    <group>
      <mesh geometry={built.interior} material={mats.interior} />
      <mesh geometry={built.collar} material={mats.cere} />
      <mesh geometry={built.upper} material={mats.upper} castShadow />
      <mesh geometry={built.lower} material={mats.lower} castShadow />
    </group>
  );
}

function meanP(samples: readonly MouthSample[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const s of samples) {
    c[0] += s.p[0];
    c[1] += s.p[1];
    c[2] += s.p[2];
  }
  const n = Math.max(1, samples.length);
  return [c[0] / n, c[1] / n, c[2] / n];
}

