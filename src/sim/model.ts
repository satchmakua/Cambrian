/**
 * The World's model — its shapes (the world, a creature, a species…), its tunables, its clock and
 * climate, and the small helpers every part of the simulation leans on (a body grown from its genome, the
 * creatures near a point, the journal). The rest of the simulation is split by concern beside it
 * (species.ts, population.ts, behaviour.ts, motion.ts, fields.ts); world.ts steps it, and is the
 * simulation's public face.
 */
import type { Genome } from '../engine/genome';
import type { MutationRates } from '../engine/mutate';
import { grow, type Phenotype } from '../engine/grow';
import type { StatefulRng } from '../engine/rng';
import { type Terrain } from './terrain';
import type { Place, Surface } from './surface';
import { type Traits, traitsOf } from './traits';
import { droughtOf, type Weather, weatherAt } from './weather';
import { describe as describeMorph } from '../engine/morphospace';
import { encodeGenome } from '../engine/share';

// --- tunables -----------------------------------------------------------------------------------

export const STEP = 1 / 20; // fixed simulation step (s)
export const DAY_LENGTH = 240; // seconds of sim time per day/night cycle
export const DECIDE_EVERY = 0.6; // s between deliberations (staggered per creature)
export const GRID_CELL = 4; // grass / algae field resolution (bu)
export const GRASS_ENERGY = 26; // energy per unit of grass biomass
export const ALGAE_ENERGY = 24; // (a richer lake: two kinds live in it now, and two more feed in it)
export const FRUIT_ENERGY = 14;
export const MEAT_ENERGY = 1; // corpses store energy directly
export const GRASS_REGROW = 0.0032; // logistic rate (/s)
export const FRUIT_REGROW = 0.028; // fruit per second per bush
export const CORPSE_LIFE = 120; // s before a carcass is gone
export const HATCH_TIME = 84; // s an egg takes to hatch (~a third of a day)
export const EGG_ENERGY = 30; // what a raided egg is worth
/** The hard population cap (a rendering budget, not an ecological limit). */
export const MAX_POP = 165;
/** Above this, only RARE species (fewer than RARE alive) may still breed — so a minority lineage
 *  (a lake of fish, a pair of hunters) is never locked out of reproduction by a crowded world. */
export const SOFT_POP = 135;
/** the valley sizes a game can choose (MAX_POP is the first), and the soft cap of one (SOFT_POP's share) */
export const CAPACITIES: readonly number[] = [165, 330, 600];
export function softPop(w: { cap: number }): number {
  return (w.cap * SOFT_POP) / MAX_POP;
}
// (16, not 10: held to ten whenever its guild was full, a minority kind — the rodents, the birds, a lake's
// fish — was a bad season or two from gone, and came back as immigrants at generation 0 again and again)
export const RARE = 16;
export const RARE_HUNTER = 6;
/** how much a dry year at its worst slows the grass and the fruit (×its severity) */
export const DROUGHT_GRASS = 0.55;
export const DROUGHT_FRUIT = 0.5;
/** …how much of what a meadow can hold it loses, and how fast (/s) the standing grass above that withers */
export const DROUGHT_HOLD = 0.5;
export const DROUGHT_WITHER = 0.006;
/** No one species may hold more than this share of the soft cap. (The shares are the valley's ceiling —
 *  a rendering budget kept from being spent on one kind; inside them, food decides where a grazer or a
 *  swimmer can grow: population.ts's foodWebCarries. Loosened to 0.4 and the guilds' to 0.4/0.16/0.8, the
 *  valley sat at its hard cap, where no minority kind can breed at all.) */
export const SPECIES_SHARE = 0.3;
/** each guild's share of the soft cap (they sum past 1: a guild that is absent leaves room to others,
 *  and MAX_POP is the hard ceiling) */
// (hunters: an eighth, not a sixth — at a sixth, twenty-odd canids that caught what they chased ate a
// valley's small prey out in a few years)
export const GUILD_SHARE = { water: 0.34, hunter: 0.12, grazer: 0.7 } as const;
type Guild = keyof typeof GUILD_SHARE;
export function guildOf(c: { traits: Traits }): Guild {
  if (c.traits.habitat === 'water') return 'water';
  return c.traits.diet === 'carnivore' ? 'hunter' : 'grazer';
}
/** How far, in morphospace, a lineage drifts from its founder before it is something else. A species is
 *  a population, not one mutant: a mutant child stays in its parents' species (its variation), and the
 *  line takes a new name only when its living members, on average, have drifted this far — the
 *  population as a whole has become a new species (a chronospecies). */
