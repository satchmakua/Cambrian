/**
 * Renders a Phenotype: the body as a capsule-union skinned with the shared
 * countershaded creature material, plus special "features" — eyes (sclera + pupil +
 * highlight), a mouth, feet, and fins — that turn a blob into a face and limbs
 * (DESIGN §6.3/§6.4). Eyes get the most care: they're the creature's emotional anchor.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import type { FeatureInst } from './meshData';
import { buildMeshData } from './meshData';
import { makeCreatureMaterial } from './creatureMaterial';

export function CreatureMesh({ phenotype }: { phenotype: Phenotype }) {
  const { capsules, spheres, features } = useMemo(() => buildMeshData(phenotype), [phenotype]);
  const pal = phenotype.genomeRef.palette;
  const seed = phenotype.genomeRef.seed;

  const bodyMat = useMemo(() => makeCreatureMaterial(pal, seed), [pal, seed]);
  useEffect(() => () => bodyMat.dispose(), [bodyMat]);

  const footColor = useMemo(
    () => new THREE.Color().setHSL(pal.hueA, pal.sat, Math.max(0.12, pal.light * 0.45)).getHex(),
    [pal],
  );
  const finColor = useMemo(() => new THREE.Color().setHSL(pal.hueA, pal.sat, pal.light).getHex(), [pal]);

  return (
    <group>
      {spheres.map((s, k) => (
        <mesh key={`s${k}`} position={s.position} material={bodyMat} castShadow>
          <sphereGeometry args={[s.radius, 18, 14]} />
        </mesh>
      ))}
      {capsules.map((c, k) => (
        <mesh key={`c${k}`} position={c.position} quaternion={c.quaternion} material={bodyMat} castShadow>
          <capsuleGeometry args={[c.radius, c.length, 6, 14]} />
        </mesh>
      ))}
      {features.map((f, k) => (
        <Feature key={`f${k}`} f={f} footColor={footColor} finColor={finColor} />
      ))}
    </group>
  );
}

function Feature({ f, footColor, finColor }: { f: FeatureInst; footColor: number; finColor: number }) {
  switch (f.type) {
    case 'eye':
      return <Eye f={f} />;
    case 'mouth':
      return <Mouth f={f} />;
    case 'fin':
      return <Fin f={f} color={finColor} />;
    default:
      return <Foot f={f} color={footColor} />; // foot, claw
  }
}

// An eye: pale sclera + dark pupil facing outward (+Z local) + a bright highlight.
function Eye({ f }: { f: FeatureInst }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <group position={f.position} quaternion={f.quaternion}>
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

// A mouth: a dark, horizontal flattened slit on the face (world-aligned for a clean line).
function Mouth({ f }: { f: FeatureInst }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <mesh position={f.position} scale={[r * 1.7, r * 0.5, r * 1.0]}>
      <sphereGeometry args={[1, 16, 10]} />
      <meshStandardMaterial color={0x1a0d10} roughness={0.45} metalness={0.0} />
    </mesh>
  );
}

// A foot/paw: a flattened pad, sole-down (world-aligned), longer front-to-back.
function Foot({ f, color }: { f: FeatureInst; color: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <mesh position={f.position} scale={[r * 1.15, r * 0.55, r * 1.45]} castShadow>
      <sphereGeometry args={[1, 14, 12]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.0} />
    </mesh>
  );
}

// A fin: a thin blade, oriented outward by the node frame.
function Fin({ f, color }: { f: FeatureInst; color: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <mesh position={f.position} quaternion={f.quaternion} scale={[r * 0.32, r * 1.2, r * 1.6]}>
      <sphereGeometry args={[1, 12, 10]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.0} />
    </mesh>
  );
}
