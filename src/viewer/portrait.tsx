/**
 * Portraits — a small still image of a creature, for the HTML panels (the World's creature card, the
 * chronicle of a fast-forward, …) where a live 3D view would mean another canvas per panel.
 *
 * One offscreen R3F root (one WebGL context, created on first use) renders the creature exactly as
 * the breeder does — the same CreatureMesh, hybrid skin, studio light — in a three-quarter view, and
 * the frame is read back as a PNG data URL. Requests queue (one render at a time) and are cached by
 * the genome's share string, so a species' portrait is drawn once.
 */
import { createRoot, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useState } from 'react';
import type { Genome } from '../engine/genome';
import { grow, type Phenotype } from '../engine/grow';
import { encodeGenome } from '../engine/share';
import { CreatureMesh } from './CreatureMesh';
import { StudioEnvironment } from './StudioEnvironment';
import { framingOf } from './Studio';

const W = 176;
const H = 132;
const CACHE = new Map<string, Promise<string>>();
let root: ReturnType<typeof createRoot> | null = null;
let canvas: HTMLCanvasElement | null = null;
let chain: Promise<unknown> = Promise.resolve();

function Scene({ phenotype, onReady }: { phenotype: Phenotype; onReady: (draw: () => void) => void }) {
  const f = framingOf(phenotype);
  const d = f.size * 1.7;
  const c = f.center;
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    // the skin is built synchronously during render; give effects a tick to land, then draw
    const t = setTimeout(() => onReady(() => advance(performance.now())), 30);
    return () => clearTimeout(t);
  }, [onReady, advance]);
  return (
    <>
      <PerspectiveCamera
        makeDefault
        fov={34}
        aspect={W / H}
        near={f.size * 0.01}
        far={f.size * 40}
        position={[d * 0.66, d * 0.3, d * 0.7]}
        onUpdate={(cam: THREE.PerspectiveCamera) => cam.lookAt(0, 0, 0)}
      />
      <StudioEnvironment />
      <hemisphereLight args={['#cfe0ff', '#2a2620', 0.55]} />
      <directionalLight position={[f.size, f.size * 1.6, f.size]} intensity={1.15} />
      <group position={[-c[0], -c[1], -c[2]]}>
        <CreatureMesh phenotype={phenotype} skinMode="hybrid" quality="low" fur />
      </group>
    </>
  );
}

function render(phenotype: Phenotype): Promise<string> {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    root = createRoot(canvas);
    root.configure({
      gl: { preserveDrawingBuffer: true, alpha: true, antialias: true },
      size: { width: W, height: H, top: 0, left: 0 },
      dpr: 2,
      frameloop: 'never',
      camera: { fov: 34 },
    });
  }
  return new Promise<string>((resolve) => {
    const done = (draw: () => void) => {
      draw();
      resolve(canvas!.toDataURL('image/png'));
    };
    root!.render(<Scene key={Math.random()} phenotype={phenotype} onReady={done} />);
  });
}

/** A PNG data URL of this genome's creature (cached; drawn one at a time). */
export function portraitOf(genome: Genome): Promise<string> {
  const key = encodeGenome(genome);
  let p = CACHE.get(key);
  if (!p) {
    p = chain.then(() => render(grow(genome)));
    chain = p.catch(() => undefined);
    CACHE.set(key, p);
  }
  return p;
}

/** React: the portrait's data URL once drawn (null until then). */
export function usePortrait(genome: Genome | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!genome) return;
    let live = true;
    void portraitOf(genome).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [genome]);
  return url;
}
