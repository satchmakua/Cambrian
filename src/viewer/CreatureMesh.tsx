/**
 * Renders a Phenotype and gives it life (DESIGN §6.3/§6.4, M5 motion).
 *
 * The body is a capsule-union skinned with the shared countershaded material, plus
 * features (eyes, mouth, feet, claws, fins). Each frame a topology-free deformation
 * animates the node positions — a traveling sine wave along the body (undulation, strong
 * for serpents, gentle for legged bodies) plus a phased leg gait (low nodes lift/swing) —
 * and the capsules/spheres/features are re-posed to match. Pure viewer concern: the
 * engine's grow() stays static and deterministic.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { buildMeshData, type MeshFeature } from './meshData';
import { buildRig, computeAnim } from './animation';
import { makeCreatureMaterial } from './creatureMaterial';

const UP = new THREE.Vector3(0, 1, 0);

export function CreatureMesh({ phenotype }: { phenotype: Phenotype }) {
  const data = useMemo(() => buildMeshData(phenotype), [phenotype]);
  const pal = phenotype.genomeRef.palette;
  const seed = phenotype.genomeRef.seed;

  const bodyMat = useMemo(() => makeCreatureMaterial(pal, seed), [pal, seed]);
  useEffect(() => () => bodyMat.dispose(), [bodyMat]);

  const footColor = useMemo(
    () => new THREE.Color().setHSL(pal.hueA, pal.sat, Math.max(0.12, pal.light * 0.45)).getHex(),
    [pal],
  );
  const finColor = useMemo(() => new THREE.Color().setHSL(pal.hueA, pal.sat, pal.light).getHex(), [pal]);

  const rig = useMemo(() => buildRig(data), [data]);

  // base capsule transforms for the initial (pre-animation) frame
  const baseCaps = useMemo(() => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion();
    return data.edges.map((e) => {
      a.fromArray(data.nodes[e.a].pos);
      b.fromArray(data.nodes[e.b].pos);
      dir.subVectors(b, a);
      const len = Math.max(dir.length(), 1e-3);
      dir.divideScalar(len);
      q.setFromUnitVectors(UP, dir);
      return {
        len,
        pos: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2] as [number, number, number],
        quat: [q.x, q.y, q.z, q.w] as [number, number, number, number],
      };
    });
  }, [data]);

  const sphereRefs = useRef<THREE.Mesh[]>([]);
  const capsuleRefs = useRef<THREE.Mesh[]>([]);
  const featureRefs = useRef<THREE.Object3D[]>([]);

  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);

  useFrame((st) => {
    const anim = computeAnim(rig, st.clock.elapsedTime);
    const { bodySpheres, edges, features } = data;

    if (import.meta.env.DEV) {
      // dev-only motion probe: the live animated position of the last node
      const li = (rig.n - 1) * 3;
      (window as unknown as { __cambrianAnim?: number[] }).__cambrianAnim = [
        +anim[li].toFixed(3),
        +anim[li + 1].toFixed(3),
        +anim[li + 2].toFixed(3),
      ];
    }

    for (let s = 0; s < bodySpheres.length; s++) {
      const i = bodySpheres[s];
      const m = sphereRefs.current[s];
      if (m) m.position.set(anim[i * 3], anim[i * 3 + 1], anim[i * 3 + 2]);
    }
    for (let e = 0; e < edges.length; e++) {
      const m = capsuleRefs.current[e];
      if (!m) continue;
      const { a: ia, b: ib } = edges[e];
      a.set(anim[ia * 3], anim[ia * 3 + 1], anim[ia * 3 + 2]);
      b.set(anim[ib * 3], anim[ib * 3 + 1], anim[ib * 3 + 2]);
      dir.subVectors(b, a);
      const len = dir.length() || 1e-3;
      dir.divideScalar(len);
      m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.copy(q.setFromUnitVectors(UP, dir));
    }
    for (let f = 0; f < features.length; f++) {
      const i = features[f].idx;
      const o = featureRefs.current[f];
      if (o) o.position.set(anim[i * 3], anim[i * 3 + 1], anim[i * 3 + 2]);
    }
  });

  return (
    <group>
      {data.bodySpheres.map((i, s) => (
        <mesh
          key={`s${s}`}
          ref={(el) => {
            if (el) sphereRefs.current[s] = el;
          }}
          position={data.nodes[i].pos}
          material={bodyMat}
          castShadow
        >
          <sphereGeometry args={[data.nodes[i].radius, 18, 14]} />
        </mesh>
      ))}
      {data.edges.map((e, k) => (
        <mesh
          key={`c${k}`}
          ref={(el) => {
            if (el) capsuleRefs.current[k] = el;
          }}
          position={baseCaps[k].pos}
          quaternion={baseCaps[k].quat}
          material={bodyMat}
          castShadow
        >
          <capsuleGeometry args={[e.radius, baseCaps[k].len, 6, 14]} />
        </mesh>
      ))}
      {data.features.map((f, k) => (
        <group
          key={`f${k}`}
          ref={(el) => {
            if (el) featureRefs.current[k] = el;
          }}
          position={data.nodes[f.idx].pos}
        >
          <Feature f={f} footColor={footColor} finColor={finColor} />
        </group>
      ))}
    </group>
  );
}

// Features render at the local origin of their (animated) parent group.
function Feature({ f, footColor, finColor }: { f: MeshFeature; footColor: number; finColor: number }) {
  switch (f.type) {
    case 'eye':
      return <Eye f={f} />;
    case 'mouth':
      return <Mouth f={f} />;
    case 'fin':
      return <Fin f={f} color={finColor} />;
    case 'claw':
      return <Claw f={f} color={footColor} />;
    default:
      return <Foot f={f} color={footColor} />;
  }
}

// An eye: pale sclera + dark pupil facing outward (+Z local) + a bright highlight.
function Eye({ f }: { f: MeshFeature }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <group quaternion={f.quat}>
      <mesh>
        <sphereGeometry args={[r, 16, 12]} />
        <meshStandardMaterial color={0xeae6dc} roughness={0.18} metalness={0.0} />
      </mesh>
      <mesh position={[0, 0, r * 0.62]}>
        <sphereGeometry args={[r * 0.55, 14, 12]} />
        <meshStandardMaterial color={0x0a0a0e} roughness={0.1} metalness={0.0} />
      </mesh>
      <mesh position={[r * 0.26, r * 0.3, r * 0.78]}>
        <sphereGeometry args={[r * 0.16, 8, 8]} />
        <meshBasicMaterial color={0xffffff} />
      </mesh>
    </group>
  );
}

// A mouth: a dark, horizontal flattened slit (world-aligned via the unrotated group).
function Mouth({ f }: { f: MeshFeature }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <mesh scale={[r * 1.7, r * 0.5, r * 1.0]}>
      <sphereGeometry args={[1, 16, 10]} />
      <meshStandardMaterial color={0x1a0d10} roughness={0.45} metalness={0.0} />
    </mesh>
  );
}

// A foot/paw: a flattened pad, sole-down, longer front-to-back.
function Foot({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <mesh scale={[r * 1.15, r * 0.55, r * 1.45]} castShadow>
      <sphereGeometry args={[1, 14, 12]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.0} />
    </mesh>
  );
}

// A claw: a darker, pointed talon (downward cone) — sharper than a foot.
function Claw({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.7).getHex(), [color]);
  return (
    <mesh rotation={[Math.PI, 0, 0]} scale={[r * 1.0, r * 1.7, r * 1.0]} castShadow>
      <coneGeometry args={[1, 1.4, 7]} />
      <meshStandardMaterial color={dark} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

// A fin: a thin blade, oriented outward by the node frame.
function Fin({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <mesh quaternion={f.quat} scale={[r * 0.32, r * 1.2, r * 1.6]}>
      <sphereGeometry args={[1, 12, 10]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.0} />
    </mesh>
  );
}
