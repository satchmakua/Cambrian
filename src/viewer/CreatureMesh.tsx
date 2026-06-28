/**
 * Renders a Phenotype as a capsule-union body (DESIGN §6.3): a sphere per node and
 * a capsule per skeleton edge. Robust for any topology — long, branchy, asymmetric.
 */
import { useMemo } from 'react';
import type { Phenotype } from '../engine/grow';
import { buildMeshData } from './meshData';

export function CreatureMesh({ phenotype }: { phenotype: Phenotype }) {
  const { capsules, spheres } = useMemo(() => buildMeshData(phenotype), [phenotype]);

  return (
    <group>
      {spheres.map((s, k) => (
        <mesh key={`s${k}`} position={s.position}>
          <sphereGeometry args={[s.radius, 16, 12]} />
          <meshStandardMaterial
            color={s.color}
            roughness={s.eye ? 0.2 : 0.65}
            metalness={s.eye ? 0.1 : 0.05}
          />
        </mesh>
      ))}
      {capsules.map((c, k) => (
        <mesh key={`c${k}`} position={c.position} quaternion={c.quaternion}>
          <capsuleGeometry args={[c.radius, c.length, 4, 12]} />
          <meshStandardMaterial color={c.color} roughness={0.65} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}
