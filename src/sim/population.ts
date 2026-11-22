/**
 * Births and deaths — releases, clones and boosts, the caps on how many there may be, a pair's litter or a
 * clutch of eggs (mixed, sometimes mutated, sometimes stillborn), hatching, and dying.
 */
import type { Genome } from '../engine/genome';
import { STILLBORN } from './viability';
import type { Traits } from './traits';
import { WATER_LEVEL } from './terrain';
import type { Place } from './surface';
import { crossover } from '../engine/crossover';
import { encodeGenome } from '../engine/share';
import { mix32, unitHash } from '../engine/rng';
import { mutate } from '../engine/mutate';
import { aName, ALGAE_ENERGY, bodyOf, canStand, CORPSE_LIFE, FRUIT_ENERGY, GRASS_ENERGY, DECIDE_EVERY, growthOf, GUILD_SHARE, guildOf, HATCH_TIME, liveCount, log, MUTATION_CHANCE, RARE, RARE_HUNTER, softPop, SPECIES_SHARE, speciesById, WORLD_MUTATION, type Creature, type DeathCause, type Egg, type Species, type World } from './model';
import { fitOf, holdDiet, speciesFor, successorOf, variant } from './species';

/** Find a spawn point suited to a habitat, near a place if given (within `spread` of it, along both axes). */
export function spawnPoint(w: World, t: Traits, near?: Place, spread = 14): Place {
  const S = w.surface;
  for (let i = 0; i < 400; i++) {
    const p = near === undefined || i > 200 ? S.anywhere(w.rng, 0.85) : S.offset(near, (w.rng() - 0.5) * spread, (w.rng() - 0.5) * spread);
    if (!S.inBounds(p, 8)) continue;
    if (canStand(w, t, p)) return p;
  }
  return S.fallback();
}

export function spawn(w: World, genome: Genome, species: Species, at: Place, adult: boolean, parent: Creature | null): Creature {
  const S = w.surface;
  const { traits } = bodyOf(genome);
  const c: Creature = {
    id: w.nextId++,
    species: species.id,
    genome,
    traits,
    ...S.standing(at, w.rng),
    speed: 0,
    energy: traits.maxEnergy * (adult ? 0.85 : 0.5),
    health: traits.maxHealth,
    fatigue: w.rng() * 0.3,
    age: adult ? traits.maturity * (1 + w.rng()) : 0,
    lifeFactor: 0.85 + w.rng() * 0.3,
    action: 'wander',
    target: -1,
    ...S.aimAt(at),
    decideIn: w.rng() * DECIDE_EVERY,
    breedCooldown: adult ? traits.lifespan * 0.03 * w.rng() : traits.maturity,
    generation: parent ? parent.generation + 1 : 0,
    parent: parent ? parent.id : null,
    children: 0,
    kills: 0,
    alive: true,
    attacker: -1,
    attackedAt: -1e9,
    bitAt: -1e9,
    wanderSeed: w.rng() * 1000,
    alt: 0,
    fly: false,
    courtT: 0,
    chaseT: 0,
    fit: fitOf(w, genome, species),
    perch: -1,
    soarT: 0,
    dry: 0,
  };
  w.creatures.push(c);
  species.alive++;
  species.born++;
  return c;
}

