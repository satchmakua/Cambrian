/**
 * The page's side of the planet baker (bakeWorker.ts): a planet's map for the designer, and a planet's ground
 * made ready before a game on it is put in place — baked in the worker and kept here (adoptBake), so the
 * page's own thread never spends the second or two a bake takes.
 *
 * One worker, one job at a time. A map asked for while another is still being made replaces it: the worker
 * at work on the stale one is stopped and a fresh one started (a designer's sliders move faster than planets
 * bake). Where no worker can be made, nothing is baked here: the ground is then baked on the page when the
 * world is made, as it always could be.
 */
import { adoptBake, groundMade } from '../../sim/planetGround';
import type { Bake, PlanetSpec } from '../../sim/planetBake';
import type { PlanetFacts } from './planetMap';

export interface PlanetPreview {
  /** RGBA, `width` across and half as high */
  map: Uint8ClampedArray;
  width: number;
  facts: PlanetFacts;
  /** how long the bake took (ms; next to nothing for a planet the worker had already made) */
  ms: number;
}

type Reply = { type: 'map'; id: number; ms: number; width: number; map: Uint8ClampedArray; facts: PlanetFacts } | { type: 'ground'; id: number; ms: number; bake: Bake } | { type: 'error'; id: number; message: string };
type Job = { id: number; resolve: (r: Reply) => void; reject: (e: Error) => void };

let WORKER: Worker | null = null;
let JOB: Job | null = null;
let IDS = 0;

function worker(): Worker | null {
  if (WORKER) return WORKER;
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./bakeWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Reply>) => {
      const job = JOB;
      if (!job || e.data.id !== job.id) return;
      JOB = null;
      if (e.data.type === 'error') job.reject(new Error(e.data.message));
      else job.resolve(e.data);
    };
    w.onerror = () => {
      const job = JOB;
      stop();
      job?.reject(new Error('The planet could not be made.'));
    };
    WORKER = w;
    return w;
  } catch {
    return null;
  }
}

/** Stop the worker, and whatever it was making (the next ask starts another). */
function stop(): void {
  WORKER?.terminate();
  WORKER = null;
  JOB = null;
}

function ask(m: { type: 'map'; spec: PlanetSpec; width: number } | { type: 'ground'; spec: PlanetSpec }): Promise<Reply> {
  // (the job before, if it is not done, is given up: its answer no longer matters to anyone)
  if (JOB) {
    JOB.reject(new Error('replaced'));
    stop();
  }
  const w = worker();
  if (!w) return Promise.reject(new Error('no worker'));
  const id = ++IDS;
  return new Promise<Reply>((resolve, reject) => {
    JOB = { id, resolve, reject };
    w.postMessage({ ...m, id });
  });
}

/** A planet's map and facts, made in the worker (rejects if a later ask replaced it). */
export async function previewPlanet(spec: PlanetSpec, width: number): Promise<PlanetPreview> {
  const r = await ask({ type: 'map', spec, width });
  if (r.type !== 'map') throw new Error('The planet could not be made.');
  return { map: r.map, width: r.width, facts: r.facts, ms: r.ms };
}

/** Have the page hold this planet's ground, baked in the worker (resolves at once if it already does; on a
 *  page with no worker, or a worker that fails, it resolves all the same, and the page bakes it itself). */
export async function readyGround(spec: PlanetSpec): Promise<void> {
  if (groundMade(spec)) return;
  try {
    const r = await ask({ type: 'ground', spec });
    if (r.type === 'ground') adoptBake(r.bake);
  } catch {
    /* baked on the page, when the world is made */
  }
}

/** Whether a planet is being made in the worker now (the designer says so). */
export function baking(): boolean {
  return JOB !== null;
}
