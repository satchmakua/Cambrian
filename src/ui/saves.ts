/**
 * Saved games.
 *
 * A game is the two things a player builds: the breeder's lineage (every creature kept, the one on
 * the turntable, the menagerie) and the valley it was released into (the World, or just its set-up
 * if it was never opened). A save is both, under a name, with a small SUMMARY so a list of saves can
 * be drawn without opening any of them.
 *
 * Saves live in the browser's IndexedDB (a lineage runs to megabytes; localStorage holds five), as
 * a HEADER (name, date, summary) and a BODY per slot, so listing never reads a body. A save can also
 * be written to a file and read back from one. Whatever is read — from the database or from a file
 * someone edited — is checked field by field before it is used: a save that will not load says why
 * and changes nothing.
 *
 * The file format, the checking and the slot stores are plain functions over plain data (no React,
 * no three.js): tested headlessly, against an in-memory store.
 */
import { checkGenome } from '../engine/share';
import type { Genome } from '../engine/genome';
import type { LineageNodes } from '../engine/lineage';
import type { SymmetryMode } from '../engine/random';
import type { Menagerie } from '../viewer/archive';

export const SAVE_FORMAT = 'cambrian-save';
export const SAVE_V = 1;
export const NAME_MAX = 48;

/** What the valley starts with: the standard cast, half of it, or nothing but what the player releases. */
export type Ecosystem = 'standard' | 'sparse' | 'empty';
export const ECOSYSTEMS: readonly Ecosystem[] = ['standard', 'sparse', 'empty'];

export interface GameSetup {
  worldSeed: number;
  ecosystem: Ecosystem;
}

export const DEFAULT_SETUP: GameSetup = { worldSeed: 1, ecosystem: 'standard' };

/** The breeder's side of a game (what its store keeps between visits). */
export interface BreederSave {
  nodes: LineageNodes;
  currentId: string;
  counter: number;
  symmetryMode: SymmetryMode;
  menagerie: Menagerie;
}

/** Enough to describe a save in a list — and to draw its creature. */
export interface SaveSummary {
  /** the creature on the turntable: its generation, its nearest kind, and its genome (for a portrait) */
  generation: number;
  kind: string;
  creature: Genome;
  /** how many creatures the lineage holds */
  lineage: number;
  /** the valley: null where it was never opened */
  day: number | null;
  population: number | null;
  species: number | null;
}

export interface SaveHeader {
  id: string;
  name: string;
  savedAt: number; // ms since the epoch
  setup: GameSetup;
  summary: SaveSummary;
}

export interface SavedGame extends SaveHeader {
  format: typeof SAVE_FORMAT;
  v: number;
  breeder: BreederSave;
  /** the World as `saveWorld` writes it, or null where the valley was never opened */
  world: string | null;
}

// --- names, ids, words ---------------------------------------------------------------------------

/** A save's name as typed: trimmed, single-spaced, never empty, never longer than the list can show. */
export function cleanName(raw: string, fallback = 'Untitled game'): string {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  return s || fallback;
}

/** A new slot id: the time it was made and a serial (two saves in one millisecond stay distinct). */
let SERIAL = 0;
export function newSaveId(now: number): string {
  SERIAL = (SERIAL + 1) % 1296;
  return `s${Math.floor(now).toString(36)}${SERIAL.toString(36).padStart(2, '0')}`;
}

/** "Game 3" — the first such name the list doesn't already hold. */
export function nextGameName(taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  for (let i = 1; ; i++) {
    const name = `Game ${i}`;
    if (!used.has(name.toLowerCase())) return name;
  }
}

/** One line for a list: "Generation 12 canid · Day 5, 43 alive in 8 species". */
export function describeSave(s: SaveSummary): string {
  const breed = `Generation ${s.generation} ${s.kind}`;
  if (s.day === null) return `${breed} · valley not yet visited`;
  return `${breed} · Day ${s.day}, ${s.population ?? 0} alive in ${s.species ?? 0} species`;
}

/** A file name for an exported save: its name made safe, and the day it was saved. */
export function saveFileName(h: Pick<SaveHeader, 'name' | 'savedAt'>): string {
  const slug = h.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
  const d = new Date(h.savedAt);
  const day = Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : 'undated';
  return `cambrian-${slug}-${day}.json`;
}

