/**
 * Levers on the environment — the pressures the player changes. Not the animals (that is the breeder's
 * place, and god mode's): the climate they live under, and what befalls them.
 *
 *   warmth   a colder or a warmer age (−1 … 1): every season's cold shifted, the growing season with it
 *   rain     a drier or a wetter valley (0.5 … 1.5): how fast the grass comes back after a shower
 *   sea      (a planet's) a lower or a higher sea (−1 … 1: up to a tenth of its relief each way), moving
 *            there a little each day: a falling sea dries the shelves out and closes straits into land
 *            bridges, joining what the water kept apart; a rising one drowns the low coasts and parts them
 *            again. An ice age holds the sea's water in its ice, and the sea falls through it.
 *   events   an ice age (years of hard cold, snow on the ground the year round), an ash winter (a season
 *            of cold and dark, little growing), a meteor (most of the big animals killed at a stroke, and
 *            an ash winter after), a plague on one species (most of it, over a few days)
 *
 * Then watch what radiates into the gaps. Every lever pulled is told in the journal. Pure: a lever is a
 * change to the world, saved with it, and the valley carries on from it bit-for-bit.
 */
import { unitHash } from '../engine/rng';
import { DAY_LENGTH, STEP, YEAR_DAYS, aName, log, speciesById, type LeverEvent, type LeverEventKind, type World } from './model';
import { killCreature } from './population';
import type { PlanetSurface } from './planetSurface';

/** how long each event lasts (s): an ice age four years, the rest three days */
export function eventSpan(kind: LeverEventKind): number {
  return kind === 'ice-age' ? 4 * DAY_LENGTH * YEAR_DAYS : 3 * DAY_LENGTH;
}
/** a meteor kills this share of the animals at least this heavy (the rest were sheltered, or lucky) */
const METEOR_MASS = 1.5;
const METEOR_KILLS = 0.7;
/** a plague takes this share of its species, over its days */
const PLAGUE_TAKES = 0.6;

export function setWarmth(w: World, v: number): boolean {
  const x = Math.round(Math.max(-1, Math.min(1, v)) * 2) / 2;
  if (x === w.levers.warmth) return false;
  w.levers.warmth = x;
  log(w, 'climate', x === 0 ? 'the climate settles back to the valley’s own' : x > 0 ? `a warmer age${x === 1 ? ', much warmer' : ''}: the winters soften` : `a colder age${x === -1 ? ', much colder' : ''}: the winters bite`);
  return true;
}

export function setRain(w: World, v: number): boolean {
  const x = Math.round(Math.max(0.5, Math.min(1.5, v)) * 4) / 4;
  if (x === w.levers.rain) return false;
  w.levers.rain = x;
  log(w, 'climate', x === 1 ? 'the rains are the valley’s own again' : x > 1 ? 'a wetter valley: the grass comes back faster' : 'a drier valley: the grass comes back slower');
  return true;
}

// --- the sea (a planet's) ------------------------------------------------------------------------------

/** the lever's full reach, as a share of the planet's relief (3 bu at 30 bu of relief). The shelves are
 *  shallow: a fall of 1.5 bu lays most of them bare (a fifth more land on an earthlike planet), and a rise of
 *  3 bu drowns a fifth of the land — of 6, nearly half. */
const SEA_REACH = 0.1;
/** an ice age's own fall of the sea, in the lever's units (half its reach: most of the shelves laid bare) */
const ICE_AGE_SEA = -0.5;
/** how fast the sea moves: a thirtieth of the relief a day (a bu a day at 30 bu of relief) */
const SEA_DAYS = 30;
/** the ground follows the sea in steps of a quarter bu (each step works the fields' food out again) */
const SEA_STEP = 0.25;

/** A world's planet, or null for a valley (which has no sea to move). */
function planetOf(w: World): PlanetSurface | null {
  const S = w.surface as Partial<PlanetSurface>;
  return S.kind === 'planet' && S.ground ? (S as PlanetSurface) : null;
}

/** Raise or lower a planet's sea (−1 … 1, in halves). False in a valley, or if it is set there already. */
export function setSea(w: World, v: number): boolean {
  if (!planetOf(w)) return false;
  const x = Math.round(Math.max(-1, Math.min(1, v)) * 2) / 2;
  if (x === (w.levers.sea ?? 0)) return false;
  w.levers.sea = x;
  if (w.levers.seaNow === undefined) w.levers.seaNow = 0;
  log(w, 'climate', x === 0 ? 'the sea begins to go back to its own level' : x < 0 ? 'the sea begins to fall: the shallows will dry out, and straits close into land bridges' : 'the sea begins to rise: the low coasts will drown');
  return true;
}

/** Where a planet's sea is going (bu from its own level): the lever, and an ice age's fall. */
export function seaTarget(w: World): number {
  const P = planetOf(w);
  if (!P) return 0;
  const iceAge = w.levers.events.some((e) => e.kind === 'ice-age' && w.time >= e.from && w.time < e.until);
  const x = Math.max(-1, Math.min(1, (w.levers.sea ?? 0) + (iceAge ? ICE_AGE_SEA : 0)));
  return x * SEA_REACH * P.ground.relief;
}

