/**
 * Scenarios — a goal that gives a valley's run a point. Each sets the valley up (its cast, a lever already
 * pulled), and each dawn says whether it has been won, lost, or neither yet. God mode is not offered in
 * one (god.ts): the goal is reached by the valley's own evolution, steered by the levers at most.
 *
 * Pure, like the rest of the simulation: a scenario's state is the world's (saved with it), and its
 * judging a function of the world.
 */
import { DAY_LENGTH, YEAR_DAYS, log, type Creature, type World } from './model';
import { castOf, type CastEntry } from './cast';
import { PLANET_PRESETS, type PlanetDesign } from './planetDesign';
import type { PlanetSurface } from './planetSurface';

const YEAR = DAY_LENGTH * YEAR_DAYS;
const yearOf = (w: World) => Math.floor(w.time / YEAR) + 1;

export interface Scenario {
  id: string;
  title: string;
  /** the goal, in a sentence */
  goal: string;
  /** the valley's starting cast */
  cast: () => CastEntry[];
  /** anything else set up at the start (a lever already pulled, an event set for later) */
  start?: (w: World) => void;
  /** at each dawn: won, lost, or neither yet (null) */
  judge: (w: World) => 'won' | 'lost' | null;
  /** where it stands, in a line */
  progress: (w: World) => string;
  /** played only on a planet (absent: anywhere), and the planet it is best played on (the designer starts
   *  from it, and may move on) */
  planetOnly?: boolean;
  planet?: PlanetDesign;
}

/** the living, by what they eat: plant-eaters (grazers, browsers, filter-feeders, nectar-drinkers), omnivores, hunters */
function levels(w: World): { plants: number; omni: number; hunters: number } {
  const n = { plants: 0, omni: 0, hunters: 0 };
  for (const c of w.creatures) {
    if (!c.alive) continue;
    const d = c.traits.diet;
    if (d === 'carnivore') n.hunters++;
    else if (d === 'omnivore') n.omni++;
    else n.plants++;
  }
  return n;
}
const speciesAlive = (w: World) => w.species.filter((s) => s.alive > 0).length;
/** Is a species of a line the valley started with (not one released into it since)? */
function ownLine(w: World, id: number): boolean {
  let sp = w.species.find((s) => s.id === id);
  for (let i = 0; sp && sp.parent !== null && i < 256; i++) sp = w.species.find((s) => s.id === sp!.parent);
  return !!sp && !!w.scenario && sp.firstSeen <= w.scenario.from;
}

const ICE_FROM = 3, ICE_YEARS = 4, ICE_SPECIES = 5;

/** A world's planet, or null in a valley. */
const planetOf = (w: World): PlanetSurface | null => (w.surface.kind === 'planet' ? (w.surface as PlanetSurface) : null);
/** a walker: a land animal that neither flies nor glides (an amphibious one counts: it swims, it walks) */
const walker = (c: Creature) => c.alive && c.traits.habitat !== 'water' && !c.traits.flies && !c.traits.glides;

const ACROSS_YEARS = 40, ACROSS_NEEDED = 6;
/** an own line's walkers living on a land none of the founders stood on (a homeland can take in several
 *  islands of a sea of them) */
function across(w: World): number {
  const S = planetOf(w);
  if (!S) return 0;
  const from = new Set(w.scenario?.lands ?? [S.homeLand]);
  let n = 0;
  for (const c of w.creatures) {
    if (!walker(c) || !ownLine(w, c.species)) continue;
    const land = S.landOf(c);
    if (land >= 0 && !from.has(land)) n++;
  }
  return n;
}

