/**
 * What the browser is left holding when a game is swapped for another and its store is full: never
 * half of one game beside half of another. (A storage that can be made to refuse writes stands in
 * for the browser's; node has none.)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const env = vi.hoisted(() => {
  const kept = new Map<string, string>();
  const state = { full: false };
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (kept.has(k) ? kept.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (state.full) throw new Error('QuotaExceededError');
      kept.set(k, String(v));
    },
    removeItem: (k: string) => void kept.delete(k),
  };
  return { kept, state };
});

import { genomeOfMorphotype } from '../../src/engine/random';
import { stepWorld } from '../../src/sim/world';
import { loadWorld } from '../../src/sim/persist';
import { keepGame, loadGame, saveGame, startNewGame } from '../../src/ui/game';
import { memoryStore } from '../../src/ui/saves';
import { useStore } from '../../src/ui/store';
import { getWorld, populate } from '../../src/world/worldStore';

const SESSION = 'cambrian.session.v2c';
const VALLEY = 'cambrian.world';
const start = (name: string, seed: number, worldSeed: number) =>
  startNewGame({ name, founder: genomeOfMorphotype(seed, 'canid'), symmetry: 'auto', worldSeed, ecosystem: 'sparse', startIn: 'breed' });
const storedGame = () => (env.kept.has(SESSION) ? (JSON.parse(env.kept.get(SESSION)!) as { game: { name: string }; nodes: Record<string, unknown> }) : null);

beforeEach(() => {
  env.state.full = false;
  env.kept.clear();
});

describe('what the browser keeps when a game is swapped', () => {
  it('a new game and a loaded one are written at once, lineage and valley both', async () => {
    const store = memoryStore();
    start('First', 1, 100);
    expect(storedGame()?.game.name).toBe('First');
    expect(env.kept.has(VALLEY)).toBe(false); // a valley nobody has opened
    populate(getWorld(), null);
    for (let i = 0; i < 40; i++) stepWorld(getWorld());
    useStore.getState().promote(useStore.getState().offspring[2]);
    const saved = await saveGame(store, 'First', null, 10);
    start('Second', 2, 200);
    expect(storedGame()?.game.name).toBe('Second');
    expect(env.kept.has(VALLEY)).toBe(false);
    await loadGame(store, saved.id);
    expect(storedGame()?.game.name).toBe('First');
    expect(Object.keys(storedGame()!.nodes).length).toBe(2);
    expect(loadWorld(env.kept.get(VALLEY)!).seed).toBe(100);
    expect(useStore.getState().unkept).toBe(false);
  });

  it('with the store full, Continue never finds the last game under the new one: nothing is better than a mixture', async () => {
    const store = memoryStore();
    start('First', 1, 100);
    populate(getWorld(), null);
    keepGame();
    expect(storedGame()?.game.name).toBe('First');
    expect(loadWorld(env.kept.get(VALLEY)!).seed).toBe(100);
    const saved = await saveGame(store, 'First', null, 10);

    env.state.full = true;
    start('Second', 2, 200);
    expect(env.kept.has(SESSION)).toBe(false); // not First's lineage…
    expect(env.kept.has(VALLEY)).toBe(false); // …nor First's valley
    expect(useStore.getState().unkept).toBe(true); // and the game knows the browser is not keeping it
    await loadGame(store, saved.id);
    expect(env.kept.has(SESSION)).toBe(false);
    expect(env.kept.has(VALLEY)).toBe(false);
    expect(useStore.getState().unkept).toBe(true);

    // room again: the next thing kept is the game being played, whole
    env.state.full = false;
    keepGame();
    useStore.getState().promote(useStore.getState().offspring[0]);
    keepGame();
    expect(storedGame()?.game.name).toBe('First');
    expect(loadWorld(env.kept.get(VALLEY)!).seed).toBe(100);
    expect(useStore.getState().unkept).toBe(false);
  });

  it('a write that fails in the middle of a game leaves the last good copy of that same game', () => {
    start('Only', 3, 300);
    useStore.getState().promote(useStore.getState().offspring[1]);
    keepGame();
    const good = env.kept.get(SESSION);
    env.state.full = true;
    useStore.getState().promote(useStore.getState().offspring[1]);
    keepGame();
    expect(env.kept.get(SESSION)).toBe(good); // an older state of this game — not gone, not another's
    expect(useStore.getState().unkept).toBe(true);
  });
});
