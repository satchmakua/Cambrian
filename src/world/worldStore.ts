/**
 * The World session — one live ecosystem, outside React.
 *
 * The simulation (src/sim/world.ts) is a mutable, deterministic object stepped from the render loop;
 * it must not live in React state (it changes 20× a second). This module owns it and exposes a small
 * zustand store for what the HUD shows: transport (running / speed), the selected creature, and a
 * throttled SNAPSHOT (populations, tallies, recent events, the selected creature's needs) refreshed a
 * few times a second.
 */
import { create } from 'zustand';
import { SOUND } from './audio';
import { NARRATOR } from './narrator';
import { loadWorld, savedPlanetSpec, saveWorld } from '../sim/persist';
import { weatherWord } from '../sim/weather';
import { adoptWorld, chronicle, snapshotForChronicle, type Chronicle } from '../sim/fastForward';
import type { Genome } from '../engine/genome';
import { randomGenome } from '../engine/random';
import { populateCast } from '../sim/cast';
import {
  AIRBORNE, createPlanet, createWorld, release, skyNow, dryNow, takeHome, bredFromHere, cloneCreature, boostSpecies, dayNumber, yearNumber, dayPhase, isNight, growthOf, speciesById, liveCount, seasonOf, DAY_LENGTH, YEAR_DAYS, type Season,
  type World, type Action, type HistorySample, type WorldEvent,
} from '../sim/world';
import { designOfSpec, PLANET_CAP, PLANET_CAPS, PLANET_PRESETS, presetById, specOf } from '../sim/planetDesign';
import { readyGround } from './planet/planetBaker';
import type { PlanetSurface } from '../sim/planetSurface';
import type { Traits } from '../sim/traits';
import { useSettings } from '../ui/settings';
import { checkSetup, DEFAULT_SETUP, type GameSetup } from '../ui/saves';
import { valleyStore } from '../ui/valleyStore';
import { scenarioById, startScenario } from '../sim/scenarios';
import type { SimHost } from './simHost';

let WORLD: World | null = null;
/** the fast-forward in flight: its worker, and whether the valley was running when it began */
let FF: { worker: Worker; wasRunning: boolean } | null = null;
let VERSION = 0; // bumps whenever the set of live creatures/corpses changes shape (re-render actors)

/** who steps the valley while its screen is open (a worker, or the page: see simHost.ts) */
let HOST: SimHost | null = null;
export function setHost(h: SimHost | null): void {
  HOST = h;
}
/** The page changed the world itself (or put another in its place): whoever steps it goes on from this. */
export function changed(): void {
  HOST?.invalidate();
}

export function getWorld(): World {
  if (!WORLD) WORLD = resumeWorld() ?? worldFromSetup(SETUP);
  return WORLD;
}

/** A new world for a game's set-up: its valley, or its planet (made from its design and the seed). */
export function worldFromSetup(setup: GameSetup): World {
  return setup.planet ? createPlanet(specOf(setup.worldSeed, setup.planet), setup.capacity) : createWorld(setup.worldSeed >>> 0, setup.capacity);
}

/** Is this world a planet (not a valley)? */
export function isPlanet(w: World): boolean {
  return w.surface.kind === 'planet';
}

/**
 * Before a game's world is put in place (installWorld): where it is a planet, have its ground baked off the
 * page's thread first (planet/planetBaker.ts), so making the world does not stall the page for the second or
 * two a bake takes. A valley's needs nothing; and a planet whose bake cannot be had there is baked on the
 * page all the same.
 */
export async function readyWorld(setup: GameSetup, json: string | null): Promise<void> {
  const spec = json !== null ? savedPlanetSpec(json) : setup.planet ? specOf(setup.worldSeed, setup.planet) : null;
  if (spec) await readyGround(spec);
}

// --- persistence: the world is kept in the browser between visits, and can be saved to a file -----

const AUTOSAVE_KEY = 'cambrian.world';
const SETUP_KEY = 'cambrian.world.setup';

/** Is this a dev page opened with query parameters (the screenshot harness)? Those start from the
 *  same fresh valley every time, whatever game the browser holds. */
function devFresh(): boolean {
  return import.meta.env.DEV && typeof location !== 'undefined' && !!location.search && !new URLSearchParams(location.search).has('resume');
}