const ICECAP_YEARS = 40, ICECAP_NEEDED = 6, ICECAP_BELOW = -6;
/** an own line's land animals living where the year's mean is below the ice cap's line */
function onTheIce(w: World): number {
  const S = planetOf(w);
  if (!S) return 0;
  let n = 0;
  for (const c of w.creatures) if (c.alive && c.traits.habitat !== 'water' && ownLine(w, c.species) && S.warmthAt(c) < ICECAP_BELOW) n++;
  return n;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'three-levels',
    title: 'Three levels for a century',
    goal: 'Keep plant-eaters, omnivores and hunters all alive for a hundred years.',
    cast: () => castOf('standard'),
    judge: (w) => {
      const n = levels(w);
      if (n.plants === 0 || n.omni === 0 || n.hunters === 0) return 'lost';
      return yearOf(w) > 100 ? 'won' : null;
    },
    progress: (w) => {
      const n = levels(w);
      return `year ${Math.min(100, yearOf(w))} of 100 · ${n.plants} plant-eaters, ${n.omni} omnivores, ${n.hunters} hunters`;
    },
  },
  {
    id: 'ice-age',
    title: 'Through the ice age',
    goal: `An ice age comes in year ${ICE_FROM + 1} and lasts ${ICE_YEARS} years. Bring at least ${ICE_SPECIES} species through it.`,
    cast: () => castOf('standard'),
    start: (w) => {
      w.levers.events.push({ kind: 'ice-age', from: ICE_FROM * YEAR, until: (ICE_FROM + ICE_YEARS) * YEAR });
    },
    judge: (w) => {
      if (speciesAlive(w) < ICE_SPECIES && w.time >= ICE_FROM * YEAR) return 'lost';
      return w.time >= (ICE_FROM + ICE_YEARS) * YEAR ? 'won' : null;
    },
    progress: (w) => {
      const t = w.time / YEAR;
      const when = t < ICE_FROM ? `the ice comes in year ${ICE_FROM + 1}` : t < ICE_FROM + ICE_YEARS ? `the ice age, year ${Math.floor(t - ICE_FROM) + 1} of ${ICE_YEARS}` : 'the ice has gone';
      return `${when} · ${speciesAlive(w)} species alive (${ICE_SPECIES} needed)`;
    },
  },
  {
    id: 'take-wing',
    title: 'A walker takes wing',
    goal: 'A valley with no wing in it: evolve something that flies, or glides, within sixty years.',
    // (the starter cast without its birds: nothing in it has wings, nor skin between its legs)
    cast: () => castOf('standard').filter((e) => e.kind !== 'bird'),
    // (only a line of the valley's own counts: an animal released into it later was not evolved here)
    judge: (w) => {
      if (w.creatures.some((c) => c.alive && (c.traits.flies || c.traits.glides) && ownLine(w, c.species))) return 'won';
      return yearOf(w) > 60 ? 'lost' : null;
    },
    progress: (w) => {
      let best = 0;
      for (const c of w.creatures) if (c.alive) best = Math.max(best, c.traits.lift);
      return `year ${Math.min(60, yearOf(w))} of 60 · the most lift any body has: ${best.toFixed(2)} (a glide takes 0.4)`;
    },
  },
  {
    id: 'across',
    title: 'Across the water',
    goal: `A sea of islands: bring ${ACROSS_NEEDED} walkers of your own lines to live on an island none of the founders stood on, within ${ACROSS_YEARS} years — over the shallows, or a sea lowered into land bridges.`,
    planetOnly: true,
    planet: PLANET_PRESETS.find((p) => p.id === 'archipelago')!.design,
    cast: () => castOf('standard'),
    // (the lands the founders stand on at the start: the islands to cross from)
    start: (w) => {
      const S = planetOf(w);
      if (S && w.scenario) w.scenario.lands = [...new Set(w.creatures.filter((c) => c.alive).map((c) => S.landOf(c)).filter((l) => l >= 0))].sort((a, b) => a - b);
    },
    judge: (w) => (across(w) >= ACROSS_NEEDED ? 'won' : yearOf(w) > ACROSS_YEARS ? 'lost' : null),
    progress: (w) => `year ${Math.min(ACROSS_YEARS, yearOf(w))} of ${ACROSS_YEARS} · ${across(w)} of your walkers on other islands (${ACROSS_NEEDED} needed)`,
  },
  {
    id: 'ice-cap',
    title: 'Life on the ice',
    goal: `Bring ${ICECAP_NEEDED} land animals of your own lines to live where the year's mean is below ${ICECAP_BELOW}° — the ice caps and the coldest tundra — within ${ICECAP_YEARS} years.`,
    planetOnly: true,
    cast: () => castOf('standard'),
    judge: (w) => (onTheIce(w) >= ICECAP_NEEDED ? 'won' : yearOf(w) > ICECAP_YEARS ? 'lost' : null),
    progress: (w) => `year ${Math.min(ICECAP_YEARS, yearOf(w))} of ${ICECAP_YEARS} · ${onTheIce(w)} of your animals on the ice (${ICECAP_NEEDED} needed)`,
  },
];

export function scenarioById(id: string | null | undefined): Scenario | null {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

/** Begin a valley as a scenario (its cast already released). */
export function startScenario(w: World, id: string): void {
  const sc = scenarioById(id);
  if (!sc) return;
  w.scenario = { id, status: 'going', from: w.time };
  sc.start?.(w);
  log(w, 'goal', `the goal: ${sc.goal}`);
}

/** At each dawn: has the scenario been won or lost? (Told once, in the journal.) */
export function judgeScenario(w: World): void {
  const s = w.scenario;
  if (!s || s.status !== 'going') return;
  const sc = scenarioById(s.id);
  const r = sc?.judge(w);
  if (!sc || !r) return;
  s.status = r;
  log(w, 'goal', r === 'won' ? `won: ${sc.title.toLowerCase()} — ${sc.progress(w)}` : `lost: ${sc.title.toLowerCase()} — ${sc.progress(w)}`);
}