/** Release `count` adults of a genome into the world (a new species unless one has this founder). */
export function release(w: World, genome: Genome, count: number, near?: Place, label?: string, bredFrom?: Species): Creature[] {
  const { traits } = bodyOf(genome);
  // a full valley takes no one in (and founds no empty species)
  if (liveCount(w) >= w.cap) return [];
  // (by content as well as identity: a loaded or fast-forwarded world holds fresh genome objects)
  const key = encodeGenome(genome);
  const same = (s: Species) => s.founder === genome || encodeGenome(s.founder) === key;
  let sp = bredFrom
    ? // a line bred from one of the valley's own is a branch of its species: released again, it joins
      // the branch it founded
      w.species.find((s) => s.bred && s.parent === bredFrom.id && same(s))
    : w.species.find((s) => s.extinctAt === null && same(s)) ??
      // a founding stock that died out here comes back under its own name (a twin founded beside it
      // was later joined by the original, wandering back in)
      w.species.find((s) => s.parent === null && same(s));
  if (!sp) {
    sp = speciesFor(w, genome, bredFrom ? bredFrom.id : null, label);
    if (bredFrom) sp.bred = true;
  }
  const base = near ?? spawnPoint(w, traits);
  const out: Creature[] = [];
  for (let i = 0; i < count && liveCount(w) < w.cap; i++) {
    const p = spawnPoint(w, traits, base, 18);
    // the first is the genome itself (the species' founder); the rest are its kin, a little varied
    const g = i === 0 ? genome : variant(genome, mix32(w.seed, w.nextId, i, 0x5ca7));
    out.push(spawn(w, g, sp, p, true, null));
  }
  if (out.length > 0) sp.extinctAt = null;
  log(w, 'release', `${out.length} ${sp.name} released${bredFrom ? `, bred from ${bredFrom.name}` : ''}`, sp.id);
  return out;
}

/** Note a creature taken home to the breeder: a line bred from it and released here is a branch of
 *  its species (see bredFromHere). The last 64 are kept. */
export function takeHome(w: World, c: Creature): void {
  if (w.homes.some((h) => h.seed === c.genome.seed && h.species === c.species)) return;
  w.homes.push({ seed: c.genome.seed, species: c.species });
  if (w.homes.length > 64) w.homes.shift();
}

/** The species of this valley a breeder's lineage was bred from: the one whose creature, taken home,
 *  the lineage is rooted at (`root`, the lineage's first genome). Null: not bred from this valley. */
export function bredFromHere(w: World, root: Genome): Species | null {
  for (let i = w.homes.length - 1; i >= 0; i--) if (w.homes[i].seed === root.seed) return speciesById(w, w.homes[i].species) ?? null;
  return null;
}

/** `n` copies of a living creature, grown, beside it: its own genome, its own species, its generation. */
export function cloneCreature(w: World, c: Creature, n: number): Creature[] {
  const sp = speciesById(w, c.species);
  if (!sp || !c.alive) return [];
  const out: Creature[] = [];
  for (let i = 0; i < n && liveCount(w) < w.cap; i++) {
    const p = spawnPoint(w, c.traits, c, 6);
    const k = spawn(w, c.genome, sp, p, true, null);
    k.generation = c.generation;
    out.push(k);
  }
  if (out.length > 0) log(w, 'release', `${out.length} ${sp.name} cloned`, sp.id);
  return out;
}

/** `n` more of a living species, beside one of its members: grown from its seed bank (its members' last
 *  genomes), each a little varied, as its immigrants are. */
export function boostSpecies(w: World, sp: Species, n: number): Creature[] {
  const member = w.creatures.find((c) => c.alive && c.species === sp.id);
  if (!member) return [];
  const stock = sp.bank.length > 0 ? sp.bank : [sp.founder];
  const out: Creature[] = [];
  for (let i = 0; i < n && liveCount(w) < w.cap; i++) {
    const g = variant(stock[i % stock.length], mix32(w.seed, w.nextId, i, 0xb005));
    const p = spawnPoint(w, bodyOf(g).traits, member, 12);
    const k = spawn(w, g, sp, p, true, null);
    k.generation = member.generation;
    out.push(k);
  }
  if (out.length > 0) log(w, 'release', `${out.length} more ${sp.name} joined`, sp.id);
  return out;
}

/** A creature's death, for god mode: struck dead where it stands (a carcass), or culled (none). */
export function killCreature(w: World, c: Creature, carcass: boolean): void {
  if (c.alive) die(w, c, 'culled', carcass);
}

