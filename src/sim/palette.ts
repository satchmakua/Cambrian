/**
 * The ground's colours: one palette for everything that paints the ground or is judged against it — a
 * planet's scene, and the camouflage the hunters see through (selection.ts) — so a coat that matches what
 * is drawn matches what is judged. The valley's six are world/Landscape.tsx's own; a planet's climate adds
 * the rest.
 */
import type { Biome } from './terrain';

export const BIOME_COLOUR: Record<Biome, number> = {
  deep: 0x3d4a3f,
  shallow: 0x3d4a3f,
  sand: 0xb8a77c,
  meadow: 0x5f8f3a,
  wood: 0x3f5f2c,
  rock: 0x77736c,
  marsh: 0x4d6738,
  desert: 0xc6a46a,
  savanna: 0x9a9648,
  jungle: 0x2b5823,
  taiga: 0x32503a,
  tundra: 0x8a8a70,
  ice: 0xd8d8d2,
};

/** snow on the ground (the valley's winters; a planet's ice) */
export const SNOW_COLOUR = 0xd8d8d2;
