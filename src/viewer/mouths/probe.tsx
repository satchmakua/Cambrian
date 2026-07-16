/**
 * The probe mouth family (mouth overhaul) — proboscis · trunk as one collared feeding-tube build,
 * replacing the glued-on cylinder stacks.
 *
 * A feeding tube is not a cylinder stuck to a face: it EMERGES. Skin puckers into a collar around
 * its root (a closed sweep along `buildMouthRing`'s true-skin samples), and the tube itself is one
 * continuous tapering sweep whose centerline starts at the ring's centroid sunk slightly INTO the
 * body — rooted by construction, never gapped. The path lives entirely in the aim/up plane (droop
 * bends along `up`, never `right`), so a midline mouth keeps strict bilateral symmetry (M18).
 *
 * The proboscis is a thin insect feeding tube: 2.1r reach, a gentle seeded sinusoidal droop,
 * ringed segment texture, a dark wet tip. The trunk is prehensile (tapir/elephant): a tangent-
 * angle arc whose pitch accelerates past vertical so the last two points tuck back under the
 * body, annular ridges, and a flat tip face carrying two mirrored INTERIOR nostril discs.
 *
 * No teeth. These variants carve no cavity, so `recessed` is accepted but unused — the tube
 * exists entirely proud of the skin either way.
 *
 * Geometry is authored NODE-RELATIVE (world minus the mouth node's rest position, no rotation),
 * so the feature group's per-frame translation carries the tube with the animated head.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Phenotype } from '../../engine/grow';
import type { Vec3 } from '../../engine/genome';
import type { Carve } from '../bodyField';
import { basisToQuat, cross3, norm3 } from '../bodyField';
import type { MeshFeature } from '../meshData';
import { buildMouthRing, hash01, mouthSpec, type MouthSample, type SkinSurface } from '../mouthLine';
import { sweepTube } from '../sweep';
import { INTERIOR, LIP } from './palette';

export interface ProbeBuild {
  variant: 'proboscis' | 'trunk';
  r: number;
  collar: THREE.BufferGeometry; // the pucker ring of flesh around the tube's root (closed sweep)
  tube: THREE.BufferGeometry; // the feeding tube itself
  ring: MouthSample[]; // node-relative collar samples — on the true skin (tests anchor here)
  path: Vec3[]; // node-relative tube centerline, root → tip
  tipCap: { pos: Vec3; r: number } | null; // proboscis: tiny dark wet tip
  tipFace: { pos: Vec3; quat: [number, number, number, number]; r: number } | null; // trunk pad
  nostrils: { pos: Vec3; quat: [number, number, number, number]; r: number }[]; // trunk: 2, mirrored
}

/**
 * Pure build — all geometry + accent placements for one probe mouth, or null if the node isn't a
 * mouth. `_recessed` is accepted for dispatcher parity only: probe mouths carve nothing, so the
 * build is identical whether the smooth skin recessed a cavity or not.
 */
