/**
 * Settings — the player's options, kept in the browser between visits.
 *
 * Three groups: GRAPHICS (how much is drawn, and how finely), AUDIO and GAMEPLAY. The graphics options
 * are what a player sees; what the renderers read is the `RenderQuality` derived from them by
 * `qualityOf` — one object of concrete budgets (pixel-ratio cap, shadow-map size, how many grass tufts
 * and raindrops, how far creatures keep their detail). Every renderer asks that object and nothing
 * else, so a new optimisation is one more field there and one reader; the three presets are just
 * rows of the same table.
 *
 * The game may also lower the graphics itself, once, on a machine that cannot draw them (`autoLower`:
 * no graphics card, or frames measured slow) — it says so (`notice`), and never again overrides an
 * option the player has set by hand. And a page opened with ?safe=1 is in SAFE MODE: the lowest
 * graphics for that visit only, and nothing changed during it is written to the browser.
 *
 * Everything here but the store itself is pure (sanitising a stored blob, naming the preset a set of
 * options matches, deriving the budgets), and tested headlessly.
 */
import { create } from 'zustand';

export const SETTINGS_KEY = 'cambrian.settings.v1';

export type QualityPreset = 'low' | 'medium' | 'high';
export type CreatureDetail = 'low' | 'medium' | 'high';

export interface GraphicsSettings {
  /** the named level these options came from — 'custom' once one of them was changed by hand */
  preset: QualityPreset | 'custom';
  /** the cap on the device pixel ratio: 0.75 (fastest) … 2 (sharpest) */
  renderScale: number;
  shadows: boolean;
  /** how much of the grass and the flowers is drawn: 0.25 … 1 */
  vegetation: number;
  /** how much of the rain, the snow and the insects is drawn: 0.25 … 1 */
  weather: number;
  creatureDetail: CreatureDetail;
  /** the game may lower the quality itself on a machine that draws slowly — until the player sets a
   *  graphics option by hand, which it then leaves alone */
  auto: boolean;
}

/** The graphics options a level sets (everything but its name and the `auto` switch). */
export type GraphicsOptions = Omit<GraphicsSettings, 'preset' | 'auto'>;

export interface AudioSettings {
  /** the World's ambience and calls (starts on a click — browsers require one) */
  sound: boolean;
  /** master volume, 0 … 1 */
  volume: number;
  /** the documentary's captions read aloud */
  narration: boolean;
}

export interface GameplaySettings {
  /** how often the running world is kept, in minutes (0: only when leaving) */
  autosaveMinutes: number;
  /** mood icons over the World's creatures */
  moods: boolean;
  /** on-screen hints (the World's camera controls) */
  hints: boolean;
  /** the breeder's turntable turns on its own */
  spin: boolean;
}

/** Why the game lowered the graphics itself: the browser draws without a graphics card, or the first
 *  frames were measured slow. */
export type LoweredReason = 'software' | 'slow';

/** What the game did to the graphics on its own, and whether the player has been told. */
export interface GraphicsNotice {
  lowered: LoweredReason | null;
  seen: boolean;
}

export interface Settings {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  gameplay: GameplaySettings;
  notice: GraphicsNotice;
}

export const RENDER_SCALES = [0.75, 1, 1.5, 2] as const;
export const DENSITIES = [0.25, 0.5, 0.75, 1] as const;
export const AUTOSAVE_MINUTES = [0, 1, 5, 10] as const;

/** The three named levels. `high` is the game as it was before there were settings. */
export const PRESETS: Record<QualityPreset, GraphicsOptions> = {
  low: { renderScale: 1, shadows: false, vegetation: 0.25, weather: 0.5, creatureDetail: 'low' },
  medium: { renderScale: 1.5, shadows: true, vegetation: 0.75, weather: 0.75, creatureDetail: 'medium' },
  high: { renderScale: 2, shadows: true, vegetation: 1, weather: 1, creatureDetail: 'high' },
};

export const DEFAULT_SETTINGS: Settings = {
  graphics: { preset: 'high', ...PRESETS.high, auto: true },
  audio: { sound: false, volume: 0.7, narration: false },
  gameplay: { autosaveMinutes: 1, moods: true, hints: true, spin: true },
  notice: { lowered: null, seen: false },
};

/** Safe mode's graphics: the least of everything. */
export const SAFE_GRAPHICS: GraphicsOptions = { ...PRESETS.low, renderScale: 0.75, weather: 0.25 };

/** Does this page address (its query string) ask for safe mode? */
export function isSafeUrl(search: string): boolean {
  return new URLSearchParams(search).get('safe') === '1';
}

/** Safe mode, for this visit: asked for by the address alone, and never kept. */
export const SAFE = typeof location !== 'undefined' && isSafeUrl(location.search);

