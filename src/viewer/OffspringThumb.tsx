/**
 * A single offspring in the breeder gallery: a small static render of a candidate creature. Click to
 * promote it to parent.
 *
 * Every thumbnail is a drei <View> into ONE shared canvas the gallery owns (nine canvases meant nine
 * WebGL contexts, and the browser drops contexts past ~16). Each is lit by the same procedural
 * studio environment as the hero view and wears the same hybrid skin — but the skins are built
 * staggered (slot i upgrades from the capsule kit after a short delay), so a fresh litter never stalls
 * a frame building nine surfaces at once.
 */
import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera, View } from '@react-three/drei';
import { grow } from '../engine/grow';
import { CreatureMesh } from './CreatureMesh';
import { StudioEnvironment } from './StudioEnvironment';
import { framingOf } from './Studio';
import type { Genome } from '../engine/genome';

export function OffspringThumb({ genome, slot, onPick }: { genome: Genome; slot: number; onPick: () => void }) {
  const phenotype = useMemo(() => grow(genome), [genome]);
  const framing = useMemo(() => framingOf(phenotype), [phenotype]);
  const [smooth, setSmooth] = useState(false);
  useEffect(() => {
    setSmooth(false);
    const t = setTimeout(() => setSmooth(true), 60 + slot * 90);
    return () => clearTimeout(t);
  }, [phenotype, slot]);
  const d = framing.size * 1.75;
  const c = framing.center;
  return (
    <button className="thumb" onClick={onPick} title="promote this creature">
      {/* (outside a canvas, drei's View tracks the div it renders itself — so that div must fill the thumb) */}
      <View className="thumb-view">
        <PerspectiveCamera makeDefault position={[d * 0.62, d * 0.34, d * 0.72]} fov={36} near={framing.size * 0.01} far={framing.size * 40} onUpdate={(cam) => cam.lookAt(0, 0, 0)} />
        <StudioEnvironment />
        <hemisphereLight args={['#cfe0ff', '#2a2620', 0.55]} />
        <directionalLight position={[framing.size, framing.size * 1.6, framing.size]} intensity={1.1} />
        <Redraw deps={[phenotype, smooth]} />
        <group position={[-c[0], -c[1], -c[2]]}>
          <CreatureMesh phenotype={phenotype} skinMode={smooth ? 'hybrid' : 'capsules'} quality="low" />
        </group>
      </View>
    </button>
  );
}

/** The gallery canvas renders on demand: ask for a frame whenever this thumbnail's content changes
 *  (and once more shortly after, when a freshly built skin has landed in the scene). */
function Redraw({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const t = setTimeout(() => invalidate(), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}
