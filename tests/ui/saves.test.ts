import { describe, it, expect } from 'vitest';
import { GENE_BOUNDS } from '../../src/engine/bounds';
import { grow } from '../../src/engine/grow';
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

  it('a lineage must be one family tree of numbered creatures: no second founder, no ring, no borrowed names', () => {
    const bad = (mutate: (g: SavedGame) => void) => {
      const g = JSON.parse(serializeSave(game())) as SavedGame;
      mutate(g);
      return () => checkSave(g);
    };
    const nodesOf = (g: SavedGame) => g.breeder.nodes as unknown as Record<string, Record<string, unknown>>;
    // a second founder — or a parent written as a number, which must not quietly become one
    expect(bad((g) => (nodesOf(g)['2'].parentId = null))).toThrow(/not one family tree/);
    expect(bad((g) => (nodesOf(g)['2'].parentId = 1))).toThrow(/parent that is not there/);
    // a ring of parents (1 → 2 → 1), which the tree could never place
    expect(bad((g) => (nodesOf(g)['1'].parentId = '2'))).toThrow(/not one family tree/);
    expect(bad((g) => (nodesOf(g)['1'].parentId = '1'))).toThrow(/not one family tree/);
    // names every object answers to are not creatures
    expect(bad((g) => (g.breeder.currentId = 'constructor'))).toThrow(/which creature was being bred/);
    expect(bad((g) => (g.breeder.currentId = '__proto__'))).toThrow(/which creature was being bred/);
    expect(bad((g) => (nodesOf(g)['2'].parentId = 'toString'))).toThrow(/parent that is not there/);
    expect(bad((g) => (nodesOf(g)['hasOwnProperty'] = { ...nodesOf(g)['2'], parentId: '0' }))).toThrow(/unreadable/);
    const proto = JSON.parse(serializeSave(game()).replace('"nodes":{', '"nodes":{"__proto__":{"genome":1},')) as SavedGame;
    expect(() => checkSave(proto)).toThrow(/unreadable/);
    // a counter no id could be made from is put right, not kept
    const g = JSON.parse(serializeSave(game())) as SavedGame;
    (g.breeder as unknown as { counter: number }).counter = 1e300;
    expect(checkSave(g).breeder.counter).toBe(3);
    // …and a long, branching lineage is still read (the check is not quadratic, and does not recurse)
    const big = JSON.parse(serializeSave(game())) as SavedGame;
    const base = nodesOf(big)['2'];
    for (let i = 3; i < 20000; i++) nodesOf(big)[String(i)] = { ...base, id: String(i), parentId: String(i % 7 === 0 ? i - 3 : i - 1), generation: i };
    const t0 = Date.now();
    expect(Object.keys(checkSave(big).breeder.nodes).length).toBe(20000);
    expect(Date.now() - t0).toBeLessThan(4000);
  });

  it('numbers no creature could have are brought back inside the genes’ bounds, so the save still grows', () => {
    const g = JSON.parse(serializeSave(game())) as SavedGame;
    const body = g.breeder.nodes['2'].genome.body as unknown as { repeat: number; taper: number; size: number[]; appendages: { segments: number; length: number }[] };
    body.repeat = -5; // (the grower read a spine of minus five links and threw)
    body.taper = 1e300; // (…and this filled the skeleton with infinities)
    body.size = [1e9, -3, 0];
    body.appendages[0].segments = 1e7;
    body.appendages[0].length = -1;
    (g.breeder.nodes['2'].genome as unknown as { radialCount: number }).radialCount = 1e12; // (…and this never came back)
    const fixed = checkSave(g);
    const got = fixed.breeder.nodes['2'].genome;
    expect(got.radialCount).toBe(GENE_BOUNDS.radialCount[1]);
    expect(got.body.repeat).toBe(GENE_BOUNDS.segment.repeat[0]);
    expect(got.body.taper).toBe(GENE_BOUNDS.segment.taper[1]);
    expect(got.body.size).toEqual([GENE_BOUNDS.segment.size[1], GENE_BOUNDS.segment.size[0], GENE_BOUNDS.segment.size[0]]);
    expect(got.body.appendages[0].segments).toBe(GENE_BOUNDS.appendage.segments[1]);
    expect(got.body.appendages[0].length).toBe(GENE_BOUNDS.appendage.length[0]);
    for (const symmetry of ['bilateral', 'radial'] as const) {
      const t0 = Date.now();
      const p = grow({ ...got, symmetry });
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(p.nodes.length).toBeGreaterThan(0);
      expect(p.nodes.every((n) => n.pos.every(Number.isFinite) && Number.isFinite(n.radius))).toBe(true);
    }
    // the summary's creature (drawn in every list of saves) is the mended one
    expect(fixed.summary.creature).toEqual(got);
    // a chain of segments deeper than any body is refused rather than read to the bottom
    const deep = JSON.parse(serializeSave(game())) as SavedGame;
    let seg = deep.breeder.nodes['0'].genome.body as unknown as Record<string, unknown>;
    for (let i = 0; i < 5000; i++) {
      const next: Record<string, unknown> = { size: [1, 1, 1], repeat: 1, taper: 1, curve: [0, 0], appendages: [] };
      seg.child = next;
      seg = next;
    }
    expect(() => checkSave(deep)).toThrow(/creature 0/);
  });

  it('what can be mended is: the id counter, the set-up, a bad menagerie cell, a summary that lies', () => {
    const g = JSON.parse(serializeSave(game())) as SavedGame & { breeder: { counter: number } };
    g.breeder.counter = 1; // would hand out an id already in use
    (g.setup as unknown as { ecosystem: string }).ecosystem = 'crowded';
    (g.breeder.menagerie as unknown as Record<string, unknown>)['9:9'] = { genome: 'nope', desc: [1], score: 1, nearest: 'x' };
    // (a cell under a name that is no cell is left out too, however well-formed what it holds)
    (g.breeder.menagerie as unknown as Record<string, unknown>)['constructor'] = g.breeder.menagerie['2:3'];
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

  it('a lineage whose numbering has run away is put right: whatever is bred after loading it can be saved and opened again', () => {
    // (an id may have 15 digits, and the counter was believed up to 2^53: a file counting from 1e15
    // loaded cleanly, and every creature bred from then on had a 16-digit id this check refuses —
    // saves that were written, listed, and never opened again)
    /** breed one more creature, save, and read the save back — as the game would */
    const playOn = (b: BreederSave): BreederSave => {
      const id = String(b.counter);
      const next: BreederSave = { ...b, nodes: { ...b.nodes, [id]: { id, genome: b.nodes[b.currentId].genome, parentId: b.currentId, generation: b.nodes[b.currentId].generation + 1 } }, currentId: id, counter: b.counter + 1 };
      return parseSave(serializeSave(game({ breeder: next }))).breeder;
    };

    // a counter far past anything the breeder reaches is not believed
    for (const counter of [1e15, 2 ** 53 - 1, 1e9 + 1]) {
      const g = JSON.parse(serializeSave(game())) as SavedGame;
      g.breeder.counter = counter;
      const read = checkSave(g).breeder;
      expect(read.counter, `counter ${counter}`).toBe(3);
      const on = playOn(read);
      expect(on.currentId).toBe('3');
      expect(Object.keys(on.nodes).sort()).toEqual(['0', '1', '2', '3']);
    }
    // (one the breeder could have reached is)
    const far = JSON.parse(serializeSave(game())) as SavedGame;
    far.breeder.counter = 5000;
    expect(checkSave(far).breeder.counter).toBe(5000);

    // ids up at the edge of what an id may be: the same family tree, numbered from 0 again
    const g = JSON.parse(serializeSave(game())) as SavedGame;
    const b = lineage();
    const big = { '0': '7', '1': '999999999999998', '2': '999999999999999' } as Record<string, string>;
    g.breeder.nodes = Object.fromEntries(Object.values(b.nodes).map((n) => [big[n.id], { ...n, id: big[n.id], parentId: n.parentId === null ? null : big[n.parentId] }]));
    g.breeder.currentId = big['2'];
    g.breeder.counter = 1e15;
    const read = checkSave(g).breeder;
    expect(Object.keys(read.nodes).sort()).toEqual(['0', '1', '2']);
    expect(read.counter).toBe(3);
    expect(read.currentId).toBe('2');
    for (const id of ['0', '1', '2']) {
      expect(read.nodes[id].id).toBe(id);
      expect(read.nodes[id].genome).toEqual(b.nodes[id].genome);
      expect(read.nodes[id].parentId).toBe(b.nodes[id].parentId);
      expect(read.nodes[id].generation).toBe(b.nodes[id].generation);
    }
    // …and it can be played on from, and that game opened, for as long as anyone breeds
    let on = read;
    for (let i = 0; i < 5; i++) on = playOn(on);
    expect(on.counter).toBe(8);
    expect(on.currentId).toBe('7');
    expect(on.nodes['7'].generation).toBe(7);
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
