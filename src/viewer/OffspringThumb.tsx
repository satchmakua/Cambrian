/**
 * A single offspring in the breeder gallery: a small, static (non-animated) render of
 * a candidate creature, auto-framed by drei <Bounds>. Click to promote it to parent.
 * `frameloop="demand"` keeps these from each running their own animation loop.
 */
import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds } from '@react-three/drei';
import { grow } from '../engine/grow';
import { CreatureMesh } from './CreatureMesh';
import type { Genome } from '../engine/genome';

export function OffspringThumb({ genome, onPick }: { genome: Genome; onPick: () => void }) {
  const phenotype = useMemo(() => grow(genome), [genome]);
  return (
    <button className="thumb" onClick={onPick} title="promote this creature">
      <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [3, 2.2, 4], fov: 42 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 5]} intensity={1.1} />
        <Bounds fit clip observe margin={1.05}>
          {/* static base pose — animating here makes Bounds chase a moving target */}
          <CreatureMesh phenotype={phenotype} animate={false} />
        </Bounds>
      </Canvas>
    </button>
  );
}
