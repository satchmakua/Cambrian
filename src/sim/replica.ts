/**
 * The world, mirrored — how the simulation worker tells the page what its world now is, and how the page's
 * copy (a replica) takes it in.
 *
 * The worker steps the one real World; after each run of steps it sends a FRAME: everything that changes as
 * a world runs — what a save holds — but only what is new of what accumulates (genomes the page has not yet
 * seen, a species' trend once it has grown, journal lines, history samples). The replica takes each frame in
 * place, keeping every object's identity: a creature, a carcass, a species is the same object from frame to
 * frame, so a view holding one carries on. And it ends up exactly the world the worker holds — a save of one
 * is a save of the other, byte for byte (the tests hold it to that).
 *
 * Genomes go by index into a table both sides keep in step: the order a save lists them in (genomeTable), so
 * a world loaded from a save on one side and the world it was saved from on the other agree without sending
 * one genome. Pure: it runs the same in the worker, on the page and in a test.
 */
import type { Genome } from '../engine/genome';
import { bodyOf, rebuildBuckets, type Corpse, type Creature, type Egg, type HistorySample, type Species, type World, type WorldEvent } from './model';
import { applySea } from './levers';

type Ref = number;
export type CreatureData = Omit<Creature, 'genome' | 'traits'> & { genome: Ref };
export type CorpseData = Omit<Corpse, 'genome'> & { genome: Ref };
export type EggData = Omit<Egg, 'genome'> & { genome: Ref };
/** (`trend` is null when the replica's is still current: a species' trend is long, and grows four times a day) */
export type SpeciesData = Omit<Species, 'founder' | 'bank' | 'trend' | 'film'> & { founder: Ref; bank: Ref[]; trend: Species['trend'] | null; film: { t: number; gen: number; genome: Ref }[] };

export interface Frame {
  time: number;
  stepCount: number;
  nextId: number;
  rng: number;
  historyTimer: number;
  fieldTimer: number;
  /** genomes new to the table, in order */
  genomes: Genome[];
  creatures: CreatureData[];
  corpses: CorpseData[];
  eggs: EggData[];
  species: SpeciesData[];
  /** each plant's fruit, in the plants' order */
  fruit: number[];
  grass: Float32Array;
  algae: Float32Array;
  /** the whole journal, when it has changed */
  events: WorldEvent[] | null;
  /** the history: keep the last `keep` samples the replica has, then add `samples` (null: unchanged) */
  history: { keep: number; samples: HistorySample[] } | null;
  tally: World['tally'];
  homes: World['homes'];
  god: World['god'];
  cap: number;
  adopted: number[];
  levers: World['levers'];
  scenario: World['scenario'];
}

/** What has been sent so far (each frame sends only what is new of it). */
export interface Sent {
  table: Map<Genome, Ref>;
  trends: Map<number, string>;
  events: string;
  /** the time of the last history sample sent (-1: none) */
  history: number;
}

/** Every genome a world holds, in the order a save lists them (persist.ts: species, then creatures,
 *  carcasses, eggs — each genome where it is first met). */
export function genomeTable(w: World): Genome[] {
  const seen = new Set<Genome>();
  const out: Genome[] = [];
  const add = (g: Genome) => {
    if (!seen.has(g)) {
      seen.add(g);
      out.push(g);
    }
  };
  for (const s of w.species) {
    add(s.founder);
    for (const g of s.bank) add(g);
    for (const f of s.film) add(f.genome);
  }
  for (const c of w.creatures) add(c.genome);
  for (const k of w.corpses) add(k.genome);
  for (const e of w.eggs) add(e.genome);
  return out;
}

/** What has been sent of a world the other side already holds whole (both loaded from one save, or the
 *  one saved and the other loaded from it): its genomes, by `genomeTable`'s order — and nothing else. */
export function sentOf(w: World): Sent {
  return { table: new Map(genomeTable(w).map((g, i) => [g, i])), trends: new Map(), events: '', history: -1 };
}

const trendKey = (s: Species) => `${s.trend.length}:${s.trendStride}:${s.trend.length ? s.trend[s.trend.length - 1].t : -1}`;
const eventsKey = (e: WorldEvent[]) => (e.length ? `${e.length}:${e[e.length - 1].t}:${e[e.length - 1].text}` : '0');

