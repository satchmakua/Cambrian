/**
 * The game as a whole — starting one, saving it, loading it, leaving it.
 *
 * A game spans two stores: the breeder's lineage (`store.ts`) and the valley (`worldStore.ts`). The
 * functions here move both together, so a load or a new game is all-or-nothing: everything that can
 * fail on a damaged save (growing the creature being bred, reading the World) is done before either
 * store is touched, and what puts the two in place afterwards cannot fail.
 */
import { grow } from '../engine/grow';
import { coherence } from '../engine/morphospace';
import type { Genome } from '../engine/genome';
import { genomeOfMorphotype, randomGenome, type SymmetryMode } from '../engine/random';
import { autosave, installWorld, worldForSave, worldSummary } from '../world/worldStore';
import {
  cleanName, newSaveId, packGame, parseSave, saveFileName, serializeSave, type Ecosystem, type SavedGame, type SaveHeader, type SaveStore, type SaveSummary,
} from './saves';
import { lastGameView, saveSessionNow, useStore, type GameView } from './store';

export interface NewGameOptions {
  name: string;
  founder: Genome;
  symmetry: SymmetryMode;
  worldSeed: number;
  ecosystem: Ecosystem;
  startIn: GameView;
}

/** The creature a new game would start from: a kind's, or anything at all. */
export function founderFor(seed: number, kind: string | null, symmetry: SymmetryMode): Genome {
  return kind ? genomeOfMorphotype(seed >>> 0, kind) : randomGenome(seed >>> 0, symmetry);
}

/** Begin a fresh game: a new lineage at the founder, a new (as yet unvisited) valley, on the chosen screen. */
export function startNewGame(o: NewGameOptions): void {
  const setup = { worldSeed: o.worldSeed >>> 0, ecosystem: o.ecosystem };
  grow(o.founder); // (a founder that will not grow stops here, with nothing replaced)
  installWorld(setup, null);
  useStore.getState().newGame(o.founder, o.symmetry, { id: null, name: cleanName(o.name), setup });
  useStore.getState().setView(o.startIn);
}

/** Pick up the game the browser holds, on the screen it was left on. */
export function continueGame(): void {
  useStore.getState().setView(lastGameView());
}

/** What a list will say about the game as it stands. */
export function currentSummary(): SaveSummary {
  const s = useStore.getState();
  const cur = s.nodes[s.currentId];
  const w = worldSummary();
  return {
    generation: cur.generation,
    kind: coherence(grow(cur.genome)).nearest,
    creature: cur.genome,
    lineage: Object.keys(s.nodes).length,
    day: w?.day ?? null,
    population: w?.population ?? null,
    species: w?.species ?? null,
  };
}

/** The game as it stands, as a save (under `id`, or a new slot). */
export function captureGame(name: string, id: string | null, now: number): SavedGame {
  const s = useStore.getState();
  return packGame({
    id: id ?? newSaveId(now),
    name,
    savedAt: now,
    setup: s.game.setup,
    summary: currentSummary(),
    breeder: s.snapshot(),
    world: worldForSave(),
  });
}

/** Save the game to a slot (`id` to overwrite one; none for a new slot). The game then knows that slot
 *  as its own, so the next save offers to overwrite it. */
export async function saveGame(store: SaveStore, name: string, id: string | null, now = Date.now()): Promise<SaveHeader> {
  const g = captureGame(name, id, now);
  await store.put(g);
  useStore.getState().setGame({ id: g.id, name: g.name });
  return g;
}

/** Make a saved game the one being played. Throws (a readable error), changing nothing, if it will not load. */
export function playSave(g: SavedGame, view?: GameView): void {
  // Both halves are made ready before either is put in place: the lineage first (its creature is grown
  // and its litter bred — nothing is replaced yet), then the valley (a damaged World throws here, and
  // still nothing has been replaced), and only then the lineage, by a step that cannot fail.
  const takeLineage = useStore.getState().readyRestore(g.breeder);
  installWorld(g.setup, g.world);
  takeLineage({ id: g.id, name: g.name, setup: g.setup });
  // (the valley was written to the browser while the last game's lineage still filled it; with that
  // gone there may be room now, if there was not then)
  autosave();
  useStore.getState().setView(view ?? 'breed');
}

/** Load a slot and play it. */
export async function loadGame(store: SaveStore, id: string, view?: GameView): Promise<void> {
  const g = await store.get(id);
  if (!g) throw new Error('That save is no longer there.');
  playSave(g, view);
}

/** Read a save from a file's text into a slot of its own (never over an existing one) and return it. */
export async function importSave(store: SaveStore, text: string, now = Date.now()): Promise<SaveHeader> {
  const g = parseSave(text);
  const taken = new Set((await store.list()).map((h) => h.id));
  const fresh: SavedGame = taken.has(g.id) ? { ...g, id: newSaveId(now) } : g;
  await store.put(fresh);
  return fresh;
}

/** Write a slot out as a file the browser downloads. */
export async function exportSave(store: SaveStore, id: string): Promise<void> {
  const g = await store.get(id);
  if (!g) throw new Error('That save is no longer there.');
  const blob = new Blob([serializeSave(g)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = saveFileName(g);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Keep everything the browser holds of this game up to date (before the menu, before the page goes). */
export function keepGame(): void {
  saveSessionNow();
  autosave();
}

/** Leave the game for the main menu (it is kept, and Continue returns to it). */
export function exitToMenu(): void {
  keepGame();
  useStore.getState().setView('menu');
}

/**
 * Quit: keep the game, then close the window where the browser allows a page to (an installed app, a
 * window a script opened). A plain tab can't close itself — the caller shows a "safe to close" screen
 * when this returns false.
 */
export function quitGame(): boolean {
  keepGame();
  try {
    window.close();
  } catch {
    /* not allowed */
  }
  return typeof window !== 'undefined' && window.closed;
}
