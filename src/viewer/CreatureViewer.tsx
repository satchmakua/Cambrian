/**
 * The 3D viewport: the current creature, auto-framed and lit by drei's <Stage>, with
 * an orbit camera that slowly auto-rotates (DESIGN §7). The turntable orbits the
 * *camera*, not the creature, so the creature stays fixed in world space — which keeps
 * the body material's world-space countershading/pattern stable.
 */
import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import type { Phenotype } from '../engine/grow';
import { CreatureMesh } from './CreatureMesh';
import { buildRig } from './animation';
import { buildMeshData } from './meshData';

export function CreatureViewer({ phenotype, smooth = false }: { phenotype: Phenotype; smooth?: boolean }) {
  // Dev-only: freezing stops the auto-rotate and switches to on-demand rendering so the
  // page can go idle (a continuous loop otherwise blocks headless captures).
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    (window as unknown as { __cambrianFreeze?: (v?: boolean) => void }).__cambrianFreeze = (v = true) =>
      setFrozen(!!v);
  }, []);

  // Dev-only handle so a headless harness can read creature state behind the loop.
  useEffect(() => {
    const { min, max } = phenotype.bounds;
    const dims = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const terminals: Record<string, number> = {};
    for (const n of phenotype.nodes) {
      if (n.terminal && n.terminal !== 'none') terminals[n.terminal] = (terminals[n.terminal] ?? 0) + 1;
    }
    (window as unknown as { __cambrian?: unknown }).__cambrian = {
      nodeCount: phenotype.nodes.length,
      edgeCount: phenotype.edges.length,
      seed: phenotype.genomeRef.seed,
      symmetry: phenotype.genomeRef.symmetry,
      dims: dims.map((d) => +d.toFixed(2)),
      maxRadius: +Math.max(...phenotype.nodes.map((n) => n.radius)).toFixed(2),
      terminals,
      covering: phenotype.genomeRef.covering.type,
      motion: buildRig(buildMeshData(phenotype), phenotype).style,
      skin: smooth ? 'smooth' : 'capsules',
    };
  }, [phenotype, smooth]);

  return (
    <Canvas
      frameloop={frozen ? 'demand' : 'always'}
      gl={{ preserveDrawingBuffer: import.meta.env.DEV }}
      shadows
      dpr={[1, 2]}
      camera={{ position: [4, 2.5, 5], fov: 45 }}
    >
      <color attach="background" args={['#0f1116']} />
      <Stage intensity={0.5} environment="city" adjustCamera={1.1} shadows="contact">
        <CreatureMesh phenotype={phenotype} smooth={smooth} />
      </Stage>
      <OrbitControls
        makeDefault
        autoRotate={!frozen}
        autoRotateSpeed={0.8}
        enablePan={false}
        minDistance={2}
        maxDistance={20}
      />
    </Canvas>
  );
}
