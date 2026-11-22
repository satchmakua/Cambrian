/**
 * The ground the simulation stands on, as one port.
 *
 * Where a body is, how far it is from another, which way it faces and how it turns, what the ground is
 * like under it, and the few searches that need the ground's own shape (the nearest bush, the room bodies
 * keep, the way off the water): the simulation asks its world's surface for all of them, and reads no
 * coordinate of its own. The flat valley is one surface (valley.ts); a planet is to be another, written
 * against this same port, so that behaviour, motion and a population's life are one code over both.
 * (tests/sim/surface-seam.test.ts keeps the rest of the simulation off the coordinates.)
 *
 * A place is a point on the ground: a creature, a plant, a carcass, an egg, a tree, or a point a creature
 * makes for. The valley reads a place's x and z, the square's two axes; a planet's places will carry a
 * third coordinate besides. A heading is the way a creature faces, kept on the creature as its surface
 * keeps it: on the valley an angle (0 along +Z, a quarter turn along +X).
 *
 * The valley's own arithmetic is the surface's, operation for operation: run on the valley through this
 * port, the simulation comes out the same to the last bit as it did before the port existed
 * (scripts/valley-fingerprint.ts is the check).
 */
import type { Biome, Terrain } from './terrain';
import type { Corpse, Creature, Egg, Plant, World } from './model';
import type { Stand } from './stands';

/** What a world is made on: its terrain (a valley's; a planet carries its seed's, unused, for the valley's
 *  viewer), its surface, how many cells its fields run across (the valley's viewer draws its grass by them),
 *  and where its bushes may grow (up to `most`, in `tries` throws). */
export interface Ground {
  terrain: Terrain;
  surface: Surface;
  gridN: number;
  bushes: { most: number; tries: number; place: (rng: () => number) => Place };
}

/** A point on the ground. A planet's carries its third coordinate as `y` (a point on the sphere of its sea);
 *  the valley's has none, and reads only x and z (its creatures' and eggs' own `y` is their ground's height,
 *  kept for the viewer, which no surface reads as a place). */
export interface Place {
  x: number;
  z: number;
  y?: number;
}

export interface Surface {
  readonly kind: 'valley' | 'planet';

  // --- where things are, and how far apart ---------------------------------------------------------

  /** How far apart two places are over the ground (bu). */
  dist(a: Place, b: Place): number;
  /** How far a creature is from the place it is making for. */
  toGoal(c: Creature): number;
  /** Are two places within `r` of each other along both of the ground's axes (a square's reach: cheaper
   *  than a distance, for a rough reckoning)? */
  inReach(a: Place, b: Place, r: number): boolean;
  /** The place `d × k` ahead of a creature, its heading turned by `turn` first (a stride, a glance aside;
   *  `k` scales the distance, kept apart so the valley multiplies as it always has). */
  ahead(c: Creature, turn: number, d: number, k?: number): Place;
  /** The place `d` from `p` the way `bearing` points: an angle round the place (on the valley 0 along +Z, a
   *  quarter turn along +X; angles round one place are comparable only with others round it). */
  around(p: Place, bearing: number, d: number): Place;
  /** The bearing round `from` that points at `to` (see `around`). */
  bearing(from: Place, to: Place): number;
  /** The place halfway between two. */
  mid(a: Place, b: Place): Place;
  /** The place `d` on from `p`, straight away from `from` (an escape). */
  away(p: Place, from: Place, d: number): Place;
  /** The cosine of the angle at `at` between the ways to `a` and to `b`. */
  cosAt(at: Place, a: Place, b: Place): number;
  /** `p` nudged by `dx` and `dz` along the ground's two axes (a scatter, a jitter). */
  offset(p: Place, dx: number, dz: number): Place;
  /** `p` drawn toward `to` by the share `k × s` (a wander bent toward the herd). */
  pull(p: Place, to: Place, k: number, s: number): Place;
  /** The middle of the places in `list` that `keep` keeps (null: none). */
  centroid<T extends Place>(list: readonly T[], keep: (o: T) => boolean): Place | null;
  /** `p` kept `margin` inside the world's edge (a planet has none). */
  keepInside(p: Place, margin: number): Place;
  /** Does `p` lie inside the world, `margin` from its edge (4 bu unless told)? */
  inBounds(p: Place, margin?: number): boolean;
  /** A place anywhere in the world, every part of it as likely (the valley: within `share` of its square). */
  anywhere(rng: () => number, share: number): Place;
  /** Where an immigrant comes in, `bearing` round the world's edge. */
  edge(bearing: number): Place;
  /** The place `d` on from `p` toward the shore, out of the water (the valley: straight out from its
   *  lake's middle). */
  offWater(p: Place, d: number): Place;
  /** Somewhere to be when nowhere else will do. */
  fallback(): Place;
  /** The nearest place — in rings outward, at fixed bearings, so the same every time — of deep water
   *  (`deep`) or of dry land, within `max` bu (40 unless told); null if there is none. */
  nearestWhere(p: Place, deep: boolean, max?: number): Place | null;
  /** A place's coordinates, in whole thousandths of a bu, for a fingerprint of the world. */
  key(p: Place): number[];

