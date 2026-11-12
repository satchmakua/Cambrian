import { describe, it, expect } from 'vitest';
import { genomeOfMorphotype } from '../../src/engine/random';
import {
  SAVE_FORMAT, SAVE_V, checkSave, cleanName, describeSave, headerOf, memoryStore, newSaveId, nextGameName, packGame, parseSave, saveFileName, serializeSave, sortSaves,
  type BreederSave, type SavedGame,
} from '../../src/ui/saves';

function lineage(): BreederSave {
  const a = genomeOfMorphotype(1, 'canid');
  const b = genomeOfMorphotype(2, 'felid');
  const c = genomeOfMorphotype(3, 'bird');
  return {
    nodes: {
      '0': { id: '0', genome: a, parentId: null, generation: 0 },
      '1': { id: '1', genome: b, parentId: '0', generation: 1 },
      '2': { id: '2', genome: c, parentId: '1', generation: 2 },
    },
    currentId: '2',
    counter: 3,
    symmetryMode: 'auto',
    menagerie: { '2:3': { genome: a, desc: [0.4, 0.3, 0.1], score: 0.8, nearest: 'canid' } },
  };
}

function game(over: Partial<SavedGame> = {}): SavedGame {
  const breeder = lineage();
  return {
    ...packGame({
      id: 'slot-a',
      name: 'My  valley ',
      savedAt: 1_700_000_000_000,
      setup: { worldSeed: 42, ecosystem: 'sparse' },
      summary: { generation: 2, kind: 'bird', creature: breeder.nodes['2'].genome, lineage: 3, day: 5, population: 43, species: 8 },
      breeder,
      world: null,
    }),
    ...over,
  };
}

describe('saved games', () => {
  it('names: trimmed and single-spaced, never empty, never longer than a list can show', () => {
    expect(cleanName('  My   valley \n')).toBe('My valley');
    expect(cleanName('   ')).toBe('Untitled game');
    expect(cleanName('x'.repeat(200)).length).toBe(48);
    expect(nextGameName([])).toBe('Game 1');
    expect(nextGameName(['Game 1', 'game 2', 'Elsewhere'])).toBe('Game 3');
    const a = newSaveId(1000);
    expect(newSaveId(1000)).not.toBe(a); // two in one millisecond stay distinct
  });

  it('a list line says what the save holds; a file name is safe and dated', () => {
    const g = game();
    expect(describeSave(g.summary)).toBe('Generation 2 bird · Day 5, 43 alive in 8 species');
    expect(describeSave({ ...g.summary, day: null, population: null, species: null })).toBe('Generation 2 bird · valley not yet visited');
    expect(saveFileName({ name: 'My valley: take #2!', savedAt: new Date(2026, 10, 11).getTime() })).toBe('cambrian-my-valley-take-2-2026-11-11.json');
    expect(saveFileName({ name: '???', savedAt: NaN })).toBe('cambrian-game-undated.json');
    const sorted = sortSaves([{ name: 'b', savedAt: 5 }, { name: 'a', savedAt: 9 }, { name: 'a', savedAt: 5 }]);
    expect(sorted.map((s) => `${s.name}${s.savedAt}`)).toEqual(['a9', 'a5', 'b5']);
  });

  it('a save written to a file reads back the same game', () => {
    const g = game();
    expect(g.name).toBe('My valley');
    const back = parseSave(serializeSave(g));
    expect(back).toEqual(g);
    expect(headerOf(back)).toEqual({ id: g.id, name: g.name, savedAt: g.savedAt, setup: g.setup, summary: g.summary });
  });

  it('what is not a save says so, and says why', () => {
    expect(() => parseSave('not json {')).toThrow(/not valid JSON/);
    expect(() => parseSave('{"hello":1}')).toThrow(/not a Cambrian saved game/);
    expect(() => parseSave(JSON.stringify({ format: 'cambrian-world', v: 1 }))).toThrow(/saved World on its own/);
    expect(() => parseSave(JSON.stringify({ ...game(), v: 99 }))).toThrow(/version 99/);
    expect(() => checkSave({ format: SAVE_FORMAT, v: SAVE_V, breeder: { nodes: {} } })).toThrow(/no lineage/);
  });

  it('a damaged lineage is refused: an unreadable creature, a missing parent, no creature being bred', () => {
    const bad = (mutate: (g: SavedGame) => void) => {
      const g = JSON.parse(serializeSave(game())) as SavedGame;
      mutate(g);
      return () => checkSave(g);
    };
    expect(bad((g) => ((g.breeder.nodes['1'].genome as unknown as { symmetry: string }).symmetry = 'spiral'))).toThrow(/creature 1/);
    expect(bad((g) => (g.breeder.nodes['2'].parentId = '7'))).toThrow(/parent that is not there/);
    expect(bad((g) => (g.breeder.currentId = '9'))).toThrow(/which creature was being bred/);
  });

  it('what can be mended is: the id counter, the set-up, a bad menagerie cell, a summary that lies', () => {
    const g = JSON.parse(serializeSave(game())) as SavedGame & { breeder: { counter: number } };
    g.breeder.counter = 1; // would hand out an id already in use
    (g.setup as unknown as { ecosystem: string }).ecosystem = 'crowded';
    (g.breeder.menagerie as unknown as Record<string, unknown>)['9:9'] = { genome: 'nope', desc: [1], score: 1, nearest: 'x' };
    g.summary.generation = 999;
    g.summary.lineage = 1;
    const fixed = checkSave(g);
    expect(fixed.breeder.counter).toBe(3);
    expect(fixed.setup).toEqual({ worldSeed: 42, ecosystem: 'standard' });
    expect(Object.keys(fixed.breeder.menagerie)).toEqual(['2:3']);
    expect(fixed.summary.generation).toBe(2);
    expect(fixed.summary.lineage).toBe(3);
    expect(fixed.summary.creature).toEqual(fixed.breeder.nodes['2'].genome);
  });

  it('a slot store keeps saves apart, lists the newest first, and hands back copies', async () => {
    const store = memoryStore();
    expect(await store.list()).toEqual([]);
    await store.put(game({ id: 'a', name: 'First', savedAt: 100 }));
    await store.put(game({ id: 'b', name: 'Second', savedAt: 300 }));
    await store.put(game({ id: 'c', name: 'Third', savedAt: 200 }));
    expect((await store.list()).map((h) => h.name)).toEqual(['Second', 'Third', 'First']);
    // overwriting a slot replaces it, in place
    await store.put(game({ id: 'a', name: 'First again', savedAt: 400 }));
    expect((await store.list()).map((h) => h.name)).toEqual(['First again', 'Second', 'Third']);
    const got = await store.get('b');
    expect(got?.name).toBe('Second');
    got!.breeder.nodes['0'].generation = 77; // (a caller's edits never reach the stored save)
    expect((await store.get('b'))!.breeder.nodes['0'].generation).toBe(0);
    await store.remove('b');
    expect(await store.get('b')).toBeNull();
    expect((await store.list()).length).toBe(2);
  });
});
