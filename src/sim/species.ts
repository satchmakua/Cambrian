/**
 * Species — how the valley's populations are named, split, renamed and restocked: the daily speciation
 * pass (two groups apart → two species; a population drifted far from its founder → a new name), the seed
 * bank that lost stocks return from, each line's root, and how well a body is made against it.
 */
import type { AppendageGene, Genome, SegmentGene } from '../engine/genome';
import { grow, type Phenotype } from '../engine/grow';
import { coherence, describe as describeMorph, distance as morphDistance } from '../engine/morphospace';
import { mix32, unitHash } from '../engine/rng';
import { mouthVariant } from '../viewer/partStyles';
import { mutate } from '../engine/mutate';
import { viabilityOf } from './viability';
import { BANK, bodyOf, canStand, DAY_LENGTH, descriptorOf, DIET_SHIFT, liveCount, log, SPECIATION_DIST, speciesById, SPLIT_DAYS, SPLIT_DIST, SPLIT_FROM, SPLIT_GAP, SPLIT_MIN, SPLIT_SHARE, VARIETY, type Creature, type Species, type World } from './model';
import { spawn, spawnPoint } from './population';
import { done } from './motion';
import type { Place } from './surface';

export function speciesFor(w: World, genome: Genome, parent: number | null, label?: string): Species {
  const { phenotype } = bodyOf(genome);
  // a known label (the morphotype it was released as, or its parent species' kind) beats the
  // morphospace classifier's guess, which can mislabel close basins (an ungulate read as a canid)
  const kind = label ?? (parent !== null ? speciesById(w, parent)?.kind : undefined) ?? coherence(phenotype).nearest;
  const sameKind = w.species.filter((s) => s.kind === kind).length;
  const sp: Species = {
    id: w.nextId++,
    name: `${kind} ${GREEK[sameKind % GREEK.length]}${sameKind >= GREEK.length ? Math.floor(sameKind / GREEK.length) + 1 : ''}`,
    kind,
    founder: genome,
    descriptor: describeMorph(phenotype),
    hue: genome.palette.hueA,
    parent,
    firstSeen: w.time,
    extinctAt: null,
    alive: 0,
    born: 0,
    deaths: 0,
    causes: { starvation: 0, predation: 0, oldAge: 0 },
    killedBy: {},
    killed: {},
    trend: [],
    trendStride: 1,
    bank: [genome],
    evolvedInto: null,
    splitWatch: 0,
    bred: false,
    film: [],
  };
  w.species.push(sp);
  return sp;
}

/** The founding species of `sp`'s line (its first name in the valley). */
export function lineRoot(w: World, sp: Species): Species {
  let s = sp;
  for (let i = 0; i < 64 && s.parent !== null; i++) {
    const p = speciesById(w, s.parent);
    if (!p) break;
    s = p;
  }
  return s;
}

/** The body with every fin and leg at its kind's own form (its form genes taken off): what viability reads
 *  coherence and bloat from (see viabilityOf). The body itself when it has no form genes. */
const PLAIN = new WeakMap<Genome, Phenotype>();
function plainBody(genome: Genome): Phenotype {
  let p = PLAIN.get(genome);
  if (p) return p;
  let any = false;
  const g = structuredClone(genome) as Genome;
  for (let s: SegmentGene | undefined = g.body; s; s = s.child) for (const a of s.appendages) if (a.form !== undefined) {
    delete a.form;
    any = true;
  }
  p = any ? grow(g) : bodyOf(genome).phenotype;
  PLAIN.set(genome, p);
  return p;
}

const FIT = new WeakMap<Genome, { root: Genome; fit: number }>();
/** How well a genome's body is made, measured against its line's first founder (see viability.ts). */
export function fitOf(w: World, genome: Genome, sp: Species): number {
  const root = lineRoot(w, sp).founder;
  const hit = FIT.get(genome);
  if (hit && hit.root === root) return hit.fit;
  const fit = genome === root ? 1 : viabilityOf(bodyOf(genome).phenotype, bodyOf(root).phenotype, plainBody(genome)).score;
  FIT.set(genome, { root, fit });
  return fit;
}

/** A member of a stock: its genome with a few numbers nudged (see VARIETY). */
export function variant(genome: Genome, seed: number): Genome {
  const g = mutate(genome, seed >>> 0, 0, VARIETY, true);
  holdDiet(g, genome, 1);
  return g;
}