  // --- the ground -------------------------------------------------------------------------------------

  /** The ground's height at a place (bu above the sea; under it, negative). */
  height(p: Place): number;
  /** The water's surface at a place (bu): where the ground is below it, the place is wet. The valley's
   *  lake and river lie at its one level; a planet's lakes stand at their brims and its rivers fall to the
   *  sea, each at its own. */
  level(p: Place): number;
  /** What grows at a place. */
  biome(p: Place): Biome;
  /** The ground under a creature, as it was last settled there. */
  groundOf(c: Creature): number;
  /** Settle a creature onto the ground where it now stands. */
  settle(c: Creature): void;
  /** Is it night at a place (on the valley, everywhere at once; on a planet, where its sun is down)? */
  night(p: Place, time: number): boolean;

  // --- headings, goals and moves ----------------------------------------------------------------------

  /** Turn a creature by `a` (a positive turn toward +X from +Z, as the valley's heading grows). */
  turn(c: Creature, a: number): void;
  /** Turn a creature toward a place, by no more than `max`. */
  turnToward(c: Creature, p: Place, max: number): void;
  /** Face `c` the way `like` faces, then turned by `turn`. */
  faceLike(c: Creature, like: Creature, turn: number): void;
  /** Face a creature any way round. */
  faceAnywhere(c: Creature, rng: () => number): void;
  /** After a step: its heading kept within one turn either way. */
  tidy(c: Creature): void;
  /** Set a creature down at a place (a planet carries its heading along). */
  moveTo(c: Creature, p: Place): void;
  /** Make a creature make for a place. */
  aim(c: Creature, p: Place): void;
  /** The place a creature is making for. */
  goal(c: Creature): Place;

  // --- a new body's own fields: in the order a creature, a carcass or an egg keeps them (a save writes
  //     them in it) ------------------------------------------------------------------------------------

  /** A newcomer's place, the ground under it and the way it faces (its facing drawn from `rng`). */
  standing(p: Place, rng: () => number): Pick<Creature, 'x' | 'z' | 'y' | 'heading'> & Partial<Creature>;
  /** A newcomer's goal: where it stands. */
  aimAt(p: Place): Pick<Creature, 'tx' | 'tz'> & Partial<Creature>;
  /** Where a body fell, its ground, and the way it faced. */
  remains(c: Creature): Pick<Corpse, 'x' | 'z' | 'y' | 'heading'> & Partial<Corpse>;
  /** An egg's place and its ground. */
  laid(p: Place): Pick<Egg, 'x' | 'z' | 'y'>;

  // --- the living by place, and the fields ------------------------------------------------------------

  /** Index the living by place (each step, before any of them looks round). */
  index(w: World): void;
  /** The living within `r` of `p` (into `out`). */
  nearby(w: World, p: Place, r: number, out: Creature[]): Creature[];
  /** How many cells the fields have. */
  readonly cells: number;
  /** The field cell a place falls in. */
  cellOf(p: Place): number;
  /** The middle of a field cell. */
  cellCenter(k: number): Place;
  /** A field summed over its cells within `r` of `p` along both axes (in the field's own order). */
  fieldNear(field: Float32Array, p: Place, r: number): number;

  // --- plants, trees, and the room bodies keep --------------------------------------------------------

  /** The nearest bush to `p` within `within` (a tie to the one placed first). */
  nearestBush(plants: Plant[], p: Place, within: number): Plant | null;
  /** The plants that may lie within `r` of `p`, in their own order (more besides, where it is cheaper to
   *  look at them than to sort them out: the valley hands over all of its 170). */
  plantsWithin(plants: Plant[], p: Place, r: number): readonly Plant[];
  /** The broadleaves, where a flier roosts. */
  trees(): readonly Stand[];
  /** The nearest broadleaf to `p` within `within`, by its index in `trees()` (-1: none). */
  nearestTree(p: Place, within: number): number;
  /** Bodies on the ground ease apart where their footprints overlap. */
  keepRoom(w: World, dt: number): void;
  /** How far apart two creatures' footprints are, less the room they keep (negative: they overlap). */
  footprintGap(a: Creature, b: Creature): number;
}
