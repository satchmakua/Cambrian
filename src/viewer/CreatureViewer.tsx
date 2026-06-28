/**
 * The 3D viewport: the current creature on a slow turntable, auto-framed and lit by
 * drei's <Stage>, with an orbit camera (DESIGN §7). The naturalist "alien field
 * guide" view that every other mode plugs into.
 */
import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import type { Group } from 'three';
import type { Phenotype } from '../engine/grow';
import { CreatureMesh } from './CreatureMesh';

function Turntable({ phenotype }: { phenotype: Phenotype }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.4;
  });
  return (
    <group ref={ref}>
      <CreatureMesh phenotype={phenotype} />
    </group>
  );
}

export function CreatureViewer({ phenotype }: { phenotype: Phenotype }) {
  // Dev-only handle so a headless harness can read creature state behind the
  // animation loop (stacks.md note for continuously-animating canvases).
  useEffect(() => {
    (window as unknown as { __cambrian?: unknown }).__cambrian = {
      nodeCount: phenotype.nodes.length,
      edgeCount: phenotype.edges.length,
      seed: phenotype.genomeRef.seed,
    };
  }, [phenotype]);

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [4, 2.5, 5], fov: 45 }}>
      <color attach="background" args={['#0f1116']} />
      <Stage intensity={0.5} environment="city" adjustCamera={1.1} shadows="contact">
        <Turntable phenotype={phenotype} />
      </Stage>
      <OrbitControls makeDefault enablePan={false} minDistance={2} maxDistance={20} />
    </Canvas>
  );
}
