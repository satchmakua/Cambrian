/**
 * The World — a deterministic ecosystem the evolved creatures live, eat, sleep, breed and die in.
 *
 * Every creature is a grown genome with traits read off its anatomy (traits.ts). Each one carries
 * needs — energy (hunger), fatigue (sleep), health, age — and every half-second or so chooses what to
 * do from them and from what it can see:
 *
 *   flee    a predator is in sight                     (overrides everything, wakes a sleeper)
 *   sleep   tired, and it's its night (diurnal) or day (nocturnal)
 *   eat     hungry — graze the meadow, pick fruit, filter algae, scavenge a corpse, or HUNT
 *   breed   well-fed adult with a willing mate of its species nearby (some kinds bud alone)
 *   wander  otherwise — drifting, herd animals keeping close to their own kind
 *
 * Breeding copies the parent's genome — and with some probability MUTATES it with the breeder's own
 * operators. When a lineage drifts far enough in morphospace from its species' founder, it is a new
 * species. So natural selection, drift and speciation happen on screen, on the same bodies you breed.
 *
 * The plants are a grass biomass field over the meadows and woods, algae in the lake, and fruit
 * bushes in the woods; carcasses rot. Determinism: all randomness flows from the world's seeded
 * mulberry32 and the engine's seeded mutate(); a fixed step reproduces a run exactly (Pillar 3).
 */

// (the simulation is split by concern — model, species, population, behaviour, motion, fields — and this
// module steps it; every name the game reads is exported here, as it always was)
export { AIRBORNE, aName, bodyOf, climate, climateOf, COURT_TIME, DAY_LENGTH, dayNumber, dayPhase, dryNow, growthOf, isNight, leverSnow, liveCount, log, MAX_POP, nearby, seasonal, seasonOf, skyNow, SPECIATION_DIST, speciesById, SPLIT_DIST, STEP, YEAR_DAYS, yearNumber, yearPhase } from './model';
export type { Action, Corpse, Creature, DeathCause, DeathTally, Egg, FilmFrame, Forced, HistorySample, LeverEvent, LeverEventKind, Levers, Plant, Season, Species, TrendSample, World, WorldEvent } from './model';
export { fitOf, lineRoot, TREND_EVERY, TREND_MAX } from './species';
export { boostSpecies, bredFromHere, breedNow, cloneCreature, killCreature, release, takeHome } from './population';
export { preysOn } from './behaviour';
export { footprintGap } from './motion';
import { biomeAt, makeTerrain } from './terrain';
import { droughtOf } from './weather';
import { mix32, mulberry32State } from '../engine/rng';
import { DAY_LENGTH, GRID_CELL, log, MAX_POP, rebuildBuckets, STEP, YEAR_DAYS, type World } from './model';
import { immigrate, sampleTrends, speciateDaily, TREND_EVERY } from './species';
import { hatch } from './population';
import { live } from './behaviour';
import { keepRoom } from './motion';
import { growFields, sampleHistory } from './fields';
import { runLevers } from './levers';
import { judgeScenario } from './scenarios';

// --- construction --------------------------------------------------------------------------------

