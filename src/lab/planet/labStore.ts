/**
 * The planet lab's settings: the planet's size, relief and land, how many it may hold, how fast its time
 * runs, and the creature the camera follows. Read first from the URL, so a view can be shared or shot again:
 * ?lab=planet&r=300&relief=30&land=0.6&cap=165&seed=7&speed=1&view=orbit|region|ground|low&follow=1
 */
import { create } from 'zustand';
import { CAPACITIES } from '../../sim/model';

export interface LabState {
  /** the planet's radius (bu) */
  radius: number;
  /** the highest ground above the sea (bu) */
  relief: number;
  /** the share of the surface above the sea */
  land: number;
  /** how many it may hold at once (the valley's three sizes) */
  cap: number;
  seed: number;
  /** how fast its time runs (0: stopped) */
  speed: number;
  /** the creature the camera follows, by id */
  follow: number | null;
  set: (p: Partial<Omit<LabState, 'set'>>) => void;
}

const Q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

function num(key: string, fallback: number, lo: number, hi: number): number {
  const v = Number(Q.get(key));
  return Q.has(key) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

// (it opens on the planet liked best on 2026-11-21: 250–400 bu across the middle, 30 bu of relief, 60% land)
export const useLab = create<LabState>()((set) => ({
  radius: num('r', 300, 40, 600),
  relief: num('relief', 30, 0, 40),
  land: num('land', 0.6, 0.1, 0.8),
  cap: ((c) => (CAPACITIES.includes(c) ? c : CAPACITIES[0]))(num('cap', CAPACITIES[0], 1, 10000)),
  seed: num('seed', 7, 0, 2 ** 31) >>> 0,
  speed: num('speed', 1, 0, 16),
  follow: null,
  set: (p) => set(p),
}));

export type ViewName = 'orbit' | 'region' | 'ground' | 'low';

/** the view the lab opens on */
export const START_VIEW: ViewName = ((v) => (v === 'region' || v === 'ground' || v === 'low' ? v : 'orbit'))(Q.get('view'));

/** ?follow=1: open following the animal nearest the place the lab opens on */
export const START_FOLLOW = Q.get('follow') === '1';

/** ?days=…: run the world on this many days before showing it (a later hour, a world grown and spread) */
export const START_DAYS = num('days', 0, 0, 60);
