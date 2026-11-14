/**
 * The World store under a game being swapped: what a fast-forward in flight does when its valley is
 * replaced, and what the browser is left holding. A worker and a storage stand in for the browser's
 * (neither exists in node): the worker is a stub the test answers for; the storage can be made to
 * refuse writes, as a full one does.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const env = vi.hoisted(() => {
  const kept = new Map<string, string>();
  const state = { full: false };
  const storage = {
    getItem: (k: string) => (kept.has(k) ? kept.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (state.full) throw new Error('QuotaExceededError');
      kept.set(k, String(v));
    },
    removeItem: (k: string) => void kept.delete(k),
  };
  class FakeWorker {
    static made: FakeWorker[] = [];
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    posted: { type: string; json?: string; seconds?: number }[] = [];
    terminated = false;
    constructor() {
      FakeWorker.made.push(this);
    }
    postMessage(m: { type: string }) {
      this.posted.push(m);
    }
    terminate() {
      this.terminated = true;
    }
    /** what the real worker would send back */
    say(data: unknown) {
      this.onmessage?.({ data });
    }
  }
  (globalThis as unknown as { localStorage: unknown }).localStorage = storage;
  (globalThis as unknown as { Worker: unknown }).Worker = FakeWorker;
  return { kept, state, FakeWorker };
});

import { loadWorld, saveWorld } from '../../src/sim/persist';
import { runFor } from '../../src/sim/fastForward';
import { stepWorld } from '../../src/sim/world';
import { autosave, getWorld, installWorld, populate, useWorldUi } from '../../src/world/worldStore';

const SETUP = { worldSeed: 77, ecosystem: 'sparse' } as const;

/** A valley of seed 77 that has been lived in for a while, put in place as a game's. */
function livedIn(): string {
  installWorld(SETUP, null);
  const w = getWorld();
  populate(w, null);
  for (let i = 0; i < 120; i++) stepWorld(w);
  return saveWorld(w);
}

/** What the worker would answer after running `json` on for `seconds`. */
function ranOn(json: string, seconds: number): string {
  const w = loadWorld(json);
  runFor(w, seconds);
  return saveWorld(w);
}

beforeEach(() => {
  env.state.full = false;
  env.kept.clear();
  env.FakeWorker.made.length = 0;
});