export const SPECIATION_DIST = 0.32;
/** …or when its members fall into two groups this far apart (centre to centre), each at least
 *  SPLIT_MIN strong, and further apart than they are spread (a real gap, not one wide herd cut in two):
 *  then the group further from the founder branches off as a species of its own. */
export const SPLIT_DIST = 0.28;
export const SPLIT_MIN = 4;
export const SPLIT_SHARE = 0.25; // …and each group at least this share of the species
export const SPLIT_FROM = 8; // only a species this numerous is looked at for a split
export const SPLIT_GAP = 1.9; // centre-to-centre distance against the two groups' spreads added together
/** The gap must hold this many dawns running before the groups are called two species: a passing
 *  variation (a morph the two forms keep trading by interbreeding) is not a split. */
export const SPLIT_DAYS = 6;
/** A species keeps the genomes of up to this many of its living members, refreshed each dawn: the stock
 *  that wanders back in after it dies out here (the wider country's population lived on — it does not
 *  return as copies of its first founders, which would undo everything the valley's line had become). */
export const BANK = 8;
export const WORLD_MUTATION: MutationRates = { point: 0.22, pointSigma: 0.05, structural: 0.05, duplication: 0.02, macro: 0.0 };
export const MUTATION_CHANCE = 0.3; // per offspring
/** How often a mutated child's mouth may change its kind — and with it the diet its body gives it (see
 *  traits.ts). The mouth's style is one number cut into narrow bands (a grazer's mouth, a maw, fangs, a
 *  beak…), and left to drift like any other gene it crossed a band every few dozen births: within two
 *  years every canid in a valley was a grazer, and the felids mostly omnivores. A line's teeth are among
 *  its oldest commitments; a change of diet should be as rare as a move from water to land. */
export const DIET_SHIFT = 0.02;
/** The small differences between members of one stock: a release's animals, and immigrants, are its
 *  genome with a few numbers nudged — never a part added or lost. (Clones gave selection nothing to
 *  choose between until the first mutants were born.) */
export const VARIETY: MutationRates = { point: 0.3, pointSigma: 0.025, structural: 0, duplication: 0, macro: 0 };
/** How strongly a suitor prefers a partner that looks like itself: a mate's distance counts as
 *  (1 + MATE_LIKENESS × their morphospace distance) times as far. */
export const MATE_LIKENESS = 4;
/** …and one that is well made: a mate's distance counts (1 + MATE_FIT × (1 − its viability)) times as far. */
export const MATE_FIT = 3;
/** How much dearer a misbuilt body is to keep: resting burn × (1 + UPKEEP × (1 − viability)). */
export const UPKEEP = 1;
export const SPATIAL = 10; // spatial-hash cell (bu)
export const SCENT = 2.6; // hungry hunters smell prey this many vision-radii away
/** seconds a pair circle each other in display before they mate */
export const COURT_TIME = 4;
/** above this altitude (bu) a flier is airborne: out of a walker's reach, free of the ground's rules */
export const AIRBORNE = 0.45;
/** how far up the water's margin (height, per unit of walk) a fish can flop: at walk 0.1, past the
 *  waterline onto the wet edge of the bank (see canStand) */
const MARGIN_REACH = 3.5;
export const CLIMB = 2.6; // bu/s up
/** how far (bu) a flier looks for a tree to roost in */
export const ROOST_REACH = 40;
/** what it takes to ride the thermals: a big flier (a hawk, a dragon — a songbird flaps), and wings that
 *  carry it with some to spare */
export const SOAR_MASS = 1.5;
export const SOAR_LIFT = 0.9;
/** how far off its heading a soarer aims (radians): it turns at its full rate, so it circles */
export const SOAR_BANK = 0.9;
export const SINK = 3.4; // bu/s down (a stooping hunter drops twice as fast)

/** Feeding rate while eating, in energy/s as a multiple of the eater's resting metabolism — a
 *  specialist eats its food fast (it can top up in a fraction of its day), a generalist slowly. */
export const INTAKE: Record<string, Partial<Record<'grass' | 'algae' | 'fruit' | 'meat', number>>> = {
  herbivore: { grass: 4.5, fruit: 4 },
  omnivore: { grass: 1.7, algae: 2.6, fruit: 4, meat: 3.5 },
  carnivore: { meat: 7 },
  filter: { algae: 5.5 },
  nectar: { fruit: 6 },
};

