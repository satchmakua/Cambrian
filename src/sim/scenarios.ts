/**
 * Scenarios — a goal that gives a valley's run a point. Each sets the valley up (its cast, a lever already
 * pulled), and each dawn says whether it has been won, lost, or neither yet. God mode is not offered in
 * one (god.ts): the goal is reached by the valley's own evolution, steered by the levers at most.
 *
 * Pure, like the rest of the simulation: a scenario's state is the world's (saved with it), and its
 * judging a function of the world.
 */
import { DAY_LENGTH, YEAR_DAYS, log, type World } from './model';
import { castOf, type CastEntry } from './cast';

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