export function die(w: World, c: Creature, cause: DeathCause, carcass = true): void {
  c.alive = false;
  const sp = speciesById(w, c.species);
  const g = growthOf(c);
  if (carcass) w.corpses.push({
    id: w.nextId++,
    ...w.surface.remains(c),
    meat: (c.traits.maxEnergy * 0.8 + 30) * g * g,
    maxMeat: (c.traits.maxEnergy * 0.8 + 30) * g * g,
    rot: CORPSE_LIFE,
    genome: c.genome,
    growth: g,
    species: c.species,
  });
  if (sp) {
    sp.alive--;
    sp.deaths++;
    if (cause === 'starvation') sp.causes.starvation++;
    else if (cause === 'old age') sp.causes.oldAge++;
    else if (cause === 'culled') {
      /* the player's doing: told in the journal by god mode itself */
    } else {
      sp.causes.predation++;
      // (who did it: the last thing to bite it — wounds can kill a little after the bite)
      const killer = c.attacker >= 0 ? w.creatures.find((x) => x.id === c.attacker) : undefined;
      if (killer) {
        sp.killedBy[killer.species] = (sp.killedBy[killer.species] ?? 0) + 1;
        const ks = speciesById(w, killer.species);
        if (ks) ks.killed[sp.id] = (ks.killed[sp.id] ?? 0) + 1;
      }
    }
    if (cause !== 'predation' && cause !== 'culled') log(w, 'death', `${aName(sp.name)} died of ${cause}`, sp.id, c.id);
  }
  if (cause === 'starvation') w.tally.starvation++;
  else if (cause === 'old age') w.tally.oldAge++;
  else if (cause !== 'culled') w.tally.kills++;
  if (sp) {
    if (sp.alive <= 0 && sp.extinctAt === null) {
      sp.extinctAt = w.time;
      log(w, 'extinction', `${sp.name} went extinct`, sp.id);
    }
  }
}

/** The population caps: under the world cap, under its species' share of the soft cap, and under its
 *  guild's. Eggs still waiting to hatch count as the animals they will be — a clutch takes over a
 *  minute to hatch, and while it waited every other pair of its kind laid one too, so an egg-laying
 *  species blew straight through its share. */
function capsAllow(w: World, c: Creature, reserve = false): boolean {
  const sp = speciesById(w, c.species);
  const g = guildOf(c);
  let spEggs = 0, guildEggs = 0, all = w.eggs.length;
  for (const e of w.eggs) {
    if (e.species === c.species) spEggs++;
    if (guildOf(bodyOf(e.genome)) === g) guildEggs++;
  }
  // deciding whether to START a courtship: pairs already courting have their coming litter spoken
  // for — or every pair rushes the one place a death opened and all but the first part with nothing
  // (about three empty displays for every mating)
  if (reserve) {
    for (const o of w.creatures) {
      if (o === c || !o.alive || o.action !== 'mate' || o.breedCooldown > 0) continue;
      const m = w.creatures.find((x) => x.id === o.target && x.alive);
      if (m && m.action === 'mate' && m.target === o.id && m.id < o.id) continue; // a dancing pair counts once
      const n = o.traits.litter + (o.traits.oviparous ? 1 : 0);
      all += n;
      if (o.species === c.species) spEggs += n;
      if (guildOf(o) === g) guildEggs += n;
    }
  }
  if (liveCount(w) + all >= w.cap) return false;
  const mine = (sp ? sp.alive : 0) + spEggs;
  if (sp && mine >= softPop(w) * SPECIES_SHARE) return false;
  // the soft cap is shared out by GUILD: a meadow full of grazers mustn't stop the lake's fish or
  // the hunters breeding (under one global cap they could only breed while rarer than RARE, and
  // drifted out one by one even with their food at full stock)
  // (a hunter kind's floor is lower: at sixteen apiece, two kinds of hunter under it ran to twice the
  // guild's share between them, and ate the valley's small prey out)
  if (!sp || mine >= (g === 'hunter' ? RARE_HUNTER : RARE)) {
    let n = guildEggs;
    for (const o of w.creatures) if (o.alive && guildOf(o) === g) n++;
    if (n >= softPop(w) * GUILD_SHARE[g]) return false;
  }
  return true;
}