export function buildProbe(
  phenotype: Phenotype,
  idx: number,
  carves: readonly Carve[],
  _recessed: boolean,
  surface: SkinSurface = 'kit',
): ProbeBuild | null {
  const spec = mouthSpec(phenotype, idx);
  if (!spec) return null;
  // the dispatcher routes the 0.85..1 style band here; anything not 'trunk' reads as proboscis
  const variant: ProbeBuild['variant'] = spec.variant === 'trunk' ? 'trunk' : 'proboscis';
  const trunk = variant === 'trunk';
  const r = spec.r;
  const seed = phenotype.genomeRef.seed;
  const o = spec.node.pos; // node-relative frame origin
  const aim = spec.aim;
  const up = spec.up;

  // collar — flesh puckering around the tube's root, seated on the true skin; a fat trunk gets a
  // wider, thicker collar than the thin proboscis
  const ring = buildMouthRing(phenotype, spec, trunk ? 0.36 : 0.3, carves, 20, surface).map(
    (s) => ({ ...s, p: [s.p[0] - o[0], s.p[1] - o[1], s.p[2] - o[2]] as Vec3 }),
  );
  const collar = sweepTube(ring.map((s) => ({ p: s.p, n: s.n })), {
    radius: () => r * (trunk ? 0.1 : 0.06),
    flatten: 0.7,
    radialSegments: 10,
    closed: true,
  });

  // root: the ring's centroid sunk a touch behind the skin — the tube can never gap off the face
  const c: Vec3 = [0, 0, 0];
  for (const s of ring) {
    c[0] += s.p[0];
    c[1] += s.p[1];
    c[2] += s.p[2];
  }
  c[0] /= ring.length;
  c[1] /= ring.length;
  c[2] /= ring.length;
  const sink = r * (trunk ? 0.2 : 0.15);
  const base: Vec3 = [c[0] - aim[0] * sink, c[1] - aim[1] * sink, c[2] - aim[2] * sink];

  const path: Vec3[] = [];
  if (trunk) {
    // tangent-angle arc: pitch φ accelerates from 0 (forward) past vertical, so the last two
    // segments tuck back toward the body — the prehensile read. Reach ≈ 1.4r, drop ≈ 1.3r.
    const phiMax = 2.05 + 0.2 * hash01(seed, idx + 71); // always past π/2 — the tip must tuck
    const n = 12;
    const ds = (2.3 * r) / (n - 1);
    let x = base[0], y = base[1], z = base[2];
    path.push([x, y, z]);
    for (let i = 1; i < n; i++) {
      const phi = phiMax * Math.pow((i - 0.5) / (n - 1), 1.7);
      const cf = Math.cos(phi), sf = Math.sin(phi);
      x += (aim[0] * cf - up[0] * sf) * ds;
      y += (aim[1] * cf - up[1] * sf) * ds;
      z += (aim[2] * cf - up[2] * sf) * ds;
      path.push([x, y, z]);
    }
  } else {
    // thin feeding tube: 2.1r forward with a gentle seeded sinusoidal droop (net-down at the tip)
    const n = 10;
    const ph = hash01(seed, idx + 71) * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const fwd = 2.1 * r * u;
      const sag = -r * (0.28 * u * u + 0.08 * u * Math.sin(u * 3.6 + ph));
      path.push([
        base[0] + aim[0] * fwd + up[0] * sag,
        base[1] + aim[1] * fwd + up[1] * sag,
        base[2] + aim[2] * fwd + up[2] * sag,
      ]);
    }
  }

  const tube = sweepTube(path.map((pt) => ({ p: pt, n: up })), {
    radius: trunk
      ? (u) => r * (0.3 - 0.18 * u) * (1 + 0.06 * Math.sin(u * 26)) // annular hide ridges
      : (u) => r * (0.11 - 0.075 * u) * (1 + 0.05 * Math.sin(u * 22)), // segment rings
    radialSegments: trunk ? 12 : 10,
  });

  // tip dressing — frame from the last segment; `side` = the path-plane normal (spec.right), so
  // the trunk's nostril pair mirrors exactly across X=0 on a midline mouth
  const tip = path[path.length - 1];
  const prev = path[path.length - 2];
  const T = norm3([tip[0] - prev[0], tip[1] - prev[1], tip[2] - prev[2]]);
  let tipCap: ProbeBuild['tipCap'] = null;
  let tipFace: ProbeBuild['tipFace'] = null;
  const nostrils: ProbeBuild['nostrils'] = [];
  if (trunk) {
    const side = spec.right;
    const quat = basisToQuat(side, cross3(T, side), T); // local +Z = tip tangent (discs flatten along it)
    tipFace = {
      pos: [tip[0] + T[0] * r * 0.02, tip[1] + T[1] * r * 0.02, tip[2] + T[2] * r * 0.02],
      quat,
      r: r * 0.13,
    };
    for (const sgn of [-1, 1]) {
      nostrils.push({
        pos: [
          tip[0] + T[0] * r * 0.05 + side[0] * sgn * r * 0.055,
          tip[1] + T[1] * r * 0.05 + side[1] * sgn * r * 0.055,
          tip[2] + T[2] * r * 0.05 + side[2] * sgn * r * 0.055,
        ],
        quat,
        r: r * 0.036,
      });
    }
  } else {
    tipCap = {
      pos: [tip[0] + T[0] * r * 0.01, tip[1] + T[1] * r * 0.01, tip[2] + T[2] * r * 0.01],
      r: r * 0.05, // just over the tube's 0.035r end — caps it darkly
    };
  }

  return { variant, r, collar, tube, ring, path, tipCap, tipFace, nostrils };
}

export function ProbeMouth({
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
  recessed: boolean; // accepted for API parity — probe mouths carve nothing (see buildProbe)
  dark: number;
  surface?: SkinSurface; // which rendered skin to trace the collar onto (kit vs blended smooth/hybrid)
}) {
  const built = useMemo(
    () => buildProbe(phenotype, f.idx, carves, recessed, surface),
    [phenotype, f.idx, carves, recessed, surface],
  );
  const mats = useMemo(() => {
    const d = new THREE.Color(dark);
    return {
      collar: new THREE.MeshStandardMaterial({ color: d.clone().lerp(new THREE.Color(LIP), 0.35), roughness: 0.55 }),
      probe: new THREE.MeshStandardMaterial({ color: d.clone().lerp(new THREE.Color(0x241a1c), 0.45), roughness: 0.42 }), // chitinous, faintly wet
      hide: new THREE.MeshStandardMaterial({ color: d.clone().lerp(new THREE.Color(0x2e2320), 0.4), roughness: 0.68 }), // dry leathery trunk
      pad: new THREE.MeshStandardMaterial({ color: d.clone().lerp(new THREE.Color(0x51282c), 0.55), roughness: 0.38 }), // moist prehensile tip
      interior: new THREE.MeshStandardMaterial({ color: INTERIOR, roughness: 0.3 }),
    };
  }, [dark]);

  // dispose per lifetime: the per-creature geometries turn over with `built`, but the materials
  // must NOT be disposed on every phenotype swap while still in use
  useEffect(
    () => () => {
      if (built) {
        built.collar.dispose();
        built.tube.dispose();
      }
    },
    [built],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  if (!built) return null;
  return (
    <group>
      <mesh geometry={built.collar} material={mats.collar} castShadow />
      <mesh geometry={built.tube} material={built.variant === 'trunk' ? mats.hide : mats.probe} castShadow />
      {built.tipCap && (
        <mesh position={built.tipCap.pos} scale={built.tipCap.r} material={mats.interior}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      )}
      {built.tipFace && (
        <mesh
          position={built.tipFace.pos}
          quaternion={built.tipFace.quat}
          scale={[built.tipFace.r, built.tipFace.r, built.tipFace.r * 0.35]}
          material={mats.pad}
        >
          <sphereGeometry args={[1, 12, 8]} />
        </mesh>
      )}
      {built.nostrils.map((n, i) => (
        <mesh key={i} position={n.pos} quaternion={n.quat} scale={[n.r, n.r, n.r * 0.55]} material={mats.interior}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}

