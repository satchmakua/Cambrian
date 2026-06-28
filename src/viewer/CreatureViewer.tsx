/**
 * The 3D viewport: the current creature on a slow turntable, auto-framed and lit by
 * drei's <Stage>, with an orbit camera (DESIGN §7). The naturalist "alien field
 * guide" view that every other mode plugs into.
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import type { Group } from 'three';
import type { Phenotype } from '../engine/grow';
import { CreatureMesh } from './CreatureMesh';

function Turntable({ phenotype, frozen }: { phenotype: Phenotype; frozen: boolean }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (!frozen && ref.current) ref.current.rotation.y += dt * 0.4;
  });
  return (
    <group ref={ref}>
      <CreatureMesh phenotype={phenotype} />
    </group>
  );
}

export function CreatureViewer({ phenotype }: { phenotype: Phenotype }) {
  // Dev-only: freezing switches the canvas to on-demand rendering so the page can go
  // idle (the turntable's continuous loop otherwise blocks headless screenshots).
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    (window as unknown as { __cambrianFreeze?: (v?: boolean) => void }).__cambrianFreeze = (v = true) =>
      setFrozen(!!v);
  }, []);

  // Dev-only handle so a headless harness can read creature state behind the loop.
  useEffect(() => {
    const { min, max } = phenotype.bounds;
    const dims = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    (window as unknown as { __cambrian?: unknown }).__cambrian = {
      nodeCount: phenotype.nodes.length,
      edgeCount: phenotype.edges.length,
      seed: phenotype.genomeRef.seed,
      symmetry: phenotype.genomeRef.symmetry,
      dims: dims.map((d) => +d.toFixed(2)),
      maxRadius: +Math.max(...phenotype.nodes.map((n) => n.radius)).toFixed(2),
    };
  }, [phenotype]);

  return (
    <Canvas frameloop={frozen ? 'demand' : 'always'} shadows dpr={[1, 2]} camera={{ position: [4, 2.5, 5], fov: 45 }}>
      <color attach="background" args={['#0f1116']} />
      <Stage intensity={0.5} environment="city" adjustCamera={1.1} shadows="contact">
        <Turntable phenotype={phenotype} frozen={frozen} />
      </Stage>
      <OrbitControls makeDefault enablePan={false} minDistance={2} maxDistance={20} />
    </Canvas>
  );
}