// --- types --------------------------------------------------------------------------------------

export type Action = 'wander' | 'graze' | 'forage' | 'scavenge' | 'filter' | 'hunt' | 'flee' | 'sleep' | 'mate' | 'eat';
/** ('culled': by the player's hand, in god mode — counted as none of the valley's own causes) */
export type DeathCause = 'starvation' | 'predation' | 'old age' | 'culled';

export interface Species {
  id: number;
  name: string;
  kind: string; // nearest morphotype attractor
  founder: Genome;
  descriptor: number[];
  hue: number; // UI colour
  parent: number | null;
  firstSeen: number;
  extinctAt: number | null;
  alive: number;
  born: number;
  deaths: number;
  /** its dead by cause, since it was founded */
  causes: DeathTally;
  /** species id → how many of this species that species has killed */
  killedBy: Record<number, number>;
  /** species id → how many of that species this one has killed */
  killed: Record<number, number>;
  /** the species' living members, averaged every quarter day (thinned to every other sample as it
   *  fills, so a long-lived species' whole history fits) */
  trend: TrendSample[];
  /** how many quarter days apart its trend samples now are (doubles each time the trend is thinned) */
  trendStride: number;
  /** up to BANK genomes of its living members, refreshed each dawn: the stock it returns from */
  bank: Genome[];
  /** the species its whole line became (a chronospecies), if that is how it ended: not died out */
  evolvedInto: number | null;
  /** dawns running its members have stood in two separate groups (it splits at SPLIT_DAYS) */
  splitWatch: number;
  /** bred by the player, in the breeder, from a creature of its parent species taken home from here */
  bred: boolean;
  /** its film: its most typical body, taken at dawn whenever it had visibly changed since the last frame
   *  (at most FILM_MAX frames, thinned as it fills, its first kept) */
  film: FilmFrame[];
}

/** One frame of a species' film: when, how many generations in, and the body (its members' medoid). */
export interface FilmFrame {
  t: number;
  gen: number;
  genome: Genome;
}

export interface DeathTally {
  starvation: number;
  predation: number;
  oldAge: number;
}

/** A species' living members averaged at one moment: what selection and drift are doing to it. */
export interface TrendSample {
  t: number;
  /** how many were alive */
  n: number;
  mass: number;
  /** sprint speed (bu/s) */
  sprint: number;
  vision: number;
  attack: number;
  /** fraction of damage shrugged off */
  armour: number;
  /** how far its body has drifted from its founder's, in morphospace (a new species branches at 0.32) */
  drift: number;
  /** the share of its members that hunt (carnivores and omnivores) */
  hunters: number;
  /** the share still wearing its founder's coat */
  coat: number;
  /** its dead so far, by cause */
  starved: number;
  eaten: number;
  aged: number;
}

export interface Creature {
  id: number;
  species: number;
  genome: Genome;
  traits: Traits;
  x: number;
  z: number;
  /** on the valley, the ground's height under it (kept fresh for the viewer); on a planet, its place's third
   *  coordinate (its ground there is `ground`) */
  y: number;
  heading: number; // radians; 0 faces +Z, π/2 faces +X (on a planet, unused: its heading is fx, fy, fz)
  speed: number; // current ground speed (bu/s)
  energy: number;
  health: number;
  fatigue: number; // 0 rested … 1 exhausted
  age: number;
  lifeFactor: number; // individual lifespan multiplier
  action: Action;
  target: number; // creature / plant / corpse id, or grid cell index, by action
  tx: number;
  tz: number;
  decideIn: number;
  breedCooldown: number;
  generation: number;
  parent: number | null;
  children: number;
  kills: number;
  alive: boolean;
  attacker: number; // last creature to bite it (-1 none)
  attackedAt: number;
  /** sim time of its last bite (the viewer's lunge) */
  bitAt: number;
  wanderSeed: number;
  /** height above the ground (or the water) it is flying at — 0 on its feet */
  alt: number;
  /** a flier's wish to be airborne this step (set by the current action; landing is gradual) */
  fly: boolean;
  /** seconds of courtship display danced with the current partner (0 when not courting) */
  courtT: number;
  /** seconds into the current pounce (a hunter's all-out sprint); a hopeless chase is given up */
  chaseT: number;
  /** how well its body is made, against its line's first founder (0..1, see viability.ts): a poorer
   *  one burns more and is passed over by mates */
  fit: number;
  /** the broadleaf it roosts in, asleep (an index into the valley's trees, sim/stands.ts), or -1 */
  perch: number;
  /** seconds left riding the thermals, circling high (a strong flier's idle day), or 0 */
  soarT: number;
  /** seconds it has been out of the water (a gilled body has only so long: see Traits.ashore) */
  dry: number;
  /** a planet's own (planetSurface.ts): the third coordinate of its goal, its heading as a tangent at its
   *  place, and the ground's height under it */
  ty?: number;
  fx?: number;
  fy?: number;
  fz?: number;
  ground?: number;
}

