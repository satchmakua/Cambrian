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
import { bodyOf, createWorld, type Corpse, type Creature, type Egg, type Species, type World } from './world';

export const SAVE_VERSION = 1;

type SavedCreature = Omit<Creature, 'genome' | 'traits' | 'fit' | 'dry' | 'perch' | 'soarT'> & { genome: number; fit?: number; dry?: number; perch?: number; soarT?: number };
type SavedCorpse = Omit<Corpse, 'genome'> & { genome: number };
type SavedSpecies = Omit<Species, 'founder' | 'bank' | 'evolvedInto' | 'splitWatch' | 'bred' | 'film'> & { founder: number; bank?: number[]; evolvedInto?: number | null; splitWatch?: number; bred?: boolean; film?: { t: number; gen: number; genome: number }[] };
type SavedEgg = Omit<Egg, 'genome'> & { genome: number };

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
  eggs?: SavedEgg[];
  events: World['events'];
  history: World['history'];
  tally: World['tally'];
  homes?: World['homes'];
  god?: World['god'];
  cap?: number;
  adopted?: number[];
  levers?: World['levers'];
  scenario?: World['scenario'];
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
  const species = w.species.map(({ founder, bank, film, ...rest }) => ({ ...rest, founder: ref(founder), bank: bank.map(ref), film: film.map((f) => ({ t: f.t, gen: f.gen, genome: ref(f.genome) })) }));
  const creatures = w.creatures.map(({ genome, traits: _traits, ...rest }) => ({ ...rest, genome: ref(genome) }));
  const corpses = w.corpses.map(({ genome, ...rest }) => ({ ...rest, genome: ref(genome) }));
  const eggs = w.eggs.map(({ genome, ...rest }) => ({ ...rest, genome: ref(genome) }));
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
    eggs,
    events: w.events,
    history: w.history,
    tally: w.tally,
    homes: w.homes,
    god: w.god,
    cap: w.cap,
    adopted: w.adopted,
    levers: w.levers,
    scenario: w.scenario,
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
  // (a world saved before valleys came in sizes holds MAX_POP)
  const w = createWorld(s.seed, typeof s.cap === 'number' && s.cap > 0 ? s.cap : undefined);
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
  w.species = s.species.map(({ founder, bank, evolvedInto, splitWatch, bred, film, ...rest }) => ({
    ...rest,
    // (a world saved before species kept their records starts them empty)
    causes: rest.causes ? { ...rest.causes } : { starvation: 0, predation: 0, oldAge: 0 },
    killedBy: { ...(rest.killedBy ?? {}) },
    killed: { ...(rest.killed ?? {}) },
    trend: (rest.trend ?? []).map((x) => ({ ...x })),
    trendStride: rest.trendStride ?? 1,
    founder: genome(founder),
    // (…and one saved before they kept a seed bank returns from its founder until it has one)
    bank: (bank ?? [founder]).map(genome),
    evolvedInto: evolvedInto ?? null,
    splitWatch: splitWatch ?? 0,
    bred: bred ?? false,
    // (a world saved before species kept a film starts each with none)
    film: (film ?? []).map((f) => ({ t: f.t, gen: f.gen, genome: genome(f.genome) })),
  }));
  w.creatures = s.creatures.map(({ genome: gi, ...rest }) => {
    const g = genome(gi);
    // (fields added after a save was written take their defaults)
    // (a creature saved before bodies were judged is taken as well made)
    return { ...rest, courtT: rest.courtT ?? 0, chaseT: rest.chaseT ?? 0, fit: rest.fit ?? 1, perch: rest.perch ?? -1, soarT: rest.soarT ?? 0, dry: rest.dry ?? 0, genome: g, traits: bodyOf(g).traits };
  });
  w.corpses = s.corpses.map(({ genome: gi, ...rest }) => ({ ...rest, genome: genome(gi) }));
  w.eggs = (s.eggs ?? []).map(({ genome: gi, ...rest }) => ({ ...rest, genome: genome(gi) }));
  w.events = s.events.map((e) => ({ ...e }));
  w.history = s.history.map((h) => ({ ...h, pops: { ...h.pops } }));
  // (in place: the key order is part of the bit-for-bit save; a world saved before stillbirths has none)
  w.tally = { ...s.tally, stillborn: s.tally.stillborn ?? 0 };
  w.homes = (s.homes ?? []).map((h) => ({ ...h }));
  w.adopted = [...(s.adopted ?? [])];
  // (a world saved before the levers had none pulled, and no scenario)
  if (s.levers) w.levers = { warmth: s.levers.warmth, rain: s.levers.rain, events: s.levers.events.map((e) => ({ ...e })) };
  w.scenario = s.scenario ? { ...s.scenario } : null;
  // (a world saved before god mode runs itself)
  if (s.god) w.god = { on: !!s.god.on, mutation: Number.isFinite(s.god.mutation) ? s.god.mutation : 1, immigration: s.god.immigration !== false, forced: s.god.forced ? { ...s.god.forced } : null };
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