/** Is there room for this creature's kind to grow — within the caps, not packed in with its own kind,
 *  and where the food web around it can carry one more? */
export function roomToBreed(w: World, c: Creature, near: Creature[]): boolean {
  if (!capsAllow(w, c, true)) return false;
  let crowd = 0;
  for (const o of near) if (o !== c && o.species === c.species && w.surface.dist(c, o) < 9) crowd++;
  return crowd < 7 && foodWebCarries(w, c, near);
}

/** how far around it (bu) a breeder's food is reckoned */
const CARRY_R = 22;
/** what one more mouth needs around it: a grazer, this much standing grass and fruit (energy) for each
 *  grazer there; a swimmer, this much algae for each swimmer */
const CARRY_GRAZE = 80;
const CARRY_ALGAE = 100;

/**
 * Can the food web around `c` carry one more of its kind — the grass and fruit it grazes, the algae it
 * sieves, against the others of its guild that eat it there? The valley's quotas (capsAllow) are its
 * outer ceiling; inside them it is food that decides where a grazer or a swimmer can grow. A hunter is
 * held by its prey already: it breeds only well fed (decide), and it is fed only by what it catches. (A
 * gate on the prey in sight as well — twice its weight for each hunter there — left no hunter in any
 * valley past its fourth generation.)
 */
function foodWebCarries(w: World, c: Creature, near: Creature[]): boolean {
  const g = guildOf(c);
  if (g === 'hunter') return true;
  const S = w.surface;
  let mouths = 1;
  for (const o of near) if (o !== c && o.alive && guildOf(o) === g && S.dist(c, o) < CARRY_R) mouths++;
  const field = g === 'water' ? w.algae : w.grass;
  const per = g === 'water' ? ALGAE_ENERGY : GRASS_ENERGY;
  let food = S.fieldNear(field, c, CARRY_R);
  food *= per;
  if (g !== 'water') for (const p of S.plantsWithin(w.plants, c, CARRY_R)) if (S.inReach(c, p, CARRY_R)) food += p.fruit * FRUIT_ENERGY;
  return food >= (g === 'water' ? CARRY_ALGAE : CARRY_GRAZE) * mouths;
}

/** A pair made to breed, for god mode: both fed and rested for it first (null `m`: it buds alone). */
export function breedNow(w: World, a: Creature, m: Creature | null): void {
  for (const c of m ? [a, m] : [a]) {
    c.energy = c.traits.maxEnergy * growthOf(c);
    c.breedCooldown = 0;
  }
  breed(w, a, m);
}