export interface Plant {
  id: number;
  x: number;
  z: number;
  /** a planet's plant: its place's third coordinate */
  y?: number;
  fruit: number;
  max: number;
  size: number; // visual size
}

export interface Corpse {
  id: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  /** a planet's carcass: the way the body faced, as a tangent */
  fx?: number;
  fy?: number;
  fz?: number;
  meat: number;
  maxMeat: number;
  rot: number; // seconds left
  genome: Genome;
  growth: number;
  species: number;
}

/** An egg: laid in a clutch (a nest on land, a spawn cluster in the water), it hatches into a
 *  juvenile at `hatchAt` — unless something eats it first. */
export interface Egg {
  id: number;
  x: number;
  z: number;
  y: number;
  genome: Genome;
  species: number;
  mother: number; // creature id (it may be dead by the time the egg hatches)
  generation: number;
  laidAt: number;
  hatchAt: number;
  /** the clutch it belongs to (its first egg's id) — one nest */
  nest: number;
  water: boolean;
}

/** An event the player set going (levers.ts): from `from` to `until` (a plague: among `species`). */
export type LeverEventKind = 'ice-age' | 'ash-winter' | 'meteor' | 'plague';
export interface LeverEvent {
  kind: LeverEventKind;
  from: number;
  until: number;
  species?: number;
}
/** a colder or warmer age (−1 … 1), a drier or wetter valley (0.5 … 1.5), and the events under way */
export interface Levers {
  warmth: number;
  rain: number;
  events: LeverEvent[];
}

/** Weather forced by the player in god mode: a shower now, or a dry spell, from `from` to `until`. */
export interface Forced {
  kind: 'rain' | 'drought';
  from: number;
  until: number;
}

export interface WorldEvent {
  t: number;
  kind: 'birth' | 'death' | 'speciation' | 'extinction' | 'release' | 'kill' | 'mutation' | 'climate' | 'god' | 'goal';
  text: string;
  species?: number;
  creature?: number;
}

export interface HistorySample {
  t: number;
  pops: Record<number, number>;
  grass: number;
}

export interface World {
  seed: number;
  /** the world's one random stream (its state is saved with the world) */
  rng: StatefulRng;
  time: number;
  terrain: Terrain;
  /** the ground the simulation stands on, as one port (surface.ts): every place, distance, heading and
   *  question about the ground goes through it */
  surface: Surface;
  gridN: number;
  grass: Float32Array; // biomass per cell (0..cap)
  grassCap: Float32Array; // carrying capacity per cell
  algae: Float32Array;
  algaeCap: Float32Array;
  plants: Plant[];
  creatures: Creature[];
  corpses: Corpse[];
  eggs: Egg[];
  species: Species[];
  nextId: number;
  events: WorldEvent[];
  /** the creatures taken home to the breeder (by genome seed), and their species: a line bred from one
   *  and released here is its species' own branch (see release) */
  homes: { seed: number; species: number }[];
  /** god mode (the player's sandbox: see god.ts) — and what it has set: how often a birth is mutated
   *  (× the valley's own rate), whether lost founding stocks wander back in, and the weather forced now */
  god: { on: boolean; mutation: number; immigration: boolean; forced: Forced | null };
  /** how many creatures it can hold at once (MAX_POP by default: a rendering budget, chosen with the
   *  game — far creatures are drawn as markers, so a bigger valley can hold more than are drawn whole) */
  cap: number;
  /** the species whose lines the player has adopted: told when one of them splits, is renamed or dies out */
  adopted: number[];
  /** the levers the player has pulled on the climate, and the events under way (see levers.ts) */
  levers: Levers;
  /** the scenario this valley is played as, and how it stands (null: none — see scenarios.ts) */
  scenario: { id: string; status: 'going' | 'won' | 'lost'; from: number } | null;
  history: HistorySample[];
  historyTimer: number;
  fieldTimer: number;
  stepCount: number;
  /** cumulative tallies since the world began */
  tally: { births: number; kills: number; starvation: number; oldAge: number; mutations: number; speciations: number; stillborn: number };
  /** spatial hash of live creatures, rebuilt each step */
  buckets: Map<number, Creature[]>;
}

