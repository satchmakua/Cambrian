/// <reference lib="webworker" />
/**
 * The simulation worker: the valley's one real World, stepped here, off the page's thread. The page keeps
 * a mirror of it (sim/replica.ts) and draws from that. The page sends:
 *
 *   load  { json, epoch }   the world as it holds it now — when the valley opens, and whenever the page
 *                           changed the world itself (a release, a god act, a game loaded)
 *   step  { steps, epoch }  run on this many steps
 *
 * and is answered with a frame after each, tagged with its epoch: a frame from before the page's latest
 * load is of a world the page has since changed, and the page drops it.
 */
import { loadWorld } from '../sim/persist';
import { stepWorld, type World } from '../sim/world';
import { frameOf, sentOf, type Sent } from '../sim/replica';

let W: World | null = null;
let sent: Sent | null = null;
let epoch = -1;

function answer(ep: number): void {
  const frame = frameOf(W!, sent!);
  // (the two fields go across without copying)
  (self as DedicatedWorkerGlobalScope).postMessage({ type: 'frame', epoch: ep, frame }, [frame.grass.buffer, frame.algae.buffer]);
}

self.onmessage = (e: MessageEvent<{ type: 'load'; json: string; epoch: number } | { type: 'step'; steps: number; epoch: number }>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      W = loadWorld(m.json);
      sent = sentOf(W);
      epoch = m.epoch;
      answer(m.epoch);
    } else if (m.type === 'step') {
      if (!W || m.epoch !== epoch) return; // (a run asked of a world since replaced)
      for (let i = 0; i < m.steps; i++) stepWorld(W);
      answer(m.epoch);
    }
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
