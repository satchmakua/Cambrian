/**
 * Portraits — a small still image of a creature, for the HTML panels (the World's creature card, the
 * chronicle of a fast-forward, …) where a live 3D view would mean another canvas per panel.
 *
 * One offscreen R3F root (one WebGL context, created on first use) renders the creature exactly as
 * the breeder does — the same CreatureMesh, hybrid skin, studio light — in a three-quarter view, and
 * the frame is read back as a PNG data URL. Requests queue (one render at a time, an urgent one —
 * the card being looked at — first) and are cached by the genome's share string, so a species'
 * portrait is drawn once.
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
import { KeepPrograms } from './programs';
import { framingOf } from './framing';
import { LidContext } from './eyelids';

/** eyes open, no blink: a still must not catch the lids half shut */
const AWAKE = { shut: 0, blink: false };

const W = 176;
const H = 132;
let root: ReturnType<typeof createRoot> | null = null;
let canvas: HTMLCanvasElement | null = null;

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
      <KeepPrograms />
      <StudioEnvironment />
      <hemisphereLight args={['#cfe0ff', '#2a2620', 0.55]} />
      <directionalLight position={[f.size, f.size * 1.6, f.size]} intensity={1.15} />
      <group position={[-c[0], -c[1], -c[2]]}>
        <LidContext.Provider value={AWAKE}>
          <CreatureMesh phenotype={phenotype} skinMode="hybrid" quality="low" fur />
        </LidContext.Provider>
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
      // encoded off the main thread (toDataURL encodes the PNG synchronously, in the middle of
      // whatever the page is doing — a World's first seconds)
      canvas!.toBlob((b) => resolve(b ? URL.createObjectURL(b) : canvas!.toDataURL('image/png')), 'image/png');
    };
    root!.render(<Scene key={Math.random()} phenotype={phenotype} onReady={done} />);
  });
}

/** Wait for the page to be idle (a portrait never competes with a scene's first frames or a click). */
function idle(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 2500 });
    else setTimeout(resolve, 250);
  });
}

export interface RenderQueue<T> {
  /** queue a job (or, if it is queued already, find it), urgent or not; resolves when it has run */
  add(key: string, job: () => Promise<T>, urgent: boolean): Promise<T>;
}

/**
 * Jobs run one at a time: an urgent one next, ahead of any waiting (a request that comes again as
 * urgent is moved up), and each of the others only when the page is idle. (First come first served,
 * the portrait of the animal just clicked waited behind every census icon of the World: eight
 * portraits, each after an idle wait.) A job's result is kept, so asking again is free.
 */
export function createRenderQueue<T>(waitIdle: () => Promise<void>): RenderQueue<T> {
  type Job = { key: string; run: () => Promise<T>; urgent: boolean; resolve: (v: T) => void; reject: (e: unknown) => void };
  const done = new Map<string, Promise<T>>();
  const waiting: Job[] = [];
  let busy = false;
  const pump = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    while (waiting.length) {
      let i = waiting.findIndex((j) => j.urgent);
      if (i < 0) {
        await waitIdle();
        // (an urgent request may have come while it waited)
        i = Math.max(0, waiting.findIndex((j) => j.urgent));
      }
      const job = waiting.splice(i, 1)[0];
      try {
        job.resolve(await job.run());
      } catch (e) {
        job.reject(e);
      }
    }
    busy = false;
  };
  return {
    add(key, run, urgent) {
      const known = done.get(key);
      if (known) {
        if (urgent) {
          const j = waiting.find((w) => w.key === key);
          if (j) j.urgent = true;
        }
        return known;
      }
      const p = new Promise<T>((resolve, reject) => waiting.push({ key, run, urgent, resolve, reject }));
      done.set(key, p);
      void pump();
      return p;
    },
  };
}

const QUEUE = createRenderQueue<string>(idle);

/** A PNG (object/data) URL of this genome's creature (cached; drawn one at a time — an `urgent` one
 *  next, the others when the page is idle). */
export function portraitOf(genome: Genome, urgent = false): Promise<string> {
  return QUEUE.add(encodeGenome(genome), () => render(grow(genome)), urgent);
}

/** React: the portrait's data URL once drawn (null until then). `urgent` for the one being looked at
 *  (a creature's own card), not for a row of icons. */
export function usePortrait(genome: Genome | null | undefined, urgent = false): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!genome) return;
    let live = true;
    void portraitOf(genome, urgent).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [genome, urgent]);
  return url;
}
