/**
 * Saving and loading a World.
 *
 * The static world (terrain, biome caps) is rebuilt from its seed; everything that changes as it
 * runs — the grass and algae fields, every creature, carcass, species, the event log and history,
 * and the state of its one random stream — is written out. Genomes are stored once each (as share
 * strings) and referenced by index, so a herd of clones costs one genome, and genome *identity* is
 * kept (a species' founder is the same object as its first creatures' genome, as in a live world).
 *
 * A valley is version 1, as it always was. A planet is version 2: it carries the planet too — its spec
 * (rebuilt from, as a valley is from its seed), the version of the bake that made it and its checksum.
 * A planet made again by another bake, or by a browser that rounds differently, is still loaded, and
 * the journal says its ground has changed a little.
 *
 * The contract the tests hold it to: a loaded world continues bit-for-bit as the original would.
 */
import type { Genome } from '../engine/genome';
import { decodeGenome, encodeGenome } from '../engine/share';
import { bodyOf, createPlanet, createWorld, log, type Corpse, type Creature, type Egg, type Species, type World } from './world';
import { BAKE_VERSION, SPEC_DEFAULTS, type PlanetSpec } from './planetBake';
import type { PlanetSurface } from './planetSurface';
import { applySea } from './levers';

export const SAVE_VERSION = 1;
/** a planet's saves */
export const PLANET_SAVE_VERSION = 2;

/** what a planet's save holds of the planet itself */
interface SavedPlanet {
  spec: Required<PlanetSpec>;
  bake: number;
  checksum: string;
}

type SavedCreature = Omit<Creature, 'genome' | 'traits' | 'fit' | 'dry' | 'perch' | 'soarT'> & { genome: number; fit?: number; dry?: number; perch?: number; soarT?: number };
type SavedCorpse = Omit<Corpse, 'genome'> & { genome: number };
type SavedSpecies = Omit<Species, 'founder' | 'bank' | 'evolvedInto' | 'splitWatch' | 'bred' | 'film'> & { founder: number; bank?: number[]; evolvedInto?: number | null; splitWatch?: number; bred?: boolean; film?: { t: number; gen: number; genome: number }[] };
type SavedEgg = Omit<Egg, 'genome'> & { genome: number };

interface SavedWorld {
  format: 'cambrian-world';
  v: number;
  planet?: SavedPlanet;
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
  const planet = planetOf(w);
  const out: SavedWorld = {
    format: 'cambrian-world',
    v: planet ? PLANET_SAVE_VERSION : SAVE_VERSION,
    ...(planet ? { planet } : {}),
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
  if (s.v !== SAVE_VERSION && s.v !== PLANET_SAVE_VERSION) throw new Error(`Saved world is version ${s.v}; this build reads versions ${SAVE_VERSION} and ${PLANET_SAVE_VERSION}.`);
  const planet = s.v === PLANET_SAVE_VERSION ? checkPlanet(s.planet) : null;
  // (a world saved before valleys came in sizes holds MAX_POP)
  const cap = typeof s.cap === 'number' && s.cap > 0 ? s.cap : undefined;
  const w = planet ? createPlanet(planet.spec, cap) : createWorld(s.seed, cap);
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
  w.species = s.species.map(({ founder, bank, evolvedInto, splitWatch, bred, film, range, ...rest }) => ({
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
    // (a planet's species: where each last lived — last, where a live one's is)
    ...(range ? { range: { ...range } } : {}),
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
  // (a world saved before the levers had none pulled, and no scenario; a planet's sea, where it was moved)
  if (s.levers) w.levers = { warmth: s.levers.warmth, rain: s.levers.rain, events: s.levers.events.map((e) => ({ ...e })), ...(s.levers.sea !== undefined ? { sea: s.levers.sea } : {}), ...(s.levers.seaNow !== undefined ? { seaNow: s.levers.seaNow } : {}) };
  applySea(w, false);
  w.scenario = s.scenario ? { ...s.scenario } : null;
  // (a world saved before god mode runs itself)
  if (s.god) w.god = { on: !!s.god.on, mutation: Number.isFinite(s.god.mutation) ? s.god.mutation : 1, immigration: s.god.immigration !== false, forced: s.god.forced ? { ...s.god.forced } : null };
  // (a planet made again here that is not the one saved: said once — the next save holds this one's mark)
  if (planet) {
    const made = (w.surface as PlanetSurface).ground.bake;
    if (planet.bake !== BAKE_VERSION || planet.checksum !== made.checksum) log(w, 'climate', planet.bake !== BAKE_VERSION ? 'this planet was made by an older version of the game: its ground has changed a little' : 'this planet was made again by another browser, and its ground differs a little from the one saved');
  }
  return w;
}

/** What a save holds of a world's planet (null: a valley). */
function planetOf(w: World): SavedPlanet | null {
  const S = w.surface as Partial<PlanetSurface>;
  if (S.kind !== 'planet' || !S.ground) return null;
  const g = S.ground;
  return {
    spec: { seed: g.seed, radius: g.radius, relief: g.relief, land: g.land, continents: g.continents, rugged: g.rugged, temperature: g.temperature, wetness: g.wetness, tilt: S.tilt ?? 0.5, shelf: g.shelf },
    bake: BAKE_VERSION,
    checksum: g.bake.checksum,
  };
}

/** A saved planet, checked: every number of its spec finite and in reason (or a readable error). */
function checkPlanet(v: unknown): SavedPlanet {
  const bad = () => new Error('Saved world is corrupt (its planet is unreadable).');
  if (!v || typeof v !== 'object') throw bad();
  const p = v as Partial<SavedPlanet>;
  const s = (p.spec ?? {}) as Record<string, unknown>;
  const num = (k: string, lo: number, hi: number, d?: number): number => {
    const x = s[k] ?? d;
    if (typeof x !== 'number' || !Number.isFinite(x) || x < lo || x > hi) throw bad();
    return x;
  };
  const spec: Required<PlanetSpec> = {
    seed: num('seed', 0, 2 ** 32) >>> 0,
    radius: num('radius', 40, 1000),
    relief: num('relief', 0, 100),
    land: num('land', 0.05, 0.95),
    continents: num('continents', 0, 1, SPEC_DEFAULTS.continents),
    rugged: num('rugged', 0, 1, SPEC_DEFAULTS.rugged),
    temperature: num('temperature', -1, 1, SPEC_DEFAULTS.temperature),
    wetness: num('wetness', -1, 1, SPEC_DEFAULTS.wetness),
    tilt: num('tilt', 0, 1, 0.5),
    shelf: num('shelf', 0, 1, SPEC_DEFAULTS.shelf),
  };
  return { spec, bake: typeof p.bake === 'number' ? p.bake : 0, checksum: typeof p.checksum === 'string' ? p.checksum : '' };
}

/** The planet a save is of, read without loading it (null: a valley's, or no saved world at all) — so a
 *  page can have its ground baked off its own thread first. */
export function savedPlanetSpec(json: string): Required<PlanetSpec> | null {
  try {
    const s = JSON.parse(json) as Partial<SavedWorld>;
    return s && s.format === 'cambrian-world' && s.v === PLANET_SAVE_VERSION ? checkPlanet(s.planet).spec : null;
  } catch {
    return null;
  }
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