/** Newest first; ties by name, so the order never flickers. */
export function sortSaves<T extends Pick<SaveHeader, 'savedAt' | 'name'>>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.savedAt - a.savedAt || a.name.localeCompare(b.name));
}

// --- writing and reading a save ------------------------------------------------------------------

export function packGame(args: { id: string; name: string; savedAt: number; setup: GameSetup; summary: SaveSummary; breeder: BreederSave; world: string | null }): SavedGame {
  return {
    format: SAVE_FORMAT,
    v: SAVE_V,
    id: args.id,
    name: cleanName(args.name),
    savedAt: args.savedAt,
    setup: args.setup,
    summary: args.summary,
    breeder: args.breeder,
    world: args.world,
  };
}

export function headerOf(g: SavedGame): SaveHeader {
  return { id: g.id, name: g.name, savedAt: g.savedAt, setup: g.setup, summary: g.summary };
}

export function serializeSave(g: SavedGame): string {
  return JSON.stringify(g);
}

class SaveError extends Error {}
const fail = (why: string): never => {
  throw new SaveError(why);
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function checkSetup(v: unknown): GameSetup {
  if (!isObj(v)) return { ...DEFAULT_SETUP };
  return {
    worldSeed: finite(v.worldSeed) ? Math.floor(Math.abs(v.worldSeed)) >>> 0 : DEFAULT_SETUP.worldSeed,
    ecosystem: ECOSYSTEMS.includes(v.ecosystem as Ecosystem) ? (v.ecosystem as Ecosystem) : DEFAULT_SETUP.ecosystem,
  };
}

/** A lineage id is the breeder's counter ("0", "1", …): nothing else is one — so a name like
 *  "constructor" or "__proto__" can never be looked up in the node map as if it were a creature. */
const NODE_ID = /^\d{1,15}$/;
/** A menagerie cell is "column:row". */
const CELL_KEY = /^\d{1,2}:\d{1,2}$/;
const GENERATION_MAX = 1e9;
/** The highest number a lineage read from a file may be counting from. No game the breeder makes
 *  comes within a millionth of it; a file past it has had its numbering tampered with or damaged. */
const COUNTER_MAX = 1e9;

/** The same family tree numbered from 0, in the order its creatures were made (their ids' order). */
function renumbered(nodes: LineageNodes, currentId: string): { nodes: LineageNodes; currentId: string } {
  const order = Object.keys(nodes).sort((a, b) => Number(a) - Number(b) || (a < b ? -1 : 1));
  const to = new Map(order.map((id, i) => [id, String(i)]));
  const out: LineageNodes = {};
  for (const id of order) {
    const n = nodes[id];
    const mine = to.get(id)!;
    out[mine] = { ...n, id: mine, parentId: n.parentId === null ? null : to.get(n.parentId)! };
  }
  return { nodes: out, currentId: to.get(currentId)! };
}

function checkBreeder(v: unknown): BreederSave {
  if (!isObj(v) || !isObj(v.nodes)) return fail('This save has no lineage in it.');
  const nodes: LineageNodes = {};
  let top = -1;
  for (const [id, raw] of Object.entries(v.nodes)) {
    if (!NODE_ID.test(id) || !isObj(raw)) return fail('This save is damaged (a creature in its lineage is unreadable).');
    let genome: Genome;
    try {
      genome = checkGenome(raw.genome);
    } catch (e) {
      return fail(`This save is damaged (creature ${id}: ${e instanceof Error ? e.message : 'unreadable'}).`);
    }
    // (a parent is another creature's id or nothing at all: anything else — a number, say — is damage,
    // not a second founder)
    const parent = raw.parentId ?? null;
    if (parent !== null && !(typeof parent === 'string' && NODE_ID.test(parent))) return fail('This save is damaged (a creature points at a parent that is not there).');
    nodes[id] = { id, genome, parentId: parent, generation: finite(raw.generation) ? Math.min(GENERATION_MAX, Math.max(0, Math.floor(raw.generation))) : 0 };
    top = Math.max(top, Number(id));
  }
  const ids = Object.keys(nodes);
  if (ids.length === 0) return fail('This save has no lineage in it.');
  for (const n of Object.values(nodes)) {
    if (n.parentId !== null && !nodes[n.parentId]) return fail('This save is damaged (a creature points at a parent that is not there).');
  }
  // One family tree: a single founder, and every creature descended from it. (The breeder draws the
  // tree from its founder; a second founder or a ring of parents would be creatures it cannot place.)
  const founders = ids.filter((id) => nodes[id].parentId === null);
  if (founders.length !== 1) return fail('This save is damaged (its lineage is not one family tree).');
  const placed = new Set<string>(founders);
  for (const id of ids) {
    const trail = new Set<string>();
    let cur: string | null = id;
    while (cur !== null && !placed.has(cur)) {
      if (trail.has(cur)) return fail('This save is damaged (its lineage is not one family tree).');
      trail.add(cur);
      cur = nodes[cur].parentId;
    }
    trail.forEach((t) => placed.add(t));
  }
  if (typeof v.currentId !== 'string' || !NODE_ID.test(v.currentId) || !nodes[v.currentId]) return fail('This save is damaged (it does not say which creature was being bred).');
  const mode = v.symmetryMode === 'bilateral' || v.symmetryMode === 'radial' ? v.symmetryMode : 'auto';
  // the menagerie is a collection, not the game: a cell that will not read is left out, not fatal
  const menagerie: Menagerie = {};
  if (isObj(v.menagerie)) {
    for (const [key, raw] of Object.entries(v.menagerie)) {
      if (!CELL_KEY.test(key) || !isObj(raw) || !Array.isArray(raw.desc) || raw.desc.length > 32 || !raw.desc.every(finite)) continue;
      try {
        menagerie[key] = { genome: checkGenome(raw.genome), desc: raw.desc as number[], score: finite(raw.score) ? raw.score : 0, nearest: typeof raw.nearest === 'string' ? raw.nearest.slice(0, 24) : '' };
      } catch {
        /* skip the cell */
      }
    }
  }
  // The next id must clear every id in use, whatever the file claims. And it must stay a number ids
  // can go on being minted from: an id may have 15 digits, so a lineage counting from up near that —
  // by its counter or by an id — was one whose every creature bred after loading would be refused by
  // this very check: the save written, listed, and never to open again. A counter that has run away
  // is ignored; ids that have are renumbered from 0 (any ceiling on them would only move that edge).
  const claimed = Number.isSafeInteger(v.counter) && (v.counter as number) >= 0 && (v.counter as number) <= COUNTER_MAX ? (v.counter as number) : 0;
  if (top + 1 > COUNTER_MAX) {
    const tidy = renumbered(nodes, v.currentId);
    return { nodes: tidy.nodes, currentId: tidy.currentId, counter: ids.length, symmetryMode: mode, menagerie };
  }
  return { nodes, currentId: v.currentId, counter: Math.max(claimed, top + 1), symmetryMode: mode, menagerie };
}

function checkSummary(v: unknown, breeder: BreederSave): SaveSummary {
  const cur = breeder.nodes[breeder.currentId];
  const s = isObj(v) ? v : {};
  const orNull = (x: unknown) => (finite(x) ? Math.max(0, Math.floor(x)) : null);
  return {
    // (what the lineage itself says wins over what the summary claims)
    generation: cur.generation,
    kind: typeof s.kind === 'string' ? s.kind.slice(0, 24) : 'creature',
    creature: cur.genome,
    lineage: Object.keys(breeder.nodes).length,
    day: orNull(s.day),
    population: orNull(s.population),
    species: orNull(s.species),
  };
}

/** A save from parsed data, checked — or a readable error. (The World inside it is checked when it is
 *  opened: building a valley to validate a list entry would cost a second a save.) */
export function checkSave(v: unknown): SavedGame {
  if (!isObj(v) || v.format !== SAVE_FORMAT) return fail('This is not a Cambrian saved game.');
  if (v.v !== SAVE_V) return fail(`This save is version ${String(v.v)}; this build reads version ${SAVE_V}.`);
  const breeder = checkBreeder(v.breeder);
  const world = typeof v.world === 'string' ? v.world : null;
  return {
    format: SAVE_FORMAT,
    v: SAVE_V,
    id: typeof v.id === 'string' && /^[\w-]{1,40}$/.test(v.id) ? v.id : newSaveId(Date.now()),
    name: cleanName(typeof v.name === 'string' ? v.name : ''),
    savedAt: finite(v.savedAt) ? v.savedAt : 0,
    setup: checkSetup(v.setup),
    summary: checkSummary(v.summary, breeder),
    breeder,
    world,
  };
}

/** A save from the text of a file. */
export function parseSave(text: string): SavedGame {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return fail('This file is not a saved game (it is not valid JSON).');
  }
  // (a World saved on its own from the World screen is a different file: say so)
  if (isObj(v) && v.format === 'cambrian-world') return fail('This file is a saved World on its own — open it from the World screen’s “world” menu.');
  return checkSave(v);
}