function loadSetup(): GameSetup {
  if (devFresh()) return devSetup();
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETUP_KEY) : null;
    const v = raw ? (JSON.parse(raw) as Partial<GameSetup>) : null;
    if (v && typeof v.worldSeed === 'number' && Number.isFinite(v.worldSeed)) return checkSetup(v);
  } catch {
    /* fall through */
  }
  return { ...DEFAULT_SETUP };
}

/** (dev: ?planet=earthlike|archipelago|…, or 1 — a planet of that design in place of the valley, with
 *  ?wseed=… its seed and ?cap=… its room, for inspection shots of the game's planet) */
function devSetup(): GameSetup {
  const q = new URLSearchParams(location.search);
  const p = q.get('planet');
  if (!p) return { ...DEFAULT_SETUP };
  const cap = Number(q.get('cap'));
  return { ...DEFAULT_SETUP, worldSeed: Number(q.get('wseed') ?? 7) >>> 0, planet: { ...(presetById(p) ?? PLANET_PRESETS[0]).design }, capacity: PLANET_CAPS.includes(cap) ? cap : PLANET_CAP };
}

/** The valley's set-up: its seed, and the cast it starts with (a game's choice, kept with it). */
let SETUP: GameSetup = loadSetup();

export function worldSetup(): GameSetup {
  return SETUP;
}

function keepSetup(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SETUP_KEY, JSON.stringify(SETUP));
  } catch {
    /* ignore */
  }
}

// The valley in play is kept in the browser's IndexedDB (ui/valleyStore.ts), read once as the page loads:
// valleyReady() resolves when it has been. (A copy an older version left in localStorage is moved across.)
let RESUME: string | null = null;
const READY: Promise<void> = (async () => {
  if (typeof window === 'undefined') return;
  if (devFresh()) return readyWorld(SETUP, null);
  try {
    const old = localStorage.getItem(AUTOSAVE_KEY);
    if (old !== null) {
      await valleyStore().put(old);
      localStorage.removeItem(AUTOSAVE_KEY);
    }
  } catch {
    /* it stays where it was, and is read from there */
  }
  try {
    RESUME = await valleyStore().get();
  } catch {
    RESUME = null;
  }
  try {
    if (RESUME === null) RESUME = localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    /* no localStorage either */
  }
  // (a planet's ground baked off the page before its world is made: the World screen waits for this)
  await readyWorld(SETUP, RESUME);
})();

/** Resolves once the valley kept in the browser has been read (the World screen waits for it). */
export function valleyReady(): Promise<void> {
  return READY;
}

/** The world left running last visit, if there is one (and it still loads). Dev pages opened with
 *  query parameters (the screenshot harness) start fresh, so they stay reproducible — unless they
 *  ask to `resume`. */
function resumeWorld(): World | null {
  if (devFresh() || RESUME === null) return null;
  try {
    return loadWorld(RESUME);
  } catch {
    return null;
  } finally {
    RESUME = null; // (read once: the world is the copy from here on)
  }
}

// The valley's writes go one after another, in the order they were asked for: a game swapped in while an
// autosave of the last one is still being written must never be followed by that older valley.
let KEEPING: Promise<void> = Promise.resolve();
function keepValley(json: string | null): void {
  const store = valleyStore();
  // (a valley the store will not take is cleared instead: none at all, never the last game's beside the
  // new game's lineage; storage blocked altogether, the world simply won't be there next visit)
  KEEPING = KEEPING.then(() => (json !== null ? store.put(json).catch(() => store.clear()) : store.clear())).catch(() => undefined);
}

/** Resolves once every write of the valley asked for so far has landed (or failed). */
export function valleyKept(): Promise<void> {
  return KEEPING;
}

/** Keep the current world in the browser (called periodically and when the page is hidden). */
export function autosave(): void {
  // (a valley nobody has opened holds nothing to keep; one whose animals have all died does — it must
  // come back as it was left, not repopulated)
  if (!worldStarted()) return;
  keepValley(saveWorld(WORLD!));
}

/** Has the valley been opened (does it hold anything a save should keep)? */
function worldStarted(): boolean {
  return !!WORLD && (WORLD.creatures.length > 0 || WORLD.species.length > 0);
}

/** The valley as a save holds it: null where it was never opened (a save then keeps its set-up only).
 *  A world left in the browser by an earlier visit counts — it is read back first. */
export function worldForSave(): string | null {
  if (!WORLD) WORLD = resumeWorld();
  return worldStarted() ? saveWorld(WORLD!) : null;
}