// --- body cache: grow + traits once per genome object --------------------------------------------

const BODY = new WeakMap<Genome, { phenotype: Phenotype; traits: Traits }>();
// …and by CONTENT: a world loaded from a save (or folded back from a fast-forward) carries fresh
// genome objects for the same genomes, and growing them again would also throw away every built skin
// the viewer caches per phenotype. A bounded map from the canonical share string finds them again.
const BY_CONTENT = new Map<string, { phenotype: Phenotype; traits: Traits }>();
const BY_CONTENT_MAX = 600;
export function bodyOf(genome: Genome): { phenotype: Phenotype; traits: Traits } {
  let b = BODY.get(genome);
  if (!b) {
    const key = encodeGenome(genome);
    b = BY_CONTENT.get(key);
    if (b) {
      BY_CONTENT.delete(key); // refresh its place in the LRU order
    } else {
      const phenotype = grow(genome);
      b = { phenotype, traits: traitsOf(phenotype) };
      if (BY_CONTENT.size >= BY_CONTENT_MAX) BY_CONTENT.delete(BY_CONTENT.keys().next().value as string);
    }
    BY_CONTENT.set(key, b);
    BODY.set(genome, b);
  }
  return b;
}

/** 0 at dawn … 0.25 noon … 0.5 dusk … 0.75 midnight. */
export function dayPhase(time: number): number {
  return ((time / DAY_LENGTH) % 1 + 1) % 1;
}
export function isNight(time: number): boolean {
  const p = dayPhase(time);
  return p > 0.52 && p < 0.98;
}
export function dayNumber(time: number): number {
  return Math.floor(time / DAY_LENGTH) + 1;
}

// --- seasons ----------------------------------------------------------------------------------------
/** Days in a year: three per season. */
export const YEAR_DAYS = 12;
/** The year a moment falls in, from 1 (a year is YEAR_DAYS days: the clock shows it beside the day, so
 *  a year's fast-forward reads as one). */