// --- slot stores ---------------------------------------------------------------------------------

/** Where saves are kept. Every method resolves (or rejects with a readable error); none throws. */
export interface SaveStore {
  list(): Promise<SaveHeader[]>;
  get(id: string): Promise<SavedGame | null>;
  put(g: SavedGame): Promise<void>;
  remove(id: string): Promise<void>;
  /** false for a store that will not outlive the page (private browsing, a blocked database) */
  readonly durable: boolean;
}

/** A store in memory: the fallback where the browser has no database to give, and the tests' store. */
export function memoryStore(): SaveStore {
  const bodies = new Map<string, string>();
  const headers = new Map<string, SaveHeader>();
  return {
    durable: false,
    list: async () => sortSaves([...headers.values()]),
    get: async (id) => {
      const s = bodies.get(id);
      return s ? checkSave(JSON.parse(s)) : null;
    },
    put: async (g) => {
      bodies.set(g.id, serializeSave(g));
      headers.set(g.id, headerOf(g));
    },
    remove: async (id) => {
      bodies.delete(id);
      headers.delete(id);
    },
  };
}

const DB_NAME = 'cambrian';
const DB_VERSION = 1;

/** The browser's IndexedDB: a `headers` store (small, listed) and a `bodies` store (large, read one at
 *  a time), written together in one transaction. */
