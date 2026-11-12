import { describe, it, expect } from 'vitest';
import { genomeOfMorphotype } from '../../src/engine/random';
import { stepWorld } from '../../src/sim/world';
import { captureGame, founderFor, importSave, loadGame, playSave, saveGame, startNewGame } from '../../src/ui/game';
import { memoryStore, serializeSave } from '../../src/ui/saves';
import { useStore } from '../../src/ui/store';
import { getWorld, populate, starterCast, worldForSave, worldSetup, worldSummary } from '../../src/world/worldStore';

const fresh = (name = 'Test game', seed = 7) =>
  startNewGame({ name, founder: genomeOfMorphotype(seed, 'felid'), symmetry: 'auto', worldSeed: 1234, ecosystem: 'sparse', startIn: 'breed' });

describe('a game, start to finish', () => {
  it('a new game: a lineage of one at the founder, a valley of its seed not yet opened, on the chosen screen', () => {
    fresh('  My   game ');
    const s = useStore.getState();
    expect(s.view).toBe('breed');
    expect(s.hasGame).toBe(true);
    expect(s.game).toEqual({ id: null, name: 'My game', setup: { worldSeed: 1234, ecosystem: 'sparse' } });
    expect(Object.keys(s.nodes)).toEqual(['0']);
    expect(s.nodes['0'].genome).toEqual(genomeOfMorphotype(7, 'felid'));
    expect(s.offspring.length).toBe(9);
    expect(getWorld().seed).toBe(1234);
    expect(worldSetup()).toEqual({ worldSeed: 1234, ecosystem: 'sparse' });
    expect(worldForSave()).toBeNull(); // nothing to keep of a valley nobody has seen
    expect(worldSummary()).toBeNull();
    // the founder a set-up screen previews is the one the game starts from
    expect(founderFor(7, 'felid', 'auto')).toEqual(genomeOfMorphotype(7, 'felid'));
  });

  it('the cast follows the set-up: sparse is the same kinds, half as many; empty is nobody', () => {
    const std = starterCast('standard');
    const sparse = starterCast('sparse');
    expect(sparse.map(([k]) => k)).toEqual(std.map(([k]) => k));
    sparse.forEach(([, n], i) => {
      expect(n).toBeLessThanOrEqual(std[i][1]);
      expect(n).toBeGreaterThanOrEqual(2);
    });
    expect(sparse.reduce((t, [, n]) => t + n, 0)).toBeLessThan(0.7 * std.reduce((t, [, n]) => t + n, 0));
    expect(starterCast('empty')).toEqual([]);
  });

  it('save, play on, load: the lineage, the creature being bred and the valley all come back', async () => {
    const store = memoryStore();
    fresh();
    // breed two generations, open the valley and let a little time pass
    useStore.getState().promote(useStore.getState().offspring[3]);
    useStore.getState().promote(useStore.getState().offspring[5]);
    const w = getWorld();
    populate(w, useStore.getState().nodes[useStore.getState().currentId].genome);
    for (let i = 0; i < 200; i++) stepWorld(w);
    const saved = await saveGame(store, 'Checkpoint', null, 5000);
    expect(saved.summary.generation).toBe(2);
    expect(saved.summary.lineage).toBe(3);
    expect(saved.summary.day).toBe(1);
    expect(saved.summary.population).toBeGreaterThan(10);
    expect(useStore.getState().game).toMatchObject({ id: saved.id, name: 'Checkpoint' }); // the game knows its slot
    const at = { time: w.time, creatures: w.creatures.length, currentId: useStore.getState().currentId, seed: useStore.getState().nodes[useStore.getState().currentId].genome.seed };

    // play on: another generation, more time — then a different game altogether
    useStore.getState().promote(useStore.getState().offspring[0]);
    for (let i = 0; i < 300; i++) stepWorld(getWorld());
    fresh('Another', 99);
    expect(Object.keys(useStore.getState().nodes).length).toBe(1);

    await loadGame(store, saved.id);
    const s = useStore.getState();
    expect(Object.keys(s.nodes).length).toBe(3);
    expect(s.currentId).toBe(at.currentId);
    expect(s.nodes[s.currentId].genome.seed).toBe(at.seed);
    expect(s.game).toEqual({ id: saved.id, name: 'Checkpoint', setup: { worldSeed: 1234, ecosystem: 'sparse' } });
    expect(getWorld().time).toBe(at.time);
    expect(getWorld().creatures.length).toBe(at.creatures);
    // saving again under the same slot overwrites it
    await saveGame(store, 'Checkpoint', saved.id, 9000);
    expect((await store.list()).map((h) => [h.id, h.savedAt])).toEqual([[saved.id, 9000]]);
  });

  it('a save that will not load changes nothing', async () => {
    const store = memoryStore();
    fresh('Keep me', 5);
    useStore.getState().promote(useStore.getState().offspring[1]);
    const before = { nodes: Object.keys(useStore.getState().nodes).length, game: useStore.getState().game, seed: getWorld().seed };
    const g = captureGame('Broken', 'bad', 1);
    await expect(Promise.resolve().then(() => playSave({ ...g, world: '{"format":"cambrian-world","v":999}' }))).rejects.toThrow(/version 999/);
    await expect(loadGame(store, 'nowhere')).rejects.toThrow(/no longer there/);
    expect(Object.keys(useStore.getState().nodes).length).toBe(before.nodes);
    expect(useStore.getState().game).toEqual(before.game);
    expect(getWorld().seed).toBe(before.seed);
  });

  it('a save file comes in as a slot of its own, never over one already there', async () => {
    const store = memoryStore();
    fresh('Exported', 3);
    const first = await saveGame(store, 'Exported', null, 100);
    const text = serializeSave((await store.get(first.id))!);
    const again = await importSave(store, text, 200);
    expect(again.id).not.toBe(first.id);
    expect((await store.list()).length).toBe(2);
    await expect(importSave(store, '{"format":"cambrian-world"}')).rejects.toThrow(/saved World on its own/);
  });
});

describe('the valley put in place by a game', () => {
  it('each new game and each load is a new epoch (the World screen starts afresh on it)', async () => {
    const { useWorldUi } = await import('../../src/world/worldStore');
    const store = memoryStore();
    fresh('Epochs', 11);
    const e0 = useWorldUi.getState().epoch;
    const saved = await saveGame(store, 'Epochs', null, 1);
    expect(useWorldUi.getState().epoch).toBe(e0); // saving changes nothing
    await loadGame(store, saved.id);
    expect(useWorldUi.getState().epoch).toBe(e0 + 1);
    fresh('Epochs 2', 12);
    expect(useWorldUi.getState().epoch).toBe(e0 + 2);
    // a load that fails leaves the epoch (and the valley) alone
    await expect(Promise.resolve().then(() => playSave({ ...captureGame('x', 'y', 2), world: 'nonsense' }))).rejects.toThrow();
    expect(useWorldUi.getState().epoch).toBe(e0 + 2);
  });
});