export function yearNumber(time: number): number {
  return Math.floor(time / (DAY_LENGTH * YEAR_DAYS)) + 1;
}
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
/** 0..1 through the year (0 = the first morning of spring). */
export function yearPhase(time: number): number {
  return ((time / (DAY_LENGTH * YEAR_DAYS)) % 1 + 1) % 1;
}
export function seasonOf(time: number): Season {
  return SEASONS[Math.floor(yearPhase(time) * 4) % 4];
}
/** Smooth cyclic interpolation of one value per season (keyed at each season's middle). */
export function seasonal(time: number, v: readonly [number, number, number, number]): number {
  const x = yearPhase(time) * 4 - 0.5; // season centres at integers
  const i = Math.floor(x);
  const f = x - i;
  const a = v[((i % 4) + 4) % 4], b = v[(((i + 1) % 4) + 4) % 4];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
/** The climate right now: how fast grass and fruit come back, and how cold it is (0 mild … 1 hard frost). */
export function climate(time: number): { grass: number; fruit: number; cold: number } {
  return {
    grass: seasonal(time, [1.45, 1.05, 0.78, 0.45]),
    fruit: seasonal(time, [0.6, 1.3, 1.55, 0.3]),
    cold: seasonal(time, [0.25, 0, 0.35, 1]),
  };
}

const eventOn = (w: World, kind: LeverEventKind, time = w.time) => w.levers.events.some((e) => e.kind === kind && time >= e.from && time < e.until);

/** The climate the valley lives under now: the season's, moved by the levers — a colder or warmer age,
 *  and an ice age or an ash winter under way (levers.ts). */
export function climateOf(w: World): { grass: number; fruit: number; cold: number } {
  const c = climate(w.time);
  return levered(w, c.grass, c.fruit, c.cold);
}

/** A season's grass, fruit and cold, moved by the levers as they stand at a time (now, unless asked for
 *  another: a planet's seasons are worked out a few seconds at a time, place by place: planetSeasons.ts). */
export function levered(w: World, g: number, f: number, k: number, time = w.time): { grass: number; fruit: number; cold: number } {
  const L = w.levers;
  let cold = k - 0.35 * L.warmth, grass = g * (1 + 0.15 * L.warmth), fruit = f * (1 + 0.1 * L.warmth);
  if (eventOn(w, 'ice-age', time)) {
    cold += 0.45;
    grass *= 0.6;
    fruit *= 0.55;
  }
  if (eventOn(w, 'ash-winter', time) || eventOn(w, 'meteor', time)) {
    cold += 0.35;
    grass *= 0.35;
    fruit *= 0.25;
  }
  return { grass: Math.max(0, grass), fruit: Math.max(0, fruit), cold: Math.max(0, Math.min(1.5, cold)) };
}

/** Snow on the land beyond the season's own: an ice age keeps it there the year round (0 … 1). */
export function leverSnow(w: World): number {
  return eventOn(w, 'ice-age') ? 0.65 : 0;
}

/** The sky over the valley now: its weather, unless god mode forces a shower (clouding over and clearing
 *  again across its first and last twentieth) or a dry spell (clear skies). */
export function skyNow(w: World): Weather {
  const f = w.god.forced;
  // (it falls as snow when the valley's climate is cold enough — a colder age, an ice age, included)
  const snow = climateOf(w).cold > 0.62;
  if (!f || w.time >= f.until || w.time < f.from) return { ...weatherAt(w.seed, w.time), snow };
  if (f.kind === 'drought') return { cloud: 0, rain: 0, snow };
  const edge = (f.until - f.from) / 20;
  const k = Math.min(1, (w.time - f.from) / edge, (f.until - w.time) / edge);
  return { cloud: 0.95 * Math.min(1, k * 1.5), rain: 0.8 * Math.max(0, k * 1.2 - 0.2), snow };
}

/** How dry the year is now (0 ordinary … 1 a hard drought): the year's own, or god mode's dry spell. */
export function dryNow(w: World): number {
  const f = w.god.forced;
  if (f && f.kind === 'drought' && w.time >= f.from && w.time < f.until) return 1;
  return droughtOf(w.seed, w.time);
}

/** Adult fraction of full size (newborns are ~40%; grown by maturity). */
export function growthOf(c: Creature): number {
  return 0.4 + 0.6 * Math.min(1, c.age / Math.max(1, c.traits.maturity));
}

/** May a body of these traits be at this place: in water deep enough, on dry enough ground? */
export function canStand(w: World, t: Traits, p: Place): boolean {
  const h = w.surface.height(p);
  // (a fish keeps to water deep enough to swim in — and the more its fins have begun to crawl, the further
  // up the margin it can flop: into the shallows, to the waterline, over the wet edge of the bank. Each
  // step toward a lobe-fin reaches a little more of what grows there)
  if (t.habitat === 'water') return h < w.surface.level(p) - 0.3 + MARGIN_REACH * t.walk;
  if (t.habitat === 'land') return h > w.surface.level(p) - 0.5;
  return true;
}

export function liveCount(w: World): number {
  let n = 0;
  for (const c of w.creatures) if (c.alive) n++;
  return n;
}

/** "a rodent α", "an ungulate β": a species' name with its article, for the journal. */
export function aName(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

export function log(w: World, kind: WorldEvent['kind'], text: string, species?: number, creature?: number): void {
  w.events.push({ t: w.time, kind, text, species, creature });
  if (w.events.length > 160) w.events.splice(0, w.events.length - 160);
}

export function speciesById(w: World, id: number): Species | undefined {
  return w.species.find((s) => s.id === id);
}
const DESCRIPTOR = new WeakMap<Genome, number[]>();
export function descriptorOf(g: Genome): number[] {
  let d = DESCRIPTOR.get(g);
  if (!d) DESCRIPTOR.set(g, (d = describeMorph(bodyOf(g).phenotype)));
  return d;
}

/** Index the living by place (each step, before any of them looks round). */
export function rebuildBuckets(w: World): void {
  w.surface.index(w);
}
/** Live creatures within `r` of a place. */
export function nearby(w: World, p: Place, r: number, out: Creature[] = []): Creature[] {
  return w.surface.nearby(w, p, r, out);
}

/** The field cell a place falls in, and a cell's middle. */
export function cellOf(w: World, p: Place): number {
  return w.surface.cellOf(p);
}
export function cellCenter(w: World, k: number): Place {
  return w.surface.cellCenter(k);
}
