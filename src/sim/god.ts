/**
 * God mode — the player's hand in the valley.
 *
 * A switch on the world (off by default, and not offered in a scenario), and the acts it allows: on a
 * creature — strike it down, cull it, heal and feed it, carry it elsewhere, make it breed — and on the
 * valley — an algae bloom, a glut of fruit, a shower or a dry spell now, how often a birth is mutated,
 * whether lost founding stocks wander back in. Every act is told in the journal, so a valley's story
 * says which of its turns were the player's.
 *
 * Pure: each act is a change to the world, made the way the valley's own events are made — a saved
 * world keeps its effects, and carries on from them bit-for-bit.
 */
import { DAY_LENGTH, aName, breedNow, growthOf, killCreature, log, speciesById, type Creature, type World } from './world';
import type { Place } from './surface';

/** the most and least a birth may be mutated, against the valley's own rate */
export const MUTATION_DIAL: readonly number[] = [0, 0.5, 1, 2, 3];
/** how long a forced shower and a forced dry spell last (s) */
export const RAIN_FOR = DAY_LENGTH / 2;
export const DROUGHT_FOR = DAY_LENGTH * 3;

const nameOf = (w: World, c: Creature) => speciesById(w, c.species)?.name ?? 'creature';

/** Turn god mode on or off (told in the journal). Off, every act below does nothing. */
export function setGodMode(w: World, on: boolean): void {
  // (not in a scenario: its goal is reached by the valley's own evolution)
  if (w.god.on === on || (on && w.scenario)) return;
  w.god.on = on;
  log(w, 'god', on ? 'god mode: the valley is yours to change' : 'god mode is off: the valley runs itself again');
}

// --- on a creature -------------------------------------------------------------------------------

/** Struck dead where it stands: its carcass is left to the scavengers. */
export function smite(w: World, c: Creature): boolean {
  if (!w.god.on || !c.alive) return false;
  killCreature(w, c, true);
  log(w, 'god', `${aName(nameOf(w, c))} was struck down`, c.species, c.id);
  return true;
}

/** Taken out of the valley: no carcass. */
export function cull(w: World, c: Creature): boolean {
  if (!w.god.on || !c.alive) return false;
  killCreature(w, c, false);
  log(w, 'god', `${aName(nameOf(w, c))} was culled`, c.species, c.id);
  return true;
}

/** Healed, fed and rested. */
export function heal(w: World, c: Creature): boolean {
  if (!w.god.on || !c.alive) return false;
  c.health = c.traits.maxHealth;
  c.energy = c.traits.maxEnergy * growthOf(c);
  c.fatigue = 0;
  c.dry = 0;
  log(w, 'god', `${aName(nameOf(w, c))} was healed and fed`, c.species, c.id);
  return true;
}

/** Carried to a place and set down there (out of the air, its errand forgotten). */
export function carry(w: World, c: Creature, at: Place): boolean {
  const S = w.surface;
  if (!w.god.on || !c.alive || !S.inBounds(at, 4)) return false;
  S.moveTo(c, at);
  S.aim(c, at);
  S.settle(c);
  c.alt = 0;
  c.fly = false;
  c.speed = 0;
  c.action = 'wander';
  c.target = -1;
  c.decideIn = 0;
  log(w, 'god', `${aName(nameOf(w, c))} was carried across the valley`, c.species, c.id);
  return true;
}

/** Made to breed now: with the nearest grown member of its species, wherever it is — or alone, if it
 *  has none (a clone, as a budding kind's young are). Both are fed for it first. */
export function makeBreed(w: World, c: Creature): boolean {
  if (!w.god.on || !c.alive) return false;
  let mate: Creature | null = null;
  let best = Infinity;
  for (const o of w.creatures) {
    if (o === c || !o.alive || o.species !== c.species || o.age < o.traits.maturity) continue;
    const d = w.surface.dist(c, o);
    if (d < best) {
      best = d;
      mate = o;
    }
  }
  const born = w.creatures.length + w.eggs.length;
  breedNow(w, c, mate);
  if (w.creatures.length + w.eggs.length === born) return false; // (no room in the valley)
  log(w, 'god', mate ? `a pair of ${nameOf(w, c)} were made to breed` : `${aName(nameOf(w, c))} was made to breed alone`, c.species, c.id);
  return true;
}

// --- on the valley -------------------------------------------------------------------------------

/** The lake as green as it can be. */
export function bloom(w: World): boolean {
  if (!w.god.on) return false;
  w.algae.set(w.algaeCap);
  log(w, 'god', 'an algae bloom: the lake is as rich as it can be');
  return true;
}

/** Every bush and tree in full fruit. */
export function glut(w: World): boolean {
  if (!w.god.on) return false;
  for (const p of w.plants) p.fruit = p.max;
  log(w, 'god', 'a glut: every bush and tree hangs heavy with fruit');
  return true;
}

/** A shower now (half a day), or a dry spell (three days: the grass and fruit come back as slowly as
 *  in the hardest drought, and the meadows wither toward what a drought holds). */
export function forceWeather(w: World, kind: 'rain' | 'drought'): boolean {
  if (!w.god.on) return false;
  w.god.forced = { kind, from: w.time, until: w.time + (kind === 'rain' ? RAIN_FOR : DROUGHT_FOR) };
  log(w, 'god', kind === 'rain' ? 'rain, called down on the valley' : 'a drought, called down on the valley');
  return true;
}

/** How often a birth is mutated, against the valley's own rate (one of MUTATION_DIAL). */
export function setMutation(w: World, times: number): boolean {
  if (!w.god.on) return false;
  const x = MUTATION_DIAL.reduce((a, b) => (Math.abs(b - times) < Math.abs(a - times) ? b : a));
  if (x === w.god.mutation) return false;
  w.god.mutation = x;
  log(w, 'god', x === 0 ? 'births are no longer mutated' : x === 1 ? "births mutate at the valley's own rate again" : `births mutate at ${x}× the valley's rate`);
  return true;
}

/** Whether founding stocks lost from the valley wander back in. */
export function setImmigration(w: World, on: boolean): boolean {
  if (!w.god.on || w.god.immigration === on) return false;
  w.god.immigration = on;
  log(w, 'god', on ? 'the valley is open again: lost kinds may wander back in' : 'the valley is closed: no one wanders in any more');
  return true;
}
