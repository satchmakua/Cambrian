/**
 * Levers on the environment — the pressures the player changes. Not the animals (that is the breeder's
 * place, and god mode's): the climate they live under, and what befalls them.
 *
 *   warmth   a colder or a warmer age (−1 … 1): every season's cold shifted, the growing season with it
 *   rain     a drier or a wetter valley (0.5 … 1.5): how fast the grass comes back after a shower
 *   events   an ice age (years of hard cold, snow on the ground the year round), an ash winter (a season
 *            of cold and dark, little growing), a meteor (most of the big animals killed at a stroke, and
 *            an ash winter after), a plague on one species (most of it, over a few days)
 *
 * Then watch what radiates into the gaps. Every lever pulled is told in the journal. Pure: a lever is a
 * change to the world, saved with it, and the valley carries on from it bit-for-bit.
 */
import { unitHash } from '../engine/rng';
import { DAY_LENGTH, YEAR_DAYS, aName, log, speciesById, type LeverEvent, type LeverEventKind, type World } from './model';
import { killCreature } from './population';

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
