/// <reference lib="webworker" />
/**
 * The planet baker: a planet's ground made off the page's thread (a second or two at 300 bu), for the planet
 * designer's preview and for a game about to be played on it. The page sends
 *
 *   map    { id, spec, width }   the ground for this spec (baked, or the one already baked here), drawn as a
 *                                map `width` across (planetMap.ts), with its facts
 *   ground { id, spec }          the ground's bake itself, sent across for the page to keep as its own
 *                                (planetGround.ts's adoptBake), so the page never bakes it
 *
 * and is answered in kind, or with { type: 'error', id, message }.
 */
import { makePlanetGround } from '../../sim/planetGround';
import type { PlanetSpec } from '../../sim/planetBake';
import { planetFacts, planetMap } from './planetMap';

type Ask = { type: 'map'; id: number; spec: PlanetSpec; width: number } | { type: 'ground'; id: number; spec: PlanetSpec };

const post = (m: unknown, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<Ask>) => {
  const m = e.data;
  try {
    const t0 = performance.now();
    const g = makePlanetGround(m.spec);
    const ms = performance.now() - t0;
    if (m.type === 'map') {
      const map = planetMap(g, m.width);
      post({ type: 'map', id: m.id, ms, width: Math.round(m.width), map, facts: planetFacts(g) }, [map.buffer]);
    } else {
      // (copied, not handed over: this worker keeps its own for the next map of the same planet)
      post({ type: 'ground', id: m.id, ms, bake: g.bake });
    }
  } catch (err) {
    post({ type: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};
