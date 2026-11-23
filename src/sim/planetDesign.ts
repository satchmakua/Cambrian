/**
 * A planet's design: what a new game's planet is made from, besides its seed — its size, its land, its
 * relief, how its land lies, its climate, its seasons and its shallow seas. Each is a slider in the new-game
 * panel's planet designer, and the planet types are presets of them, each a starting point to move on from.
 *
 * Every value is held to its range and its slider's step, so a design read back from a save is the one that
 * was chosen, to the bit, and makes the same planet. Pure: the game, the workers and the tests share it.
 */
import type { PlanetSpec } from './planetBake';

export interface PlanetDesign {
  /** the sea's radius (bu) */
  radius: number;
  /** how high the highest ground stands above the sea (bu) */
  relief: number;
  /** the share of the surface above the sea */
  land: number;
  /** a few great lands (0) … many smaller (1) */
  continents: number;
  /** gentle (0) … rugged (1) */
  rugged: number;
  /** an ice world (−1) … a hothouse (1) */
  temperature: number;
  /** deserts (−1) … forests (1) */
  wetness: number;
  /** no seasons (0) … the Earth's (0.5) … harsh (1) */
  tilt: number;
  /** coasts that drop to the deep (0) … wide shallow seas (1) */
  shelf: number;
}

export type DesignKey = keyof PlanetDesign;

/** each slider's range and step */
export const DESIGN_RANGES: Record<DesignKey, { min: number; max: number; step: number }> = {
  radius: { min: 200, max: 450, step: 25 },
  relief: { min: 10, max: 40, step: 1 },
  land: { min: 0.2, max: 0.8, step: 0.05 },
  continents: { min: 0, max: 1, step: 0.05 },
  rugged: { min: 0, max: 1, step: 0.05 },
  temperature: { min: -1, max: 1, step: 0.05 },
  wetness: { min: -1, max: 1, step: 0.05 },
  tilt: { min: 0, max: 1, step: 0.05 },
  shelf: { min: 0, max: 1, step: 0.05 },
};

export const DESIGN_KEYS = Object.keys(DESIGN_RANGES) as DesignKey[];

/** the planet chosen on 2026-11-21 after the lab: 300 bu across the middle, 30 bu of relief, 60% land */
export const EARTHLIKE: PlanetDesign = { radius: 300, relief: 30, land: 0.6, continents: 0.45, rugged: 0.5, temperature: 0, wetness: 0, tilt: 0.5, shelf: 0.25 };

export interface PlanetPreset {
  id: string;
  title: string;
  /** what it is like, in a line */
  blurb: string;
  design: PlanetDesign;
}

export const PLANET_PRESETS: readonly PlanetPreset[] = [
  { id: 'earthlike', title: 'Earthlike', blurb: 'Continents and oceans, ice at the poles, the Earth’s seasons.', design: EARTHLIKE },
  { id: 'archipelago', title: 'Archipelago', blurb: 'A sea of islands on wide shallows: lines kept apart by water.', design: { ...EARTHLIKE, land: 0.35, continents: 1, relief: 24, rugged: 0.55, temperature: 0.2, wetness: 0.3, shelf: 0.6 } },
  { id: 'pangaea', title: 'One great continent', blurb: 'All the land in one, its heart far from any sea.', design: { ...EARTHLIKE, land: 0.55, continents: 0, relief: 32, wetness: -0.1, shelf: 0.2 } },
  { id: 'desert', title: 'Desert world', blurb: 'Dry and warm: oases, river valleys and a few green coasts.', design: { ...EARTHLIKE, land: 0.65, relief: 28, rugged: 0.45, temperature: 0.3, wetness: -0.85, shelf: 0.2 } },
  { id: 'ice', title: 'Ice world', blurb: 'Ice caps reaching far toward a cold green middle.', design: { ...EARTHLIKE, land: 0.55, temperature: -1, wetness: -0.2, tilt: 0.4 } },
  { id: 'hothouse', title: 'Hothouse', blurb: 'No ice anywhere: steaming forests, mild seasons.', design: { ...EARTHLIKE, land: 0.5, temperature: 0.85, wetness: 0.6, tilt: 0.25, shelf: 0.4 } },
  { id: 'highlands', title: 'Highlands', blurb: 'Great ranges and high valleys, cold peaks over warm lowlands.', design: { ...EARTHLIKE, relief: 40, rugged: 0.95, land: 0.65, continents: 0.4 } },
];

export function presetById(id: string | null | undefined): PlanetPreset | null {
  return PLANET_PRESETS.find((p) => p.id === id) ?? null;
}

/** The preset a design is, slider for slider (null: one of its own). */
export function presetOf(d: PlanetDesign): PlanetPreset | null {
  return PLANET_PRESETS.find((p) => DESIGN_KEYS.every((k) => p.design[k] === d[k])) ?? null;
}

/** A value held to a slider's range and step (to the hundredth's rounding, so 0.1 + 0.2 is 0.3). */
export function onStep(k: DesignKey, v: number): number {
  const r = DESIGN_RANGES[k];
  const x = Math.min(r.max, Math.max(r.min, r.min + Math.round((v - r.min) / r.step) * r.step));
  return Math.round(x * 1e6) / 1e6;
}

/** A design read from a save, a file or the browser, checked slider by slider: each held to its range and
 *  step, and the earthlike planet's value for any that is missing or unreadable. Null for no design at all. */
export function checkDesign(v: unknown): PlanetDesign | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out = { ...EARTHLIKE };
  for (const k of DESIGN_KEYS) {
    const x = o[k];
    if (typeof x === 'number' && Number.isFinite(x)) out[k] = onStep(k, x);
  }
  return out;
}

/** The design a planet was made from (its seed aside), each value held to its slider. */
export function designOfSpec(spec: PlanetSpec): PlanetDesign {
  return checkDesign(spec) ?? { ...EARTHLIKE };
}

/** The planet a design makes with a seed. */
export function specOf(seed: number, d: PlanetDesign): PlanetSpec {
  return { seed: seed >>> 0, radius: d.radius, relief: d.relief, land: d.land, continents: d.continents, rugged: d.rugged, temperature: d.temperature, wetness: d.wetness, tilt: d.tilt, shelf: d.shelf };
}

/** how many a planet may hold: the valley's three sizes (model.ts's CAPACITIES, a test holds them the same),
 *  and one twice its largest (a big world's). (Written out, not read from the model: the scenarios read this
 *  module while the model is still being loaded.) */
export const PLANET_CAPS: readonly number[] = [165, 330, 600, 1200];
/** what a new planet holds unless told: the valley's largest (a planet's land is a dozen valleys and more) */
export const PLANET_CAP = 600;