/** Which named level these options are, or 'custom'. */
export function presetOf(g: GraphicsOptions): QualityPreset | 'custom' {
  for (const name of ['low', 'medium', 'high'] as const) {
    const p = PRESETS[name];
    if (p.renderScale === g.renderScale && p.shadows === g.shadows && p.vegetation === g.vegetation && p.weather === g.weather && p.creatureDetail === g.creatureDetail) return name;
  }
  return 'custom';
}

const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const nearest = (v: number, choices: readonly number[]): number => choices.reduce((b, c) => (Math.abs(c - v) < Math.abs(b - v) ? c : b), choices[0]);

/**
 * Settings from whatever was stored: every field checked and clamped, anything missing or malformed
 * taking its default — an old or a hand-edited blob can never put the game in a state the options
 * screen can't show.
 */
export function sanitize(raw: unknown): Settings {
  const D = DEFAULT_SETTINGS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as { graphics?: Record<string, unknown>; audio?: Record<string, unknown>; gameplay?: Record<string, unknown>; notice?: Record<string, unknown> };
  const g = r.graphics ?? {};
  const a = r.audio ?? {};
  const p = r.gameplay ?? {};
  const n = r.notice ?? {};
  const detail = g.creatureDetail === 'low' || g.creatureDetail === 'medium' || g.creatureDetail === 'high' ? g.creatureDetail : D.graphics.creatureDetail;
  const graphics = {
    renderScale: nearest(num(g.renderScale, 0.5, 3, D.graphics.renderScale), RENDER_SCALES),
    shadows: bool(g.shadows, D.graphics.shadows),
    vegetation: nearest(num(g.vegetation, 0, 1, D.graphics.vegetation), DENSITIES),
    weather: nearest(num(g.weather, 0, 1, D.graphics.weather), DENSITIES),
    creatureDetail: detail,
  };
  const preset = presetOf(graphics);
  return {
    // (options kept before there was an `auto`: the game may adjust them only if they are still the
    // defaults — anything else is a choice the player made, and stays as it is)
    graphics: { preset, ...graphics, auto: bool(g.auto, preset === D.graphics.preset) },
    audio: { sound: bool(a.sound, D.audio.sound), volume: num(a.volume, 0, 1, D.audio.volume), narration: bool(a.narration, D.audio.narration) },
    gameplay: {
      autosaveMinutes: nearest(num(p.autosaveMinutes, 0, 60, D.gameplay.autosaveMinutes), AUTOSAVE_MINUTES),
      moods: bool(p.moods, D.gameplay.moods),
      hints: bool(p.hints, D.gameplay.hints),
      spin: bool(p.spin, D.gameplay.spin),
    },
    notice: { lowered: n.lowered === 'software' || n.lowered === 'slow' ? n.lowered : null, seen: bool(n.seen, D.notice.seen) },
  };
}

// --- what the renderers read ---------------------------------------------------------------------

/** Concrete budgets, derived from the graphics options. Add a field here to give a renderer a new
 *  dial; `qualityOf` decides what each level sets it to. */
export interface RenderQuality {
  /** canvases cap their pixel ratio here (and at their own ceiling) */
  dprMax: number;
  shadows: boolean;
  /** the World sun's shadow map, px a side */
  shadowMap: number;
  /** grass tufts and flowers scattered over the valley */
  grass: number;
  flowers: number;
  /** rain streaks / snowflakes */
  precipitation: number;
  /** midges and butterflies, as a fraction of the full swarm */
  ambient: number;
  stars: number;
  /** × the distances at which a World creature keeps its full and its simplified detail */
  lod: number;
  /** World creatures near the camera wear their fine skin */
  fineSkins: boolean;
  /** the breeder's hero creature's skin */
  heroSkin: 'high' | 'low';
  /** the hero's soft ground shadow, px a side (0: none) */
  contactShadow: number;
  /** a coat's relief (scales, plates, feathers) is lit from its slope measured at every pixel — clean
   *  edges, at three times the relief's cost — rather than once per 2x2 block of pixels */
  fineRelief: boolean;
  /** layers of shell fur over a furred coat in the close-up views (0: none — the painted coat alone).
   *  Each is one more pass of the whole body: on a slow machine, most of a frame */
  furShells: number;
}

const FULL = { grass: 17000, flowers: 900, precipitation: 9000, stars: 2500 };