/** Day, head-count and species of the valley, for a save's summary (null: never opened). */
export function worldSummary(): { day: number; population: number; species: number } | null {
  if (!WORLD) WORLD = resumeWorld();
  if (!worldStarted()) return null;
  const w = WORLD!;
  return { day: dayNumber(w.time), population: liveCount(w), species: w.species.filter((sp) => sp.alive > 0).length };
}

/**
 * Put a game's valley in place: the saved World where there is one, else a fresh, empty valley of
 * its set-up (populated on the first visit, with the creature then being bred). Throws — leaving
 * the current valley — if a saved World will not load.
 */
export function installWorld(setup: GameSetup, json: string | null): void {
  const next = json !== null ? loadWorld(json) : worldFromSetup(setup);
  abandonFastForward(); // (only now: a save that will not load leaves a run in progress alone)
  WORLD = next;
  changed();
  SETUP = { ...setup };
  keepSetup();
  // (the last game's valley is replaced, or cleared: Continue must never find the old game's valley beside
  // the new game's lineage — and a store that will not take the new one has none at all)
  keepValley(json);
  bumpVersion();
  // (the epoch remounts the World screen if it is the one showing: a valley not yet visited is
  // populated when the screen mounts, and a loaded one must not inherit the last one's camera or cast)
  useWorldUi.setState((u) => ({ epoch: u.epoch + 1, selected: null, follow: false, chronicle: null, running: true, snapshot: worldStarted() ? snapshotOf(next, null) : null }));
}

/**
 * Give up a fast-forward in flight, because the valley it set out from is being replaced (a game
 * loaded or started from the menu, a new or an opened world): its worker is stopped — what it was
 * computing belongs to a valley that is gone, and must never land on another — and the transport
 * goes back to what it was.
 */
function abandonFastForward(): void {
  if (!FF) return;
  FF.worker.terminate();
  const { wasRunning } = FF;
  FF = null;
  useWorldUi.setState({ ff: null, running: wasRunning });
}