export function createWorld(seed: number, cap: number = MAX_POP): World {
  const terrain = makeTerrain(seed);
  const rng = mulberry32State(mix32(seed, 0x3c0105));
  const gridN = Math.ceil(terrain.size / GRID_CELL);
  const grass = new Float32Array(gridN * gridN);
  const grassCap = new Float32Array(gridN * gridN);
  const algae = new Float32Array(gridN * gridN);
  const algaeCap = new Float32Array(gridN * gridN);
  for (let j = 0; j < gridN; j++) {
    for (let i = 0; i < gridN; i++) {
      const x = -terrain.size / 2 + (i + 0.5) * GRID_CELL;
      const z = -terrain.size / 2 + (j + 0.5) * GRID_CELL;
      const b = biomeAt(terrain, x, z);
      const k = j * gridN + i;
      grassCap[k] = b === 'meadow' ? 0.6 : b === 'wood' ? 0.32 : b === 'sand' ? 0.05 : 0;
      algaeCap[k] = b === 'shallow' ? 1.25 : b === 'deep' ? 0.8 : 0;
      grass[k] = grassCap[k] * (0.6 + 0.4 * rng());
      algae[k] = algaeCap[k] * (0.6 + 0.4 * rng());
    }
  }
  const world: World = {
    seed,
    rng,
    time: DAY_LENGTH * 0.08, // start just after dawn
    terrain,
    gridN,
    grass,
    grassCap,
    algae,
    algaeCap,
    plants: [],
    creatures: [],
    corpses: [],
    eggs: [],
    species: [],
    nextId: 1,
    events: [],
    homes: [],
    god: { on: false, mutation: 1, immigration: true, forced: null },
    cap,
    adopted: [],
    levers: { warmth: 0, rain: 1, events: [] },
    scenario: null,
    history: [],
    historyTimer: 0,
    fieldTimer: 0,
    stepCount: 0,
    tally: { births: 0, kills: 0, starvation: 0, oldAge: 0, mutations: 0, speciations: 0, stillborn: 0 },
    buckets: new Map(),
  };
  // fruit bushes: dense in the woods, scattered across the meadows
  let tries = 0;
  while (world.plants.length < 170 && tries++ < 8000) {
    const x = (rng() - 0.5) * terrain.size * 0.94;
    const z = (rng() - 0.5) * terrain.size * 0.94;
    const b = biomeAt(terrain, x, z);
    if (b !== 'wood' && !(b === 'meadow' && rng() < 0.25)) continue;
    const max = 3 + Math.floor(rng() * 5);
    world.plants.push({ id: world.nextId++, x, z, fruit: max * rng(), max, size: 0.8 + rng() * 0.9 });
  }
  return world;
}

// --- the step ------------------------------------------------------------------------------------

export function stepWorld(w: World, dt = STEP): void {
  const day = Math.floor(w.time / DAY_LENGTH);
  w.time += dt;
  w.stepCount++;
  if (Math.floor(w.time / DAY_LENGTH) !== day) {
    speciateDaily(w);
    immigrate(w);
    judgeScenario(w);
    // a dry year is told at its first dawn
    const d = day + 1;
    if (d % YEAR_DAYS === 0 && droughtOf(w.seed, w.time) > 0) log(w, 'climate', droughtOf(w.seed, w.time) > 0.8 ? 'a hard drought: the rains have failed' : 'a dry year: the rains are failing');
  }
  // the species' trends, every quarter day (before the step: a new species' first sample is its founders)
  if (Math.floor(w.time / TREND_EVERY) !== Math.floor((w.time - dt) / TREND_EVERY)) sampleTrends(w);
  runLevers(w);
  rebuildBuckets(w);
  for (const c of w.creatures) if (c.alive) live(w, c, dt);
  keepRoom(w, dt);
  // the dead are kept one step for the viewer's fade, then culled
  w.creatures = w.creatures.filter((c) => c.alive);
  // eggs hatch
  if (w.eggs.length) hatch(w);
  // carcasses rot
  for (const k of w.corpses) k.rot -= dt;
  w.corpses = w.corpses.filter((k) => k.rot > 0 && k.meat > 0.5);
  // plants grow (the fields are slow — update them once a second)
  w.fieldTimer += dt;
  if (w.fieldTimer >= 1) {
    growFields(w, w.fieldTimer);
    w.fieldTimer = 0;
  }
  // a population sample every 5 s
  w.historyTimer += dt;
  if (w.historyTimer >= 5) {
    w.historyTimer = 0;
    sampleHistory(w);
  }
}

/** A cheap deterministic fingerprint of the world state (for replay tests). */
export function worldHash(w: World): number {
  let h = mix32(w.stepCount, w.creatures.length, w.corpses.length, w.species.length, w.eggs.length);
  for (const c of w.creatures) h = mix32(h, c.id, Math.round(c.x * 1000), Math.round(c.z * 1000), Math.round(c.energy * 10));
  return h >>> 0;
}
