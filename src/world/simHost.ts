/**
 * Who steps the valley: a worker (world/simWorker.ts), with the page drawing from a mirror of its world
 * (sim/replica.ts) — or, where a worker cannot run, the page itself, as it always did.
 *
 * The page's world is a full World either way. With a worker it is the mirror, brought up to date by each
 * frame; when the page changes it itself (a release, a god act, a game loaded) it says so (`invalidate`):
 * frames already on their way are of a world it has since changed, and are dropped, and the worker is given
 * the page's world to go on from. Nothing is ever stepped in both places at once.
 */
import { STEP, stepWorld, type World } from '../sim/world';
import type { Genome } from '../engine/genome';
import { saveWorld } from '../sim/persist';
import { applyFrame, genomeTable, type Frame } from '../sim/replica';

export interface SimHost {
  /** run the world on by `seconds` of sim time (as much of it as this frame allows: a backlog past
   *  `maxSteps` is dropped, as a slow machine's is) */
  advance(seconds: number, maxSteps: number): void;
  /** the page changed its world, or put another in its place: the host goes on from it */
  invalidate(): void;
  /** where the steps are taken */
  readonly where: 'worker' | 'page';
  /** what it has cost the page: frames taken in, and the time spent taking them in (ms) */
  readonly cost: { frames: number; ms: number; steps: number };
  /** how fast the world runs flat out, lately (sim seconds a real second; null: not measured yet) */
  rate(): number | null;
  dispose(): void;
}

/** What a step costs lately: the last WINDOW steps' time (ms), the first WARM steps left out (a world just
 *  loaded steps slowly while its caches fill and its code warms up). */
const WINDOW = 2400;
const WARM = 400;
function stepClock() {
  const runs: { ms: number; steps: number }[] = [];
  let seen = 0, ms = 0, steps = 0;
  return {
    add(t: number, n: number) {
      if (n <= 0) return;
      seen += n;
      if (seen <= WARM) return;
      runs.push({ ms: t, steps: n });
      ms += t;
      steps += n;
      while (steps - runs[0].steps >= WINDOW) {
        const r = runs.shift()!;
        ms -= r.ms;
        steps -= r.steps;
      }
    },
    rate: () => (steps >= 200 && ms > 0 ? (steps * STEP * 1000) / ms : null),
  };
}

/** The page steps its own world. */
export function pageHost(world: () => World): SimHost {
  let acc = 0;
  const cost = { frames: 0, ms: 0, steps: 0 };
  const clock = stepClock();
  return {
    where: 'page',
    cost,
    rate: clock.rate,
    advance(seconds, maxSteps) {
      acc += seconds;
      let n = 0;
      const t0 = performance.now();
      while (acc >= STEP && n < maxSteps) {
        stepWorld(world());
        acc -= STEP;
        n++;
      }
      cost.ms += performance.now() - t0;
      cost.steps += n;
      clock.add(performance.now() - t0, n);
      if (n === maxSteps) acc = 0; // falling behind: drop the backlog
    },
    invalidate() {},
    dispose() {},
  };
}

/** A worker steps the world; the page's is its mirror. `onFrame` is called after each frame is taken in.
 *  Null where no worker can be made; a worker that fails hands the stepping back to the page. */
export function workerHost(world: () => World, onFrame: () => void): SimHost | null {
  if (typeof Worker === 'undefined') return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  let epoch = 0;
  let table: Genome[] = [];
  let waiting = false; // a load or a run is out, and its frame not yet back
  let stale = true; // the worker does not hold the page's world (it is sent at the next advance)
  let acc = 0;
  let failed: SimHost | null = null;
  const cost = { frames: 0, ms: 0, steps: 0 };
  // (how long the worker's own steps take: the steps of the run out, and what it said they took)
  const clock = stepClock();
  let out = 0;
  const fail = () => {
    if (failed) return;
    worker.terminate();
    failed = pageHost(world);
  };
  worker.onmessage = (e: MessageEvent<{ type: 'frame'; epoch: number; frame: Frame; ms?: number } | { type: 'error'; message: string }>) => {
    const m = e.data;
    if (m.type === 'error') return fail();
    if (failed || m.epoch !== epoch) return; // (of a world the page has since changed)
    clock.add(m.ms ?? 0, out);
    out = 0;
    waiting = false;
    const t0 = performance.now();
    try {
      applyFrame(world(), m.frame, table);
    } catch {
      return fail();
    }
    cost.ms += performance.now() - t0;
    cost.frames++;
    onFrame();
  };
  worker.onerror = fail;
  const load = () => {
    const w = world();
    table = genomeTable(w);
    worker.postMessage({ type: 'load', json: saveWorld(w), epoch });
    waiting = true;
    stale = false;
    acc = 0;
  };
  return {
    get where() {
      return failed ? ('page' as const) : ('worker' as const);
    },
    cost,
    rate: () => (failed ? failed.rate() : clock.rate()),
    advance(seconds, maxSteps) {
      if (failed) return failed.advance(seconds, maxSteps);
      if (stale) load();
      acc += seconds;
      if (waiting) return; // (one run out at a time: what accrues meanwhile goes in the next)
      const steps = Math.min(Math.floor(acc / STEP), maxSteps);
      if (steps <= 0) return;
      acc = steps === maxSteps ? 0 : acc - steps * STEP;
      worker.postMessage({ type: 'step', steps, epoch });
      cost.steps += steps;
      out = steps;
      waiting = true;
    },
    invalidate() {
      if (failed) return;
      // (at once: a frame already on its way must not undo the change; the world is sent at the next
      // advance, once, however many changes the page made meanwhile)
      epoch++;
      waiting = false;
      stale = true;
    },
    dispose() {
      worker.terminate();
    },
  };
}
