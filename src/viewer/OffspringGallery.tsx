/**
 * The breeder gallery (DESIGN §7): a 3×3 grid of mutant offspring of the current
 * parent. Click one → it becomes the next parent. This is the feel-good core loop.
 */
import { useRef, type MutableRefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';
import { OffspringThumb } from './OffspringThumb';
import type { Genome } from '../engine/genome';

interface Props {
  offspring: Genome[];
  generation: number;
  onPick: (child: Genome) => void;
  onReroll: () => void;
}

export function OffspringGallery({ offspring, generation, onPick, onReroll }: Props) {
  const container = useRef<HTMLDivElement>(null);
  return (
    <div className="gallery-body" ref={container}>
      <div className="gallery-head">
        <span>
          Gen {generation} → {generation + 1}
        </span>
        <button className="reroll" onClick={onReroll} title="new litter from the same parent">
          ↻ new litter
        </button>
      </div>
      <p className="gallery-hint">Pick the offspring you like — it becomes the next parent.</p>
      <div className="grid">
        {/* Stable key by slot — the 9 views persist and just swap contents */}
        {offspring.map((g, i) => (
          <OffspringThumb key={i} slot={i} genome={g} onPick={() => onPick(g)} />
        ))}
      </div>
      {/* one canvas for all nine: each thumb is a View scissored into its own button */}
      <Canvas className="gallery-canvas" frameloop="demand" dpr={[1, 1.75]} eventSource={container as MutableRefObject<HTMLElement>} gl={{ antialias: true, preserveDrawingBuffer: import.meta.env.DEV }}>
        <View.Port />
      </Canvas>
    </div>
  );
}
