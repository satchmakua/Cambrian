/**
 * Saving and loading a World.
 *
 * The static world (terrain, biome caps) is rebuilt from its seed; everything that changes as it
 * runs — the grass and algae fields, every creature, carcass, species, the event log and history,
 * and the state of its one random stream — is written out. Genomes are stored once each (as share
 * strings) and referenced by index, so a herd of clones costs one genome, and genome *identity* is
 * kept (a species' founder is the same object as its first creatures' genome, as in a live world).
 *
 * The contract the tests hold it to: a loaded world continues bit-for-bit as the original would.
 */
import type { Genome } from '../engine/genome';
import { decodeGenome, encodeGenome } from '../engine/share';
import { bodyOf, createWorld, type Corpse, type Creature, type Species, type World } from './world';

export const SAVE_VERSION = 1;

type SavedCreature = Omit<Creature, 'genome' | 'traits'> & { genome: number };
type SavedCorpse = Omit<Corpse, 'genome'> & { genome: number };
type SavedSpecies = Omit<Species, 'founder'> & { founder: number };

interface SavedWorld {
  format: 'cambrian-world';
  v: number;
  seed: number;
  time: number;
  stepCount: number;
  nextId: number;
  rng: number;
  historyTimer: number;
  fieldTimer: number;
  grass: string;
  algae: string;
  plants: World['plants'];
  genomes: string[];
  species: SavedSpecies[];
  creatures: SavedCreature[];
  corpses: SavedCorpse[];
  events: World['events'];
  history: World['history'];
  tally: World['tally'];
}

/** Serialise a world to a JSON string. */
export function saveWorld(w: World): string {
  const index = new Map<Genome, number>();
  const genomes: string[] = [];
  const ref = (g: Genome): number => {
    let i = index.get(g);
    if (i === undefined) {
      i = genomes.length;
      genomes.push(encodeGenome(g));
      index.set(g, i);
    }
    return i;
  };
  const species = w.species.map(({ founder, ...rest }) => ({ ...rest, founder: ref(founder) }));
  const creatures = w.creatures.map(({ genome, traits: _traits, ...rest }) => ({ ...rest, genome: ref(genome) }));
  const corpses = w.corpses.map(({ genome, ...rest }) => ({ ...rest, genome: ref(genome) }));
  const out: SavedWorld = {
    format: 'cambrian-world',
    v: SAVE_VERSION,
    seed: w.seed,
    time: w.time,
    stepCount: w.stepCount,
    nextId: w.nextId,
    rng: w.rng.state.a,
    historyTimer: w.historyTimer,
    fieldTimer: w.fieldTimer,
    grass: floatsToBase64(w.grass),
    algae: floatsToBase64(w.algae),
    plants: w.plants,
    genomes,
    species,
    creatures,
    corpses,
    events: w.events,
    history: w.history,
    tally: w.tally,
  };
  return JSON.stringify(out);
}

/** Rebuild a world from `saveWorld`'s output. Throws a readable error on anything that isn't one. */
export function loadWorld(json: string): World {
  let s: SavedWorld;
  try {
    s = JSON.parse(json) as SavedWorld;
  } catch {
    throw new Error('Not a saved world — the file is not valid JSON.');
  }
  if (!s || s.format !== 'cambrian-world') throw new Error('Not a saved Cambrian world.');
  if (s.v !== SAVE_VERSION) throw new Error(`Saved world is version ${s.v}; this build reads version ${SAVE_VERSION}.`);
  const w = createWorld(s.seed);
  const genomes = s.genomes.map((g) => decodeGenome(g));
  const genome = (i: number): Genome => {
    const g = genomes[i];
    if (!g) throw new Error('Saved world is corrupt (a creature points at a missing genome).');
    return g;
  };
  const grass = base64ToFloats(s.grass);
  const algae = base64ToFloats(s.algae);
  if (grass.length !== w.grass.length || algae.length !== w.algae.length) {
    throw new Error('Saved world is corrupt (its fields do not fit its terrain).');
  }
  w.grass.set(grass);
  w.algae.set(algae);
  w.time = s.time;
  w.stepCount = s.stepCount;
  w.nextId = s.nextId;
  w.rng.state.a = s.rng | 0;
  w.historyTimer = s.historyTimer;
  w.fieldTimer = s.fieldTimer;
  w.plants = s.plants.map((p) => ({ ...p }));
  w.species = s.species.map(({ founder, ...rest }) => ({ ...rest, founder: genome(founder) }));
  w.creatures = s.creatures.map(({ genome: gi, ...rest }) => {
    const g = genome(gi);
    // (fields added after a save was written take their defaults)
    return { ...rest, courtT: rest.courtT ?? 0, chaseT: rest.chaseT ?? 0, genome: g, traits: bodyOf(g).traits };
  });
  w.corpses = s.corpses.map(({ genome: gi, ...rest }) => ({ ...rest, genome: genome(gi) }));
  w.events = s.events.map((e) => ({ ...e }));
  w.history = s.history.map((h) => ({ ...h, pops: { ...h.pops } }));
  w.tally = { ...s.tally };
  return w;
}

// --- Float32Array <-> base64 (exact: the bytes themselves) ---------------------------------------

function floatsToBase64(a: Float32Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToFloats(s: string): Float32Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