function mouthsOf(g: Genome): AppendageGene[] {
  const out: AppendageGene[] = [];
  for (let s: SegmentGene | undefined = g.body; s; s = s.child) for (const a of s.appendages) if (a.terminal === 'mouth') out.push(a);
  return out;
}
/** A mutated child (new, not yet grown) keeps the kind of mouth it was born from — but for the rare
 *  DIET_SHIFT (`roll`, 0..1). Mended in place. */
export function holdDiet(child: Genome, from: Genome, roll: number): void {
  if (roll < DIET_SHIFT) return;
  const was = mouthsOf(from), now = mouthsOf(child);
  for (let i = 0; i < now.length && i < was.length; i++) if (mouthVariant(now[i].style) !== mouthVariant(was[i].style)) now[i].style = was[i].style;
}
const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ'];

/** seconds between a species' trend samples (a quarter day) */
export const TREND_EVERY = DAY_LENGTH / 4;
/** a species' trend holds at most this many samples; past it every other one is dropped */
export const TREND_MAX = 160;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function sampleTrends(w: World): void {
  const k = Math.floor(w.time / TREND_EVERY);
  const sums = new Map<number, number[]>();
  for (const c of w.creatures) {
    if (!c.alive) continue;
    const sp = speciesById(w, c.species);
    if (!sp || k % sp.trendStride !== 0) continue;
    let s = sums.get(sp.id);
    if (!s) sums.set(sp.id, (s = [0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const t = c.traits;
    s[0]++;
    s[1] += t.mass;
    s[2] += t.sprint;
    s[3] += t.vision;
    s[4] += t.attack;
    s[5] += t.defense;
    s[6] += morphDistance(descriptorOf(c.genome), sp.descriptor);
    s[7] += t.diet === 'carnivore' || t.diet === 'omnivore' ? 1 : 0;
    s[8] += c.genome.covering.type === sp.founder.covering.type ? 1 : 0;
  }
  for (const [id, s] of sums) {
    const sp = speciesById(w, id)!;
    const n = s[0];
    sp.trend.push({
      // (the quarter day itself: the clock is a sum of steps, a hair off the boundary it crossed)
      t: k * TREND_EVERY,
      n,
      mass: r3(s[1] / n),
      sprint: r3(s[2] / n),
      vision: r3(s[3] / n),
      attack: r3(s[4] / n),
      armour: r3(s[5] / n),
      drift: r3(s[6] / n),
      hunters: r3(s[7] / n),
      coat: r3(s[8] / n),
      starved: sp.causes.starvation,
      eaten: sp.causes.predation,
      aged: sp.causes.oldAge,
    });
    if (sp.trend.length >= TREND_MAX) {
      // thin it to half: keep its first sample (its founding) and those on the doubled stride, which the
      // samples to come will fall on too
      sp.trendStride *= 2;
      sp.trend = sp.trend.filter((x, i) => i === 0 || Math.round(x.t / TREND_EVERY) % sp.trendStride === 0);
    }
  }
}

// --- species: populations that drift and split --------------------------------------------------

/**
 * Each dawn, every living species is looked at as a population:
 *   - its seed bank is refreshed from its living members (the stock it would return from);
 *   - a numerous species whose members fall into two clearly separate groups splits: the group
 *     further from the founder branches off as a new species (cladogenesis);
 *   - a species whose members have, on average, drifted SPECIATION_DIST from its founder takes a new
 *     name: the whole line has become something else (a chronospecies), and the old name's record
 *     ends "evolved into" rather than "died out".
 * A mutant is never a species on its own: it is variation within its parents' species until enough
 * of its kind stand apart together.
 */
export function speciateDaily(w: World): void {
  const byId = new Map<number, Creature[]>();
  for (const c of w.creatures) {
    if (!c.alive) continue;
    let l = byId.get(c.species);
    if (!l) byId.set(c.species, (l = []));
    l.push(c);
  }
  for (const sp of [...w.species]) {
    const members = byId.get(sp.id);
    if (!members || members.length === 0 || sp.extinctAt !== null) continue;
    sp.bank = bankOf(members);
    const fork = members.length >= SPLIT_FROM ? splitIfTwo(w, sp, members) : 'one';
    if (members.length < SPLIT_FROM) sp.splitWatch = 0;
    // (while two groups stand apart their average lies between them: that is not a line drifted)
    if (fork === 'one') driftOn(w, sp, members);
  }
  // the day's frame of each species' film (after the splits and the renamings: each films its own)
  const now = new Map<number, Creature[]>();
  for (const c of w.creatures) {
    if (!c.alive) continue;
    let l = now.get(c.species);
    if (!l) now.set(c.species, (l = []));
    l.push(c);
  }
  for (const sp of w.species) {
    const members = now.get(sp.id);
    if (members && sp.extinctAt === null) filmOn(w, sp, members);
  }
}

/** A film keeps at most this many frames; a new frame is taken when its body has moved this far (in
 *  morphospace) from the last one. */
export const FILM_MAX = 12;
const FILM_STEP = 0.035;

/** Take the day's frame of a species' film: its most typical body, if it has visibly changed since the
 *  last frame (or it has none). A full film is thinned to every other frame, its first kept. */
function filmOn(w: World, sp: Species, members: Creature[]): void {
  const m = medoidOf(members);
  const last = sp.film[sp.film.length - 1];
  if (last && morphDistance(descriptorOf(m.genome), descriptorOf(last.genome)) < FILM_STEP) return;
  sp.film.push({ t: w.time, gen: m.generation, genome: m.genome });
  if (sp.film.length > FILM_MAX) sp.film = sp.film.filter((_, i) => i === 0 || i % 2 === 1 || i === sp.film.length - 1);
}

/** Up to BANK genomes, spread evenly over the members (in their fixed order), each once. */
function bankOf(members: Creature[]): Genome[] {
  const out: Genome[] = [];
  const n = members.length;
  for (let i = 0; i < BANK && i < n; i++) {
    const g = members[Math.floor((i * n) / Math.min(BANK, n))].genome;
    if (!out.includes(g)) out.push(g);
  }
  return out;
}

/** The mean of some descriptors. */
function meanOf(ds: number[][]): number[] {
  const m = new Array<number>(ds[0].length).fill(0);
  for (const d of ds) for (let k = 0; k < d.length; k++) m[k] += d[k];
  for (let k = 0; k < m.length; k++) m[k] /= ds.length;
  return m;
}

/** The member nearest the group's middle in morphospace: the one that founds its name. */
function medoidOf(members: Creature[]): Creature {
  const m = meanOf(members.map((c) => descriptorOf(c.genome)));
  let best = members[0], bd = Infinity;
  for (const c of members) {
    const d = morphDistance(descriptorOf(c.genome), m);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Two groups within one species, if there are two: split them (once the gap has held SPLIT_DAYS dawns),
 *  the derived one under a new name. 'watching': two groups stand apart, not yet long enough. */
function splitIfTwo(w: World, sp: Species, members: Creature[]): 'split' | 'watching' | 'one' {
  const ds = members.map((c) => descriptorOf(c.genome));
  const mean = meanOf(ds);
  // seeds: the member furthest from the middle, then the one furthest from it (2-means from there)
  let ia = 0, ib = 0, far = -1;
  ds.forEach((d, i) => {
    const x = morphDistance(d, mean);
    if (x > far) {
      far = x;
      ia = i;
    }
  });
  far = -1;
  ds.forEach((d, i) => {
    const x = morphDistance(d, ds[ia]);
    if (x > far) {
      far = x;
      ib = i;
    }
  });
  let ca = ds[ia], cb = ds[ib];
  let inA = ds.map(() => true);
  const apart = (): boolean => {
    for (let it = 0; it < 6; it++) {
      inA = ds.map((d) => morphDistance(d, ca) <= morphDistance(d, cb));
      const A = ds.filter((_, i) => inA[i]), B = ds.filter((_, i) => !inA[i]);
      if (A.length === 0 || B.length === 0) return false;
      ca = meanOf(A);
      cb = meanOf(B);
    }
    const nA = inA.filter(Boolean).length, nB = ds.length - nA;
    const least = Math.max(SPLIT_MIN, Math.ceil(SPLIT_SHARE * ds.length));
    if (nA < least || nB < least) return false;
    const gap = morphDistance(ca, cb);
    if (gap <= SPLIT_DIST) return false;
    let spreadA = 0, spreadB = 0;
    ds.forEach((d, i) => {
      if (inA[i]) spreadA += morphDistance(d, ca);
      else spreadB += morphDistance(d, cb);
    });
    return gap > SPLIT_GAP * (spreadA / nA + spreadB / nB);
  };
  // (a gap must hold for several dawns running: a morph two forms keep trading is variation)
  if (!apart()) {
    sp.splitWatch = 0;
    return 'one';
  }
  if (++sp.splitWatch < SPLIT_DAYS) return 'watching';
  sp.splitWatch = 0;
  // the group further from the founder is the one that has changed
  const newIsA = morphDistance(ca, sp.descriptor) > morphDistance(cb, sp.descriptor);
  const group = members.filter((_, i) => inA[i] === newIsA);
  const child = speciesFor(w, medoidOf(group).genome, sp.id);
  regroup(w, group, sp, child);
  log(w, 'speciation', `${child.name} branched off ${sp.name} (${group.length} of them)`, child.id);
  w.tally.speciations++;
  return 'split';
}

/** The whole line has drifted far enough from its founder to be something else: name its present form.
 *  (Measured from the population's centre, not as each member's distance: a loose herd is not a drifted
 *  one, and a new name founded at its middle would otherwise be "drifted" again the next dawn.) */
function driftOn(w: World, sp: Species, members: Creature[]): void {
  if (members.length < SPLIT_MIN) return;
  if (morphDistance(meanOf(members.map((c) => descriptorOf(c.genome))), sp.descriptor) <= SPECIATION_DIST) return;
  const next = speciesFor(w, medoidOf(members).genome, sp.id);
  regroup(w, members, sp, next);
  sp.extinctAt = w.time;
  sp.evolvedInto = next.id;
  log(w, 'speciation', `${sp.name} has become ${next.name}`, next.id);
  w.tally.speciations++;
}

/** Move `group` from `from` to the new species `to` (its founding members), keeping the books. */
function regroup(w: World, group: Creature[], from: Species, to: Species): void {
  const moved = new Set<number>();
  for (const c of group) {
    c.species = to.id;
    moved.add(c.id);
  }
  from.alive -= group.length;
  to.alive += group.length;
  to.born += group.length;
  to.bank = bankOf(group);
  // a courtship across the new divide ends: the two are of different kinds now
  for (const c of w.creatures) {
    if (!c.alive || c.action !== 'mate') continue;
    const m = w.creatures.find((x) => x.id === c.target && x.alive);
    if (m && moved.has(c.id) !== moved.has(m.id)) done(c);
  }
}

/** Does any species descended from `sp` (or `sp` itself) have a living member? */
function lineageAlive(w: World, sp: Species): boolean {
  const line = new Set<number>([sp.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of w.species) {
      if (s.parent !== null && line.has(s.parent) && !line.has(s.id)) {
        line.add(s.id);
        grew = true;
      }
    }
  }
  return w.species.some((s) => line.has(s.id) && s.alive > 0);
}

/** The species an egg of `sp` hatches into: `sp`, or what its line has become since it was laid. */
export function successorOf(w: World, sp: Species): Species {
  let s = sp;
  for (let i = 0; i < 64 && s.evolvedInto !== null; i++) {
    const n = speciesById(w, s.evolvedInto);
    if (!n) break;
    s = n;
  }
  return s;
}

/**
 * Recolonisation. The valley is a patch of a wider country: a founding stock that has died out here
 * may, a day or two later, return as a small band wandering in from the edge (checked each dawn).
 * Without it a closed world of ~150 animals sheds its specialists one by one — rodents outcompeted
 * by generalists, a hunter pair that missed each other — until three species are left.
 */
export function immigrate(w: World): void {
  if (!w.god.immigration || liveCount(w) > w.cap - 8) return;
  const day = Math.floor(w.time / DAY_LENGTH);
  for (const sp of w.species) {
    if (sp.parent !== null || sp.extinctAt === null) continue;
    if (w.time - sp.extinctAt < DAY_LENGTH * 1.5) continue;
    // (a stock that became something else here lives on under its later name: no one wanders in for it)
    if (lineageAlive(w, sp)) continue;
    // an even chance each dawn — rolled on its own hash, not the shared stream
    if (unitHash(w.seed, day, sp.id, 0x1a7e) > 0.5) continue;
    // they come from the stock as it last lived (its seed bank), each a little varied — not as copies of
    // its first founders, which would undo everything the line had become
    const stock = sp.bank.length > 0 ? sp.bank : [sp.founder];
    const t = bodyOf(stock[0]).traits;
    let at: Place | undefined;
    if (t.habitat !== 'water') {
      // (in from the world's edge, where it may stand)
      for (let i = 0; i < 40 && !at; i++) {
        const p = w.surface.edge(w.rng() * Math.PI * 2);
        if (canStand(w, t, p)) at = p;
      }
    }
    const base = at ?? spawnPoint(w, t);
    const n = 3 + Math.floor(w.rng() * 3);
    let came = 0;
    for (let i = 0; i < n && liveCount(w) < w.cap; i++) {
      const q = spawnPoint(w, t, base, 10);
      spawn(w, variant(stock[i % stock.length], mix32(w.seed, day, sp.id, i, 0x1a7f)), sp, q, true, null);
      came++;
    }
    // no room for any of them: it stays extinct, and may try again at a later dawn
    if (came === 0) continue;
    sp.extinctAt = null;
    log(w, 'release', `${came} ${sp.name} wandered in`, sp.id);
  }
}