describe('a fast-forward and the valley it set out from', () => {
  it('lands on the valley it was run from, and hands the transport back', () => {
    const before = livedIn();
    const w = getWorld();
    const t0 = w.time;
    useWorldUi.getState().fastForward(60, 'a minute');
    const worker = env.FakeWorker.made[0];
    expect(useWorldUi.getState().ff).not.toBeNull();
    expect(useWorldUi.getState().running).toBe(false);
    expect(worker.posted[0]).toMatchObject({ type: 'run', seconds: 60 });
    worker.say({ type: 'progress', f: 0.5, time: t0 + 30, pop: 12, species: 5 });
    expect(useWorldUi.getState().ff?.f).toBe(0.5);
    worker.say({ type: 'done', json: ranOn(before, 60) });
    expect(getWorld()).toBe(w); // the same valley object (the view holding it carries on)
    expect(w.time).toBeCloseTo(t0 + 60, 3);
    expect(useWorldUi.getState().ff).toBeNull();
    expect(useWorldUi.getState().running).toBe(true);
    expect(useWorldUi.getState().chronicle?.span).toBe('a minute');
    expect(worker.terminated).toBe(true);
  });

  it('is abandoned when a game is loaded over it: an earlier save of the same valley stays as saved', () => {
    const early = livedIn();
    const t = loadWorld(early).time;
    for (let i = 0; i < 100; i++) stepWorld(getWorld());
    useWorldUi.getState().fastForward(600, 'ten minutes');
    const worker = env.FakeWorker.made[0];
    // the player opens the menu and loads the earlier save (same seed) while the run is going
    installWorld(SETUP, early);
    expect(worker.terminated).toBe(true);
    expect(useWorldUi.getState().ff).toBeNull();
    expect(useWorldUi.getState().running).toBe(true);
    // a result already on its way must not land on the loaded valley
    worker.say({ type: 'done', json: ranOn(early, 600) });
    expect(getWorld().time).toBe(t);
    expect(useWorldUi.getState().chronicle).toBeNull();
    // …and the next run starts cleanly
    useWorldUi.getState().fastForward(60, 'a minute');
    expect(env.FakeWorker.made.length).toBe(2);
    expect(useWorldUi.getState().ff).not.toBeNull();
    env.FakeWorker.made[1].say({ type: 'error', message: 'stopped' });
    expect(useWorldUi.getState().ff).toBeNull();
  });

  it('is abandoned when another game is started over it: no overlay left behind, nothing thrown', () => {
    const old = livedIn();
    useWorldUi.getState().fastForward(600, 'ten minutes');
    const worker = env.FakeWorker.made[0];
    installWorld({ worldSeed: 5, ecosystem: 'standard' }, null); // a different valley altogether
    expect(useWorldUi.getState().ff).toBeNull();
    expect(() => worker.say({ type: 'done', json: ranOn(old, 600) })).not.toThrow();
    expect(getWorld().seed).toBe(5);
    expect(getWorld().creatures.length).toBe(0); // still the fresh, unvisited valley
    expect(useWorldUi.getState().ff).toBeNull();
  });

  it('a new world or an opened one from the World menu abandons it too', () => {
    const old = livedIn();
    useWorldUi.getState().setRunning(false);
    useWorldUi.getState().fastForward(600, 'ten minutes');
    useWorldUi.getState().reset(9);
    expect(env.FakeWorker.made[0].terminated).toBe(true);
    expect(useWorldUi.getState().ff).toBeNull();
    expect(useWorldUi.getState().running).toBe(false); // as it was before the run
    useWorldUi.getState().fastForward(600, 'ten minutes');
    useWorldUi.getState().open(old);
    expect(env.FakeWorker.made[1].terminated).toBe(true);
    expect(useWorldUi.getState().ff).toBeNull();
    expect(getWorld().seed).toBe(77);
    // an opened file that will not load leaves a run in progress alone
    useWorldUi.getState().fastForward(600, 'ten minutes');
    expect(() => useWorldUi.getState().open('nonsense')).toThrow();
    expect(env.FakeWorker.made[2].terminated).toBe(false);
    expect(useWorldUi.getState().ff).not.toBeNull();
    env.FakeWorker.made[2].say({ type: 'error', message: 'x' });
  });

  it('a worker that dies, or a result that will not read back, gives the valley back as it was', () => {
    livedIn();
    const t = getWorld().time;
    useWorldUi.getState().fastForward(600, 'ten minutes');
    env.FakeWorker.made[0].onerror?.();
    expect(useWorldUi.getState().ff).toBeNull();
    expect(useWorldUi.getState().running).toBe(true);
    useWorldUi.getState().fastForward(600, 'ten minutes');
    expect(() => env.FakeWorker.made[1].say({ type: 'done', json: '{"broken":' })).not.toThrow();
    expect(useWorldUi.getState().ff).toBeNull();
    expect(getWorld().time).toBe(t);
  });
});

describe('what the browser keeps of the valley', () => {
  it('a valley where everything has died is kept as it is (not brought back to life on Continue)', () => {
    livedIn();
    const w = getWorld();
    w.creatures = [];
    w.eggs = [];
    expect(w.species.length).toBeGreaterThan(0);
    autosave();
    const kept = env.kept.get('cambrian.world');
    expect(kept).toBeTruthy();
    expect(loadWorld(kept!).creatures.length).toBe(0);
    // …while a valley nobody has opened is not written at all
    installWorld({ worldSeed: 3, ecosystem: 'standard' }, null);
    autosave();
    expect(env.kept.has('cambrian.world')).toBe(false);
  });

  it('a game put in place never leaves the last game’s valley behind, even when the store is full', () => {
    const old = livedIn();
    autosave();
    expect(env.kept.get('cambrian.world')).toBe(old);
    // another game's valley is loaded while the browser's store refuses writes
    installWorld({ worldSeed: 5, ecosystem: 'standard' }, null);
    const other = getWorld();
    populate(other, null);
    const otherJson = saveWorld(other);
    installWorld(SETUP, old);
    env.state.full = true;
    installWorld({ worldSeed: 5, ecosystem: 'standard' }, otherJson);
    expect(env.kept.has('cambrian.world')).toBe(false); // not the old game's valley
    // once there is room again the next autosave writes the right one
    env.state.full = false;
    autosave();
    expect(loadWorld(env.kept.get('cambrian.world')!).seed).toBe(5);
  });
});