/** Mate (or bud, when `m` is null): pay the cost and drop a litter — possibly mutated. */
export function breed(w: World, a: Creature, m: Creature | null): void {
  const t = a.traits;
  const cost = t.maxEnergy * 0.34;
  if (a.energy < cost * 1.4) return;
  // the caps again: a courtship begun under them can end over them (the dance takes a while, and
  // its partner skips the check) — the pair simply part
  if (!capsAllow(w, a)) return;
  a.energy -= cost;
  a.breedCooldown = t.lifespan * 0.07;
  if (m) {
    m.energy -= m.traits.maxEnergy * 0.2;
    m.breedCooldown = m.traits.lifespan * 0.07;
  }
  const sp = speciesById(w, a.species);
  if (!sp) return;
  // an egg-layer's clutch runs one larger than a live-bearer's litter (eggs are cheaper, and many
  // never hatch)
  const n = t.litter + (m && t.oviparous ? 1 : 0);
  let nest: number | undefined;
  for (let i = 0; i < n && liveCount(w) < w.cap; i++) {
    // a pair's young are a cross of both (a budder's are its own genome); a mutation sometimes rides
    // along. A mutant is variation within its parents' species: see speciateDaily
    let genome = m && m.genome !== a.genome ? crossover(a.genome, m.genome, mix32(w.seed, w.stepCount, a.id, i, 0xc4)) : a.genome;
    const species = sp;
    const egg = !!m && t.oviparous;
    if (w.rng() < MUTATION_CHANCE * w.god.mutation) {
      const from = genome;
      genome = mutate(genome, mix32(w.seed, w.stepCount, a.id, i), i, WORLD_MUTATION);
      holdDiet(genome, from, unitHash(w.seed, w.stepCount, a.id, i, 0xd1e7));
      w.tally.mutations++;
    }
    const ct = bodyOf(genome).traits;
    // a body too far gone is never born (an egg of one never hatches: see hatch)
    if (!egg && fitOf(w, genome, species) < STILLBORN) {
      w.tally.stillborn++;
      continue;
    }
    if (egg) {
      // an egg in the clutch: a ring of them around the mother's spot, hatching in a third of a day
      const ang = (i / Math.max(1, n)) * Math.PI * 2 + a.wanderSeed;
      const r = 0.35 + 0.12 * n;
      const at = w.surface.around(a, ang, r);
      const id = w.nextId++;
      nest ??= id;
      w.eggs.push({
        id,
        ...w.surface.laid(at),
        genome,
        species: species.id,
        mother: a.id,
        generation: a.generation + 1,
        laidAt: w.time,
        hatchAt: w.time + HATCH_TIME * (0.85 + 0.3 * w.rng()),
        nest,
        water: w.surface.height(a) < WATER_LEVEL,
      });
      a.children++;
      m.children++;
      if (i === 0) log(w, 'birth', `${aName(species.name)} laid ${n > 1 ? `${n} eggs` : 'an egg'}`, species.id, a.id);
      continue;
    }
    let at: Place = w.surface.offset(a, (w.rng() - 0.5) * 3, (w.rng() - 0.5) * 3);
    if (!canStand(w, ct, at)) at = a;
    const child = spawn(w, genome, species, at, false, a);
    w.tally.births++;
    w.surface.faceLike(child, a, w.rng() - 0.5);
    a.children++;
    if (m) m.children++;
    if (i === 0) log(w, 'birth', `${aName(species.name)} was born${m ? '' : ' (budded)'}`, species.id, child.id);
  }
}

/** Eggs whose time has come hatch into juveniles (if the valley has room for them). */
export function hatch(w: World): void {
  let hatched = 0;
  const keep: Egg[] = [];
  for (const e of w.eggs) {
    if (w.time < e.hatchAt) {
      keep.push(e);
      continue;
    }
    const parentSp = speciesById(w, e.species);
    if (!parentSp || liveCount(w) >= w.cap) continue; // no room: the egg fails
    // a hatchling is of its parents' species — or of what their line has become while it was in the egg
    const sp = successorOf(w, parentSp);
    // an egg whose body was too far gone never hatches
    if (fitOf(w, e.genome, sp) < STILLBORN) {
      w.tally.stillborn++;
      continue;
    }
    // the clutch outlived its parents: the line carries on
    if (sp.extinctAt !== null) sp.extinctAt = null;
    const mum = w.creatures.find((c) => c.id === e.mother && c.alive) ?? null;
    const ct = bodyOf(e.genome).traits;
    let at: Place = e;
    if (!canStand(w, ct, at) && mum) at = mum;
    const child = spawn(w, e.genome, sp, at, false, mum);
    child.generation = e.generation;
    child.parent = e.mother;
    w.surface.faceAnywhere(child, w.rng);
    w.tally.births++;
    if (hatched++ === 0) log(w, 'birth', `${aName(sp.name)} hatched`, sp.id, child.id);
  }
  w.eggs = keep;
}