/** The frame that brings a replica holding everything in `sent` up to `w` (and `sent` up to date with it). */
export function frameOf(w: World, sent: Sent): Frame {
  const genomes: Genome[] = [];
  const ref = (g: Genome): Ref => {
    let i = sent.table.get(g);
    if (i === undefined) {
      i = sent.table.size;
      sent.table.set(g, i);
      genomes.push(g);
    }
    return i;
  };
  // (the order a save meets them in, so a new genome's index is the one a save would give it)
  // (spread whole and overwritten, so every key keeps its place: a save writes a species' trend where it
  // stands among its fields, and the replica's must stand in the same place)
  const species = w.species.map((s) => {
    const key = trendKey(s);
    const fresh = sent.trends.get(s.id) !== key;
    if (fresh) sent.trends.set(s.id, key);
    return { ...s, founder: ref(s.founder), bank: s.bank.map(ref), film: s.film.map((f) => ({ t: f.t, gen: f.gen, genome: ref(f.genome) })), trend: fresh ? s.trend : null } as unknown as SpeciesData;
  });
  const creatures = w.creatures.map(({ genome, traits: _traits, ...rest }) => ({ ...rest, genome: ref(genome) }));
  const corpses = w.corpses.map(({ genome, ...rest }) => ({ ...rest, genome: ref(genome) }));
  const eggs = w.eggs.map(({ genome, ...rest }) => ({ ...rest, genome: ref(genome) }));
  const ek = eventsKey(w.events);
  const events = ek !== sent.events ? w.events : null;
  sent.events = ek;
  let history: Frame['history'] = null;
  const last = w.history.length ? w.history[w.history.length - 1].t : -1;
  if (last !== sent.history) {
    let i = w.history.length - 1;
    while (i >= 0 && w.history[i].t !== sent.history) i--;
    // (the samples the replica has are the ones up to the last it was sent, less any trimmed off the front)
    history = i >= 0 ? { keep: i + 1, samples: w.history.slice(i + 1) } : { keep: 0, samples: w.history };
    sent.history = last;
  }
  return {
    time: w.time,
    stepCount: w.stepCount,
    nextId: w.nextId,
    rng: w.rng.state.a,
    historyTimer: w.historyTimer,
    fieldTimer: w.fieldTimer,
    genomes,
    creatures,
    corpses,
    eggs,
    species,
    fruit: w.plants.map((p) => p.fruit),
    grass: w.grass.slice(),
    algae: w.algae.slice(),
    events,
    history,
    tally: { ...w.tally },
    homes: w.homes.map((h) => ({ ...h })),
    god: { ...w.god, forced: w.god.forced ? { ...w.god.forced } : null },
    cap: w.cap,
    adopted: [...w.adopted],
    levers: { ...w.levers, events: w.levers.events.map((e) => ({ ...e })) },
    scenario: w.scenario ? { ...w.scenario } : null,
  };
}

/** Take a frame into the replica `r` (`table`: the genomes the replica's side holds, by index — the
 *  frame's new ones are appended to it). Objects already in the replica are updated in place. */
export function applyFrame(r: World, f: Frame, table: Genome[]): void {
  for (const g of f.genomes) table.push(g);
  const genome = (i: Ref): Genome => {
    const g = table[i];
    if (!g) throw new Error('A frame refers to a genome the page does not hold.');
    return g;
  };
  r.time = f.time;
  r.stepCount = f.stepCount;
  r.nextId = f.nextId;
  r.rng.state.a = f.rng;
  r.historyTimer = f.historyTimer;
  r.fieldTimer = f.fieldTimer;
  // (in place, keeping identity — and, for a new object, the key order its sender's had)
  const species = new Map(r.species.map((s) => [s.id, s]));
  r.species = f.species.map((d) => {
    const s = species.get(d.id);
    const trend = d.trend ?? s?.trend ?? [];
    const founder = genome(d.founder), bank = d.bank.map(genome);
    const film = d.film.map((f) => ({ t: f.t, gen: f.gen, genome: genome(f.genome) }));
    if (s) return Object.assign(s, d, { trend, founder, bank, film });
    return { ...d, trend, founder, bank, film } as Species;
  });
  const creatures = new Map(r.creatures.map((c) => [c.id, c]));
  r.creatures = f.creatures.map((d) => {
    const g = genome(d.genome);
    const c = creatures.get(d.id);
    if (c) {
      const traits = c.genome === g ? c.traits : bodyOf(g).traits;
      return Object.assign(c, d, { genome: g, traits });
    }
    return { ...d, genome: g, traits: bodyOf(g).traits } as Creature;
  });
  const corpses = new Map(r.corpses.map((k) => [k.id, k]));
  r.corpses = f.corpses.map((d) => {
    const k = corpses.get(d.id);
    return k ? Object.assign(k, d, { genome: genome(d.genome) }) : ({ ...d, genome: genome(d.genome) } as Corpse);
  });
  const eggs = new Map(r.eggs.map((e) => [e.id, e]));
  r.eggs = f.eggs.map((d) => {
    const e = eggs.get(d.id);
    return e ? Object.assign(e, d, { genome: genome(d.genome) }) : ({ ...d, genome: genome(d.genome) } as Egg);
  });
  if (f.fruit.length === r.plants.length) f.fruit.forEach((v, i) => (r.plants[i].fruit = v));
  r.grass.set(f.grass);
  r.algae.set(f.algae);
  if (f.events) r.events = f.events;
  if (f.history) r.history = [...r.history.slice(r.history.length - f.history.keep), ...f.history.samples];
  r.tally = f.tally;
  r.homes = f.homes;
  r.god = f.god;
  r.cap = f.cap;
  r.adopted = f.adopted;
  r.levers = f.levers;
  // (a planet's ground where its sea now stands: the water the view draws, and the food, should the page
  // ever step it itself)
  applySea(r, false);
  r.scenario = f.scenario;
  // (the replica is never stepped, but the view asks it who is near whom)
  rebuildBuckets(r);
}