export function qualityOf(g: GraphicsOptions): RenderQuality {
  const detail = g.creatureDetail;
  return {
    dprMax: g.renderScale,
    shadows: g.shadows,
    shadowMap: g.shadows ? (g.renderScale >= 1.5 ? 2048 : 1024) : 0,
    grass: Math.round(FULL.grass * g.vegetation),
    flowers: Math.round(FULL.flowers * g.vegetation),
    precipitation: Math.round(FULL.precipitation * g.weather),
    ambient: g.weather,
    stars: Math.round(FULL.stars * (0.4 + 0.6 * g.weather)),
    lod: detail === 'high' ? 1 : detail === 'medium' ? 0.75 : 0.55,
    fineSkins: detail === 'high',
    heroSkin: detail === 'low' ? 'low' : 'high',
    contactShadow: g.shadows ? (g.renderScale >= 1.5 ? 512 : 256) : 0,
    fineRelief: detail !== 'low',
    furShells: detail === 'low' ? 0 : 12,
  };
}

/** A canvas's pixel-ratio prop: the display's own ratio, between 1 and the cap (a cap under 1 is a
 *  fixed, coarser buffer). `ceiling` is the canvas's own limit — a litter of nine needs less than a hero. */
export function dprOf(q: RenderQuality, ceiling = 2): number | [number, number] {
  const cap = Math.min(q.dprMax, ceiling);
  return cap < 1 ? cap : [1, cap];
}

// --- the store ---------------------------------------------------------------------------------

function load(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null;
    if (raw) return sanitize(JSON.parse(raw));
  } catch {
    /* unreadable: start from the defaults */
  }
  return sanitize(null);
}

function keep(s: Settings): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify({ graphics: s.graphics, audio: s.audio, gameplay: s.gameplay, notice: s.notice }));
  } catch {
    /* storage full or blocked: the options last until the page closes */
  }
}

interface SettingsStore extends Settings {
  quality: RenderQuality;
  /** apply a named level (all the graphics options at once) */
  setPreset: (p: QualityPreset) => void;
  /** change some graphics options by hand (the preset becomes whatever they now match) */
  setGraphics: (patch: Partial<GraphicsOptions>) => void;
  /** let the game adjust the quality itself on a slow machine, or not */
  setAuto: (on: boolean) => void;
  /**
   * The game lowers the quality itself: to the Low level, with a notice saying why. Only while `auto`
   * is on and the level is not Low already — so it happens once, and never over a player's own choice.
   * Returns whether anything changed.
   */
  autoLower: (reason: LoweredReason) => boolean;
  /** the player has read the notice */
  dismissNotice: () => void;
  setAudio: (patch: Partial<AudioSettings>) => void;
  setGameplay: (patch: Partial<GameplaySettings>) => void;
  resetDefaults: () => void;
}

/**
 * The settings store. In safe mode it starts from the lowest graphics whatever is kept, the game
 * adjusts nothing itself, and nothing is written: the visit leaves the kept options as it found them.
 */
export function createSettingsStore(safe = false) {
  return create<SettingsStore>((set, get) => {
    const apply = (next: Settings) => {
      const clean = sanitize(next);
      if (!safe) keep(clean);
      set({ ...clean, quality: qualityOf(clean.graphics) });
    };
    const current = (): Settings => ({ graphics: get().graphics, audio: get().audio, gameplay: get().gameplay, notice: get().notice });
    const kept = load();
    const initial: Settings = safe ? { ...kept, graphics: { preset: presetOf(SAFE_GRAPHICS), ...SAFE_GRAPHICS, auto: false } } : kept;
    return {
      ...initial,
      quality: qualityOf(initial.graphics),
      // (a level or an option set by hand is the player's choice: the game stops adjusting — and
      // its notice of what it had set is out of date, so it is not shown after)
      setPreset: (p) => apply({ ...current(), graphics: { preset: p, ...PRESETS[p], auto: false }, notice: { ...get().notice, seen: true } }),
      setGraphics: (patch) => apply({ ...current(), graphics: { ...get().graphics, ...patch, auto: false }, notice: { ...get().notice, seen: true } }),
      setAuto: (on) => apply({ ...current(), graphics: { ...get().graphics, auto: on } }),
      autoLower: (reason) => {
        const g = get().graphics;
        if (safe || !g.auto || g.preset === 'low') return false;
        apply({ ...current(), graphics: { preset: 'low', ...PRESETS.low, auto: true }, notice: { lowered: reason, seen: false } });
        return true;
      },
      dismissNotice: () => apply({ ...current(), notice: { ...get().notice, seen: true } }),
      setAudio: (patch) => apply({ ...current(), audio: { ...get().audio, ...patch } }),
      setGameplay: (patch) => apply({ ...current(), gameplay: { ...get().gameplay, ...patch } }),
      resetDefaults: () => apply(DEFAULT_SETTINGS),
    };
  });
}

export const useSettings = createSettingsStore(SAFE);

/** The render budgets, for a component (re-renders when an option changes). */
export function useQuality(): RenderQuality {
  return useSettings((s) => s.quality);
}

/** The render budgets, read once (a frame loop, a module outside React). */
export function getQuality(): RenderQuality {
  return useSettings.getState().quality;
}