/** Download the current world as a file. */
export function downloadWorld(): void {
  const w = getWorld();
  const blob = new Blob([saveWorld(w)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cambrian-${isPlanet(w) ? 'planet' : 'world'}-${w.seed}-day${dayNumber(w.time)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function worldVersion(): number {
  return VERSION;
}
export function bumpVersion(): void {
  VERSION++;
}

export interface SpeciesRow {
  id: number;
  name: string;
  kind: string;
  hue: number;
  alive: number;
  born: number;
  extinct: boolean;
  /** what its line became, if its name ended that way (shown instead of the dagger) */
  became: string | null;
  diet: string;
  /** how many of them are in the air now */
  aloft: number;
}

export interface CreatureCard {
  id: number;
  species: string;
  speciesId: number;
  action: Action;
  energy: number; // 0..1
  health: number;
  fatigue: number;
  age: number; // fraction of lifespan
  adult: boolean;
  generation: number;
  /** how well its body is made against its line's founder (0..1) */
  fit: number;
  children: number;
  kills: number;
  traits: Traits;
  genome: Genome;
  alive: boolean;
  flying: boolean; // on the wing right now
  /** the other party in what it is doing — the prey it hunts, what it flees, the carcass it eats */
  about: string | null;
  /** it has a clutch of eggs it is keeping near */
  nesting: boolean;
  /** it is going for another kind's eggs */
  raiding: boolean;
}

/** One species as a branch of the tree of life (every species ever, extinct ones included). */
export interface TreeNode {
  id: number;
  name: string;
  hue: number;
  parent: number | null;
  born: number; // sim time it was founded
  extinctAt: number | null;
  alive: number;
}

export interface Snapshot {
  tree: TreeNode[];
  season: Season;
  /** a planet's seasons, north and south (the south's half a year on); null in a valley */
  hemispheres: { north: Season; south: Season } | null;
  /** how dry this year is: 0 an ordinary year, 0.5 … 1 a drought */
  dry: number;
  /** '' when fair, else 'overcast' / 'rain' / 'downpour' / 'snow' / 'heavy snow' */
  weather: string;
  time: number;
  day: number;
  /** the year it is (YEAR_DAYS days each), from 1 */
  year: number;
  phase: number;
  night: boolean;
  pop: number;
  /** how many creatures are in the air now */
  aloft: number;
  /** god mode, and what it has set */
  god: World['god'];
  /** the levers pulled on the climate, and the events under way */
  levers: World['levers'];
  /** the scenario being played, its goal, and where it stands (null: a free valley) */
  scenario: { title: string; goal: string; progress: string; status: 'going' | 'won' | 'lost' } | null;
  species: SpeciesRow[];
  tally: World['tally'];
  events: WorldEvent[];
  history: HistorySample[];
  selected: CreatureCard | null;
}

interface WorldUi {
  /** counts the valleys put in place (a new game, a loaded save): the World screen starts afresh on each */
  epoch: number;
  running: boolean;
  speed: number;
  selected: number | null;
  follow: boolean;
  /** mood icons over the creatures (asleep, courting, alarmed, hunting) */
  emotes: boolean;
  /** synthesized ambience and creature calls (starts on the user's click — browsers require it) */
  sound: boolean;
  setSound: (v: boolean) => void;
  /** the auto-director: the camera cuts between the most interesting things happening */
  documentary: boolean;
  setDocumentary: (v: boolean) => void;
  /** the documentary's captions read aloud (browser speech synthesis) */
  narration: boolean;
  setNarration: (v: boolean) => void;
  snapshot: Snapshot | null;
  setEmotes: (v: boolean) => void;
  setRunning: (v: boolean) => void;
  setSpeed: (v: number) => void;
  /** set the subject (the camera director uses this too: it leaves the creature panel as it is) */
  select: (id: number | null) => void;
  /** a creature picked by hand (clicked, stepped to, followed from the census): selected, and its panel
   *  opened */
  pick: (id: number) => void;
  /** the selected creature's panel is showing (closed, the subject stays selected; I opens it again) */
  panel: boolean;
  setPanel: (v: boolean) => void;
  setFollow: (v: boolean) => void;
  refresh: () => void;
  /** Start a new world from a seed, populated with a starter ecosystem (and optionally `founder`). */
  reset: (seed: number, founder?: Genome | null, capacity?: number) => void;
  /** Swap in a loaded world (from a saved file): a valley or a planet, the game's set-up following it.
   *  Throws, leaving the current world, if it won't load. (A planet's ground is best made ready first:
   *  readyWorld.) */
  open: (json: string) => void;
  /** a fast-forward in progress (run in a worker): how far through, and a line of news */
  ff: { f: number; label: string } | null;
  /** what happened over the last fast-forward (shown until dismissed) */
  chronicle: (Chronicle & { span: string }) | null;
  /** run the world on `seconds` of sim time in a worker, then show what happened */
  fastForward: (seconds: number, span: string) => void;
  stopFastForward: () => void;
  dismissChronicle: () => void;
  /** Release `count` of a genome: at `at` (else where its kind can live), and — where `root`, the first
   *  genome of the breeder's lineage it was bred in, was taken home from this valley — as a branch of the
   *  species it was bred from. */
  releaseGenome: (g: Genome, count: number, at?: { x: number; z: number } | null, root?: Genome | null) => void;
  /** "take home": the valley notes where the creature came from (see takeHome) */
  takeHome: (id: number) => void;
  /** `n` copies of a living creature beside it */
  clone: (id: number, n: number) => void;
  /** `n` more of a living species, from its own stock */
  boost: (speciesId: number, n: number) => void;
  /** a release, or a creature carried in god mode, being placed by clicking the ground (null: none) */
  placing: Placing | null;
  setPlacing: (p: Placing | null) => void;
  /** a god-mode act on the valley (see sim/god.ts): run it, and show what it did */
  godAct: (act: (w: World) => boolean) => void;
  /** adopt a species' line (or let it go): the player is told when it splits, is renamed or dies out */
  adoptLine: (speciesId: number, on: boolean) => void;
  /** a line said briefly under the bar ("View 1 saved"…) — null when there is none */
  notice: string | null;
  notify: (text: string | null) => void;
  /** photo mode: the bar and the panels hidden, for framing a shot */
  photo: boolean;
  setPhoto: (v: boolean) => void;
}

/** What a click on the ground places: a release (what, how many at each click, and its breeder
 *  lineage's root), or a creature carried there in god mode. */
export type Placing = { kind: 'release'; genome: Genome; count: number; root: Genome | null } | { kind: 'carry'; id: number };

export { starterCast } from '../sim/cast';

export function populate(w: World, founder?: Genome | null, setup: GameSetup = SETUP): void {
  // (a scenario's valley is its own cast: the creature being bred is not let into it unasked)
  const sc = scenarioById(setup.scenario);
  populateCast(w, sc ? sc.cast() : setup.cast ?? setup.ecosystem);
  if (sc) startScenario(w, sc.id);
  else if (founder) release(w, founder, 6);
  if (w === WORLD) changed();
}

function aboutOf(w: World, c: World['creatures'][number]): string | null {
  if (c.action === 'hunt' || c.action === 'flee' || c.action === 'mate') {
    const o = w.creatures.find((x) => x.id === c.target && x.alive);
    return o ? speciesById(w, o.species)?.name ?? null : null;
  }
  if (c.action === 'scavenge') {
    const egg = w.eggs.find((x) => x.id === c.target);
    if (egg) return speciesById(w, egg.species)?.name ?? null;
  }
  if (c.action === 'eat' || c.action === 'scavenge') {
    const k = w.corpses.find((x) => x.id === c.target);
    return k ? speciesById(w, k.species)?.name ?? null : null;
  }
  return null;
}

export function snapshotOf(w: World, selected: number | null): Snapshot {
  const species: SpeciesRow[] = w.species
    .filter((s) => s.alive > 0 || (s.extinctAt !== null && w.time - s.extinctAt < 240))
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      hue: s.hue,
      alive: s.alive,
      born: s.born,
      extinct: s.extinctAt !== null,
      became: s.evolvedInto !== null ? speciesById(w, s.evolvedInto)?.name ?? null : null,
      diet: '',
      aloft: 0,
    }));
  const rowOf = new Map(species.map((r) => [r.id, r]));
  let aloft = 0;
  for (const c of w.creatures) {
    const row = rowOf.get(c.species);
    if (!row) continue;
    if (!row.diet) row.diet = c.traits.diet;
    if (c.alive && c.alt > AIRBORNE) {
      row.aloft++;
      aloft++;
    }
  }
  species.sort((a, b) => b.alive - a.alive);
  let card: CreatureCard | null = null;
  if (selected !== null) {
    const c = w.creatures.find((x) => x.id === selected);
    if (c) {
      const g = growthOf(c);
      card = {
        id: c.id,
        species: speciesById(w, c.species)?.name ?? '?',
        speciesId: c.species,
        action: c.action,
        energy: c.energy / (c.traits.maxEnergy * g),
        health: c.health / (c.traits.maxHealth * g),
        fatigue: c.fatigue,
        age: c.age / (c.traits.lifespan * c.lifeFactor),
        adult: c.age > c.traits.maturity,
        flying: c.alt > AIRBORNE,
        about: aboutOf(w, c),
        nesting: w.eggs.some((e) => e.mother === c.id),
        raiding: c.action === 'scavenge' && w.eggs.some((e) => e.id === c.target),
        generation: c.generation,
        fit: c.fit,
        children: c.children,
        kills: c.kills,
        traits: c.traits,
        genome: c.genome,
        alive: c.alive,
      };
    }
  }
  return {
    tree: w.species.map((sp) => ({ id: sp.id, name: sp.name, hue: sp.hue, parent: sp.parent, born: sp.firstSeen, extinctAt: sp.extinctAt, alive: sp.alive })),
    season: seasonOf(w.time),
    hemispheres: isPlanet(w) ? { north: seasonOf(w.time), south: seasonOf(w.time + (DAY_LENGTH * YEAR_DAYS) / 2) } : null,
    dry: dryNow(w),
    weather: isPlanet(w) ? planetWeather(w, selected) : weatherWord(skyNow(w)),
    time: w.time,
    day: dayNumber(w.time),
    year: yearNumber(w.time),
    phase: dayPhase(w.time),
    night: isNight(w.time),
    pop: liveCount(w),
    aloft,
    god: { ...w.god },
    levers: { ...w.levers, events: w.levers.events.map((e) => ({ ...e })) },
    scenario: (() => {
      const sc = w.scenario ? scenarioById(w.scenario.id) : null;
      return sc && w.scenario ? { title: sc.title, goal: sc.goal, progress: sc.progress(w), status: w.scenario.status } : null;
    })(),
    species,
    tally: { ...w.tally },
    events: w.events.slice(-40),
    history: w.history,
    selected: card,
  };
}

/** A planet's weather where the creature looked at is (else over the homeland), in a word. */
function planetWeather(w: World, selected: number | null): string {
  const S = w.surface as PlanetSurface;
  const now = S.seasonsNow?.(w);
  if (!now) return '';
  const c = selected !== null ? w.creatures.find((x) => x.id === selected) : undefined;
  const k = S.cellOf(c ?? { x: S.home[0] * S.ground.radius, y: S.home[1] * S.ground.radius, z: S.home[2] * S.ground.radius });
  return weatherWord({ cloud: now.cloud[k], rain: now.rain[k], snow: now.snowing[k] === 1 });
}

// The World's sound only plays while its scene is on screen (the scene says when); the options that
// outlive a visit — sound, the voice, the mood icons — are settings, kept between sessions.
let SCENE_LIVE = false;
export function worldSceneLive(live: boolean): void {
  SCENE_LIVE = live;
  if (live && useWorldUi.getState().sound) SOUND.start();
  if (!live) SOUND.stop();
}

export const useWorldUi = create<WorldUi>((set, get) => ({
  epoch: 0,
  running: true,
  speed: 1,
  selected: null,
  follow: false,
  emotes: useSettings.getState().gameplay.moods,
  sound: useSettings.getState().audio.sound,
  setSound: (sound) => {
    if (sound && SCENE_LIVE) SOUND.start();
    else if (!sound) SOUND.stop();
    if (useSettings.getState().audio.sound !== sound) useSettings.getState().setAudio({ sound });
    set({ sound });
  },
  documentary: false,
  setDocumentary: (documentary) => {
    if (!documentary) NARRATOR.setOn(false);
    else NARRATOR.setOn(get().narration);
    set({ documentary, follow: documentary ? true : get().follow });
  },
  narration: useSettings.getState().audio.narration,
  setNarration: (narration) => {
    NARRATOR.setOn(narration && get().documentary);
    if (useSettings.getState().audio.narration !== narration) useSettings.getState().setAudio({ narration });
    set({ narration });
  },
  snapshot: null,
  setEmotes: (emotes) => {
    if (useSettings.getState().gameplay.moods !== emotes) useSettings.getState().setGameplay({ moods: emotes });
    set({ emotes });
  },
  setRunning: (running) => set({ running }),
  setSpeed: (speed) => set({ speed }),
  select: (selected) => set({ selected, follow: selected !== null ? get().follow : false, snapshot: snapshotOf(getWorld(), selected) }),
  pick: (id) => {
    get().select(id);
    set({ panel: true });
  },
  panel: true,
  setPanel: (panel) => set({ panel }),
  setFollow: (follow) => set({ follow }),
  refresh: () => set({ snapshot: snapshotOf(getWorld(), get().selected) }),
  reset: (seed, founder, capacity) => {
    abandonFastForward();
    // (a new world from the World screen keeps the game's cast and size but takes the new seed as its own)
    SETUP = { ...SETUP, worldSeed: seed >>> 0, ...(capacity ? { capacity } : {}) };
    WORLD = worldFromSetup(SETUP);
    keepSetup();
    populate(WORLD, founder);
    bumpVersion();
    set({ selected: null, follow: false, chronicle: null, snapshot: snapshotOf(WORLD, null) });
  },
  open: (json) => {
    const next = loadWorld(json); // (throws, with nothing changed, if it will not load)
    abandonFastForward();
    WORLD = next;
    changed();
    // (the game's set-up follows the world opened — a planet's design and seed, or a valley's seed — so a new
    // world made from it is of the same kind)
    const S = next.surface as Partial<PlanetSurface>;
    const { planet: _was, ...rest } = SETUP;
    SETUP = S.kind === 'planet' && S.ground ? { ...rest, worldSeed: next.seed, planet: designOfSpec({ ...S.ground, tilt: S.tilt }) } : { ...rest, worldSeed: next.seed };
    keepSetup();
    bumpVersion();
    // (the epoch remounts the World screen: a planet opened over a valley is drawn by another scene)
    set((u) => ({ epoch: u.epoch + 1, selected: null, follow: false, chronicle: null, snapshot: snapshotOf(WORLD!, null) }));
  },
  ff: null,
  chronicle: null,
  fastForward: (seconds, span) => {
    if (get().ff) return;
    const w = getWorld();
    const before = snapshotForChronicle(w);
    const wasRunning = get().running;
    changed(); // (a frame on its way would change the valley the run set out from)
    set({ ff: { f: 0, label: '' }, running: false, chronicle: null });
    const worker = new Worker(new URL('./ffWorker.ts', import.meta.url), { type: 'module' });
    FF = { worker, wasRunning };
    /** The run is over (done, failed or refused): stop the worker and hand the valley back. */
    const end = (patch: Partial<WorldUi> = {}) => {
      worker.terminate();
      FF = null;
      set({ ff: null, running: wasRunning, ...patch });
    };
    worker.onmessage = (e: MessageEvent) => {
      // (a run that was abandoned — or one whose valley is no longer the live one — has nothing to say)
      if (FF?.worker !== worker) return;
      const m = e.data as { type: string; f?: number; time?: number; pop?: number; species?: number; json?: string; message?: string };
      if (m.type === 'progress') {
        set({ ff: { f: m.f ?? 0, label: `Day ${dayNumber(m.time ?? 0)} · ${m.pop} alive · ${m.species} species` } });
      } else if (m.type === 'done' && m.json) {
        if (WORLD !== w) return end();
        try {
          adoptWorld(w, loadWorld(m.json));
        } catch {
          return end(); // (a result that will not read back: the valley stays as it was)
        }
        changed();
        bumpVersion();
        const sel = get().selected;
        const keep = sel !== null && w.creatures.some((c) => c.id === sel) ? sel : null;
        end({ selected: keep, follow: keep !== null && get().follow, chronicle: { ...chronicle(before, w), span }, snapshot: snapshotOf(w, keep) });
      } else if (m.type === 'error' || m.type === 'done') {
        end();
      }
    };
    // (a worker that cannot start or dies — a script that fails to load — must not leave the valley
    // stopped behind "Time passes…" for good)
    worker.onerror = () => {
      if (FF?.worker === worker) end();
    };
    worker.postMessage({ type: 'run', json: saveWorld(w), seconds });
  },
  stopFastForward: () => FF?.worker.postMessage({ type: 'stop' }),
  dismissChronicle: () => set({ chronicle: null }),
  releaseGenome: (g, count, at, root) => {
    const w = getWorld();
    const from = root ? bredFromHere(w, root) : null;
    release(w, g, count, at ?? undefined, undefined, from ?? undefined);
    changed();
    bumpVersion();
    get().refresh();
  },
  takeHome: (id) => {
    const w = getWorld();
    const c = w.creatures.find((x) => x.id === id);
    if (c) {
      takeHome(w, c);
      changed();
    }
  },
  clone: (id, n) => {
    const w = getWorld();
    const c = w.creatures.find((x) => x.id === id && x.alive);
    if (!c || cloneCreature(w, c, n).length === 0) return;
    changed();
    bumpVersion();
    get().refresh();
  },
  boost: (speciesId, n) => {
    const w = getWorld();
    const sp = speciesById(w, speciesId);
    if (!sp || boostSpecies(w, sp, n).length === 0) return;
    changed();
    bumpVersion();
    get().refresh();
  },
  placing: null,
  setPlacing: (placing) => set({ placing }),
  notice: null,
  notify: (notice) => set({ notice }),
  adoptLine: (speciesId, on) => {
    const w = getWorld();
    const had = w.adopted.includes(speciesId);
    if (on === had) return;
    w.adopted = on ? [...w.adopted, speciesId] : w.adopted.filter((x) => x !== speciesId);
    changed();
    const sp = speciesById(w, speciesId);
    if (sp) get().notify(on ? `${sp.name}: your line now — you will be told when it splits, changes or dies out` : `${sp.name} is no longer your line`);
    get().refresh();
  },
  photo: false,
  setPhoto: (photo) => set({ photo }),
  godAct: (act) => {
    if (!act(getWorld())) return;
    changed();
    bumpVersion();
    get().refresh();
  },
}));

// the options screen changes these too: follow the settings (volume straight to the mixers)
SOUND.setVolume(useSettings.getState().audio.volume);
NARRATOR.setVolume(useSettings.getState().audio.volume);
useSettings.subscribe((s) => {
  SOUND.setVolume(s.audio.volume);
  NARRATOR.setVolume(s.audio.volume);
  const ui = useWorldUi.getState();
  if (ui.sound !== s.audio.sound) ui.setSound(s.audio.sound);
  if (ui.narration !== s.audio.narration) ui.setNarration(s.audio.narration);
  if (ui.emotes !== s.gameplay.moods) ui.setEmotes(s.gameplay.moods);
});

/** A random visitor for the "release a stranger" button. */
export function strangerGenome(seed: number): Genome {
  return randomGenome(seed >>> 0);
}
