/**
 * X-ray skeleton overlay (Studio) — the grown node graph drawn through the skin: every node a dot
 * sized to its radius, every edge a bone line, coloured by the genome part that grew it. It is the
 * fastest way to see *why* a body looks the way it does — which chain is the trunk, where the legs
 * root, how a tail or neck is articulated — without reading the genome.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';

/** Part-kind → colour (the legend the Studio inspector shows). */
export const BONE_COLORS: Record<string, string> = {
  spine: '#e8e6df',
  leg: '#f0a35e',
  arm: '#f5d36b',
  tail: '#b48cf2',
  wing: '#6fd3f0',
  fin: '#5d9cf5',
  horn: '#f06e6e',
  eyestalk: '#7fe0a0',
  maw: '#f28ab8',
  tentacle: '#d68cf2',
  other: '#8b8f9a',
};

export function boneColor(kind: string | undefined): string {
  return BONE_COLORS[kind ?? 'spine'] ?? BONE_COLORS.other;
}

export function SkeletonOverlay({ phenotype }: { phenotype: Phenotype }) {
  const { lines, dots } = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (const [a, b] of phenotype.edges) {
      const na = phenotype.nodes[a];
      const nb = phenotype.nodes[b];
      c.set(boneColor(nb.kind === 'spine' ? 'spine' : nb.part?.kind));
      pos.push(...na.pos, ...nb.pos);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const ds = phenotype.nodes.map((n) => ({
      pos: n.pos,
      r: Math.max(0.018, Math.min(n.radius * 0.18, 0.07)),
      color: boneColor(n.kind === 'spine' ? 'spine' : n.part?.kind),
    }));
    return { lines: lg, dots: ds };
  }, [phenotype]);

  return (
    <group renderOrder={10}>
      <lineSegments geometry={lines} renderOrder={10}>
        <lineBasicMaterial vertexColors depthTest={false} transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
      {dots.map((d, i) => (
        <mesh key={i} position={d.pos} renderOrder={11}>
          <sphereGeometry args={[d.r, 8, 6]} />
          <meshBasicMaterial color={d.color} depthTest={false} transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