/** Where the ground has the sea now: where it stands, to the quarter bu. */
export function seaShown(w: World): number {
  return Math.round((w.levers.seaNow ?? 0) / SEA_STEP) * SEA_STEP;
}

/**
 * Put a planet's ground where its sea stands now: the water's surface (and so who may stand where, and
 * swim), what grows, and how much grass and algae each field cell may hold. `flood`: the sea has just moved
 * there — the grass and the algae over what it drowned or laid bare are held to their new caps, and the
 * bushes it rose over lose their fruit. (A world loaded from a save is only put back where it was.)
 */
export function applySea(w: World, flood: boolean): void {
  const P = planetOf(w);
  if (!P) return;
  const level = seaShown(w);
  if (P.seaLevel() === level && !flood) return;
  P.setSea(level);
  for (let k = 0; k < P.cells; k++) {
    const f = P.foodAt(P.cellCenter(k));
    w.grassCap[k] = f.grass;
    w.algaeCap[k] = f.algae;
    if (!flood) continue;
    if (w.grass[k] > f.grass) w.grass[k] = f.grass;
    if (w.algae[k] > f.algae) w.algae[k] = f.algae;
  }
  if (flood) for (const b of w.plants) if (b.fruit > 0 && P.height(b) < P.level(b)) b.fruit = 0;
}

/** Each step: a planet's sea a little nearer where it is going, and the ground following it. */
function moveSea(w: World): void {
  const now = w.levers.seaNow;
  // (a sea never moved has nowhere to go but where an ice age would take it)
  if (now === undefined && !w.levers.events.some((e) => e.kind === 'ice-age')) return;
  const P = planetOf(w);
  if (!P) return;
  const at = now ?? 0, target = seaTarget(w);
  if (at === target) return;
  const step = (P.ground.relief / SEA_DAYS / DAY_LENGTH) * STEP;
  const next = at < target ? Math.min(target, at + step) : Math.max(target, at - step);
  w.levers.seaNow = next;
  if (seaShown(w) !== P.seaLevel()) applySea(w, true);
  if (next === target) log(w, 'climate', target === 0 ? 'the sea is back at its own level' : `the sea stands ${Math.abs(target).toFixed(1)} bu ${target < 0 ? 'lower' : 'higher'} than its own level`);
}

/** Set an event going now (a plague: on `species`). False if one of its kind is already under way. */
export function startEvent(w: World, kind: LeverEventKind, species?: number): boolean {
  if (w.levers.events.some((e) => e.kind === kind && w.time < e.until && (kind !== 'plague' || e.species === species))) return false;
  const e: LeverEvent = { kind, from: w.time, until: w.time + eventSpan(kind), ...(species !== undefined ? { species } : {}) };
  if (kind === 'plague') {
    const sp = species !== undefined ? speciesById(w, species) : undefined;
    if (!sp || sp.alive === 0) return false;
    w.levers.events.push(e);
    log(w, 'climate', `a plague breaks out among the ${sp.name}`, sp.id);
    return true;
  }
  w.levers.events.push(e);
  if (kind === 'meteor') {
    let killed = 0;
    for (const c of w.creatures) {
      if (!c.alive || c.traits.mass < METEOR_MASS) continue;
      if (unitHash(w.seed, c.id, Math.floor(w.time), 0x3e7e) < METEOR_KILLS) {
        killCreature(w, c, true);
        killed++;
      }
    }
    log(w, 'climate', `a meteor strikes: ${killed} of the big animals are killed, and dust darkens the sky`);
  } else log(w, 'climate', kind === 'ice-age' ? 'an ice age begins: years of hard cold, and snow that does not melt' : 'an ash winter: a volcano far off darkens the sky for days');
  return true;
}

/** Each step: a plague takes its victims (each of those it will take, at a moment of its own within its
 *  days), and an event that has run its course ends — told in the journal. */
export function runLevers(w: World): void {
  const L = w.levers;
  moveSea(w);
  if (L.events.length === 0) return;
  for (const e of L.events) {
    if (e.kind !== 'plague' || w.time < e.from || w.time >= e.until) continue;
    for (const c of w.creatures) {
      if (!c.alive || c.species !== e.species) continue;
      if (unitHash(w.seed, c.id, Math.floor(e.from), 0x61a6) >= PLAGUE_TAKES) continue; // (it was spared)
      if (w.time >= e.from + unitHash(w.seed, c.id, Math.floor(e.from), 0x61a7) * (e.until - e.from)) {
        killCreature(w, c, true);
        if (unitHash(w.seed, c.id, 0x61a8) < 0.2) log(w, 'death', `${aName(speciesById(w, c.species)?.name ?? 'creature')} died of the plague`, c.species, c.id);
      }
    }
  }
  const over = L.events.filter((e) => w.time >= e.until);
  if (over.length === 0) return;
  L.events = L.events.filter((e) => w.time < e.until);
  for (const e of over) log(w, 'climate', e.kind === 'ice-age' ? 'the ice age ends: the snow melts back to the winters' : e.kind === 'plague' ? `the plague among the ${speciesById(w, e.species ?? -1)?.name ?? 'animals'} has run its course` : 'the sky clears', e.species);
}