export function idbStore(factory: IDBFactory, dbName = DB_NAME): SaveStore {
  let opening: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (!opening) {
      opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = factory.open(dbName, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('headers')) db.createObjectStore('headers', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('bodies')) db.createObjectStore('bodies', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error('The browser would not open its save database.'));
        req.onblocked = () => reject(new Error('The save database is in use by another tab.'));
      });
      // (a failed open is retried on the next call rather than remembered forever)
      opening.catch(() => {
        opening = null;
      });
    }
    return opening;
  };
  const run = async <T>(mode: IDBTransactionMode, work: (headers: IDBObjectStore, bodies: IDBObjectStore) => IDBRequest<T> | null): Promise<T | undefined> => {
    const db = await open();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(['headers', 'bodies'], mode);
      const req = work(tx.objectStore('headers'), tx.objectStore('bodies'));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'There is no room left to save — delete an old save, or export it to a file first.' : 'The save could not be written.'));
      tx.onabort = () => reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'There is no room left to save — delete an old save, or export it to a file first.' : 'The save was interrupted.'));
    });
  };
  return {
    durable: true,
    list: async () => sortSaves(((await run<SaveHeader[]>('readonly', (h) => h.getAll())) ?? []).filter((h) => isObj(h) && typeof h.id === 'string')),
    get: async (id) => {
      const body = await run<SavedGame | undefined>('readonly', (_h, b) => b.get(id));
      return body ? checkSave(body) : null;
    },
    put: async (g) => {
      await run('readwrite', (h, b) => {
        h.put(headerOf(g));
        b.put(g);
        return null;
      });
    },
    remove: async (id) => {
      await run('readwrite', (h, b) => {
        h.delete(id);
        b.delete(id);
        return null;
      });
    },
  };
}

let STORE: SaveStore | null = null;

/** The page's save store: the browser's database where there is one, else memory (saves then last
 *  until the page closes — the list says so). */
export function saveStore(): SaveStore {
  if (!STORE) {
    const f = typeof indexedDB !== 'undefined' ? indexedDB : null;
    STORE = f ? idbStore(f) : memoryStore();
  }
  return STORE;
}
