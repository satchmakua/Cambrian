/**
 * The breeder gallery (DESIGN §7): a 3×3 grid of mutant offspring of the current
 * parent. Click one → it becomes the next parent. This is the feel-good core loop.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OffspringThumb } from './OffspringThumb';
import { KeepPrograms } from './programs';
import type { Genome } from '../engine/genome';
import { dprOf, useQuality } from '../ui/settings';

interface Props {
  offspring: Genome[];
  generation: number;
  onPick: (child: Genome) => void;
  onReroll: () => void;
}

export function OffspringGallery({ offspring, generation, onPick, onReroll }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const quality = useQuality();
  // the nine buttons; each thumbnail's scene draws itself into its button's rectangle of the canvas
  const slots = useRef<(HTMLElement | null)[]>([]);
  return (
    <div className="gallery-body" ref={body}>
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
        {/* Stable key by slot — the 9 buttons and their scenes persist and just swap contents */}
        {offspring.map((g, i) => (
          <button
            key={i}
            ref={(el) => {
              slots.current[i] = el;
            }}
            className="thumb"
            data-seed={g.seed}
            onClick={() => onPick(g)}
            title="promote this creature"
          />
        ))}
      </div>
      {/* one canvas for all nine, laid over the gallery (clicks pass through to the buttons) */}
      {/* (inline: the canvas wrapper's own inline pointer-events would beat the stylesheet) */}
      {/* (the drawing buffer is kept between frames: each thumbnail redraws only when it changes) */}
      <Canvas className="gallery-canvas" style={{ pointerEvents: 'none' }} frameloop="demand" dpr={dprOf(quality, 1.75)} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <KeepPrograms />
        <Relayout target={body} />
        {offspring.map((g, i) => (
          <OffspringThumb key={i} slot={i} genome={g} track={slots} />
        ))}
      </Canvas>
    </div>
  );
}

/** Redraw when the gallery's layout changes (a resize, a wrapping hint line): the thumbnails' rectangles
 *  move inside the canvas, and an on-demand canvas would otherwise keep the old frame. */
function Relayout({ target }: { target: RefObject<HTMLElement> }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const el = target.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => invalidate());
    ro.observe(el);
    return () => ro.disconnect();
  }, [target, invalidate]);
  return null;
}
