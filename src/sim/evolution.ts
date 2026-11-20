/**
 * Evolution you can see: a species read from the world's records — where it lives, what it eats and
 * what eats it, what it dies of, and how its body has changed since its founder, over time.
 *
 * Pure: reads a World, changes nothing.
 */
import type { Genome } from '../engine/genome';
import { biomeAt, type Biome } from './terrain';
import { howItDiffers } from './lineage';
import { bodyOf, speciesById, type DeathTally, type Species, type TrendSample, type World, type FilmFrame } from './world';
import type { Diet, Habitat } from './traits';

export interface Relation {
  id: number;
  name: string;
  hue: number;
  count: number;
}

export interface SpeciesProfile {
  id: number;
  name: string;
  kind: string;
  hue: number;
  alive: number;
  born: number;
  deaths: number;
  founded: number;
  extinctAt: number | null;
  /** the species it came from, if any — and how: its whole line became this one ('evolved'), this one
   *  branched off it ('branched'), or the player bred this one from it in the breeder ('bred') */
  parent: { id: number; name: string; how: 'evolved' | 'branched' | 'bred' } | null;
  /** what its whole line became, if that is how its name ended (not by dying out) */
  became: { id: number; name: string } | null;
  /** the species that have branched off it (not counting what it became) */
  daughters: { id: number; name: string; extinct: boolean }[];
  /** the commonest body among its living members (its founder's, once it is gone) */
  now: Genome;
  founder: Genome;
  diet: Diet;
  habitat: Habitat;
  flies: boolean;
  /** the ground its members stand on, commonest first, as shares of them */
  where: { biome: Biome; share: number }[];
  /** what it has killed and what has killed it, most first */
  prey: Relation[];
  predators: Relation[];
  causes: DeathTally;
  /** how its body differs from its founder's, in a few words ([] when, to the eye, it does not) */
  differs: string[];
  trend: TrendSample[];
  /** its film: its typical body over the generations (see Species.film) */
  film: FilmFrame[];
  /** the player has adopted its line (it, or a species it descends from) */
  adopted: boolean;
}

/** Is `id` in a line the player has adopted — that species, or one it descends from? */
export function inAdoptedLine(w: World, id: number): boolean {
  if (w.adopted.length === 0) return false;
  for (let sp = speciesById(w, id), i = 0; sp && i < 256; sp = sp.parent !== null ? speciesById(w, sp.parent) : undefined, i++) if (w.adopted.includes(sp.id)) return true;
  return false;
}

const BIOME_ORDER: Biome[] = ['meadow', 'wood', 'sand', 'rock', 'shallow', 'deep'];

function relations(w: World, counts: Record<number, number>, max: number): Relation[] {
  return Object.entries(counts)
    .map(([id, count]) => ({ sp: speciesById(w, Number(id)), count }))
    .filter((r): r is { sp: Species; count: number } => !!r.sp && r.count > 0)
    .sort((a, b) => b.count - a.count || a.sp.id - b.sp.id)
    .slice(0, max)
    .map(({ sp, count }) => ({ id: sp.id, name: sp.name, hue: sp.hue, count }));
}

/** Everything the species card shows, or null for an id the world has never known. */
export function speciesProfile(w: World, id: number): SpeciesProfile | null {
  const sp = speciesById(w, id);
  if (!sp) return null;
  const members = w.creatures.filter((c) => c.alive && c.species === id);
  // the commonest body: offspring born without a mutation carry their parent's very genome object
  const tally = new Map<Genome, number>();
  for (const c of members) tally.set(c.genome, (tally.get(c.genome) ?? 0) + 1);
  let now = sp.founder, best = 0;
  for (const [g, n] of tally) if (n > best) [now, best] = [g, n];
  const t = members.find((c) => c.genome === now)?.traits;
  const ground = new Map<Biome, number>();
  for (const c of members) {
    const b = biomeAt(w.terrain, c.x, c.z);
    ground.set(b, (ground.get(b) ?? 0) + 1);
  }
  const where = [...ground.entries()]
    .map(([biome, n]) => ({ biome, share: n / members.length }))
    .sort((a, b) => b.share - a.share || BIOME_ORDER.indexOf(a.biome) - BIOME_ORDER.indexOf(b.biome));
  const parent = sp.parent !== null ? speciesById(w, sp.parent) : undefined;
  // (its founder's traits once none are left)
  const ref = t ?? bodyOf(sp.founder).traits;
  return {
    id: sp.id,
    name: sp.name,
    kind: sp.kind,
    hue: sp.hue,
    alive: sp.alive,
    born: sp.born,
    deaths: sp.deaths,
    founded: sp.firstSeen,
    extinctAt: sp.extinctAt,
    parent: parent ? { id: parent.id, name: parent.name, how: sp.bred ? 'bred' : parent.evolvedInto === sp.id ? 'evolved' : 'branched' } : null,
    became: (() => {
      const b = sp.evolvedInto !== null ? speciesById(w, sp.evolvedInto) : undefined;
      return b ? { id: b.id, name: b.name } : null;
    })(),
    daughters: w.species.filter((s) => s.parent === id && s.id !== sp.evolvedInto).map((s) => ({ id: s.id, name: s.name, extinct: s.extinctAt !== null })),
    now,
    founder: sp.founder,
    diet: ref.diet,
    habitat: ref.habitat,
    flies: ref.flies,
    where,
    prey: relations(w, sp.killed, 4),
    predators: relations(w, sp.killedBy, 4),
    film: sp.film,
    adopted: inAdoptedLine(w, sp.id),
    causes: { ...sp.causes },
    differs: howItDiffers(sp.founder, now),
    trend: sp.trend,
  };
}
