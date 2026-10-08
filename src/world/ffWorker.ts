/// <reference lib="webworker" />
/**
 * The fast-forward worker: receives a saved world and a span of sim time, runs it on at full speed
 * off the main thread (the World view stays responsive), reporting progress, and posts the result
 * back as a save. A 'stop' message ends the run early at a clean step.
 */
import { loadWorld, saveWorld } from '../sim/persist';
import { runFor } from '../sim/fastForward';

let stopping = false;

self.onmessage = (e: MessageEvent<{ type: 'run'; json: string; seconds: number } | { type: 'stop' }>) => {
  const msg = e.data;
  if (msg.type === 'stop') {
    stopping = true;
    return;
  }
  stopping = false;
  try {
    const w = loadWorld(msg.json);
    const t0 = w.time;
    // progress is posted between chunks of steps; 'stop' messages can only arrive between tasks, so
    // the run yields to the event loop every chunk
    const total = msg.seconds;
    const CHUNK = 60; // sim seconds per task
    let done = 0;
    const step = () => {
      const span = Math.min(CHUNK, total - done);
      runFor(w, span);
      done += span;
      (self as DedicatedWorkerGlobalScope).postMessage({ type: 'progress', f: done / total, time: w.time, species: w.species.filter((s) => s.alive > 0).length, pop: w.creatures.length });
      if (done < total - 1e-6 && !stopping) setTimeout(step, 0);
      else (self as DedicatedWorkerGlobalScope).postMessage({ type: 'done', json: saveWorld(w), elapsed: w.time - t0 });
    };
    step();
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
