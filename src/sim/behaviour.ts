/**
 * Behaviour — one creature's life from moment to moment: its metabolism and needs (live), what it decides
 * to do about them (decide: flee, sleep, eat, breed, wander), and how it finds a meal it can reach. Every
 * place, distance and search goes through the world's surface (surface.ts).
 */
import { BREATHES_AIR } from './traits';
import { distance as morphDistance } from '../engine/morphospace';
import { unitHash } from '../engine/rng';
import type { Place } from './surface';
import { AIRBORNE, canStand, cellCenter, cellOf, DAY_LENGTH, DECIDE_EVERY, descriptorOf, growthOf, MATE_FIT, MATE_LIKENESS, nearby, ROOST_REACH, SCENT, SOAR_BANK, SOAR_LIFT, SOAR_MASS, UPKEEP, type Action, type Creature, type Plant, type World } from './model';
import { breed, die, roomToBreed } from './population';
import { act } from './motion';
import { conspicuity, showiness, weatherCost } from './selection';

const NEAR: Creature[] = [];
const FEEDING = new Set<Action>(['graze', 'filter', 'forage', 'scavenge', 'eat', 'hunt']);
const SCENT_BUF: Creature[] = [];

// --- predator/prey relations -----------------------------------------------------------------------

/** Would `a` hunt `b`? Carnivores take anything they can overpower; omnivores only small prey. */
export function preysOn(a: Creature, b: Creature): boolean {
  if (a.species === b.species || !b.alive) return false;
  const ta = a.traits, tb = b.traits;
  if (ta.diet !== 'carnivore' && ta.diet !== 'omnivore') return false;
  // can it reach it? land hunters don't chase into deep water and vice versa
  if (ta.habitat === 'water' && tb.habitat === 'land') return false;
  if (ta.habitat === 'land' && tb.habitat === 'water') return false;
  const ma = ta.mass * growthOf(a) ** 3, mb = tb.mass * growthOf(b) ** 3;
  const limit = ta.diet === 'carnivore' ? 1.6 : 0.45;
  if (mb > ma * limit) return false;
  // too well armed / armoured to be worth it?
  const threat = tb.attack * (1 - ta.defense) / Math.max(1, ta.maxHealth);
  return threat < 0.12;
}

// --- one creature's life, one step ---------------------------------------------------------------

export function live(w: World, c: Creature, dt: number): void {
  const t = c.traits;
  c.age += dt;
  c.breedCooldown -= dt;
  const growth = growthOf(c);
  const asleep = c.action === 'sleep';

  // metabolism: resting burn + the cost of moving fast; sleep is cheap
  // flapping flight is dear: a flat surcharge while aloft (instead of the speed² running cost, which
  // an airspeed above sprint would make ruinous) and it tires faster
  // (asleep in a tree's crown is not flying)
  const aloft = c.alt > AIRBORNE && !(asleep && c.perch >= 0);
  // (the less lift it has, the dearer: a hawk at the edge of what its wings can carry pays half again a
  // songbird's share; a glider's descent costs it little, and so does a soarer riding a thermal)
  const moveCost = aloft ? t.metabolism * (t.flies ? (c.soarT > 0 ? 0.3 : 0.8 * (1 + Math.max(0, 1.4 - t.lift))) : 0.25) : t.metabolism * 1.6 * (c.speed / Math.max(0.1, t.sprint)) ** 2;
  // the warm-blooded burn more to keep warm through a hard winter
  // (…by its coat and its size: see selection.ts)
  const warmth = 1 + weatherCost(t, w);
  // …and a misbuilt body is dearer to keep than a well-made one
  const upkeep = 1 + UPKEEP * (1 - c.fit);
  c.energy -= (t.metabolism * warmth * upkeep * (asleep ? 0.55 : 1) * growth ** 2 + moveCost) * dt;
  // (flapping tires; riding a thermal no more than walking)
  c.fatigue = Math.min(1, Math.max(0, c.fatigue + (asleep ? -dt / (DAY_LENGTH * 0.22) : (aloft && c.soarT <= 0 ? 1.4 : 1) * dt / (DAY_LENGTH * 0.62))));
  if (c.energy <= 0) {
    c.energy = 0;
    c.health -= t.maxHealth * 0.04 * dt; // starving
  } else if (c.energy > t.maxEnergy * 0.3) {
    c.health = Math.min(t.maxHealth * growth, c.health + t.maxHealth * 0.006 * dt);
  }
  c.energy = Math.min(c.energy, t.maxEnergy * growth);

  // a gilled body out of the water: its breath runs down, and past its time it is suffocating
  if (t.ashore < BREATHES_AIR) {
    if (w.surface.groundOf(c) > w.surface.level(c) + 0.1 && c.alt <= AIRBORNE) c.dry += dt;
    else c.dry = Math.max(0, c.dry - dt * 4);
    if (c.dry > t.ashore) c.health -= t.maxHealth * 0.08 * dt;
  }
  if (c.health <= 0) return die(w, c, c.energy <= 0 ? 'starvation' : 'predation');
  if (c.age > t.lifespan * c.lifeFactor) return die(w, c, 'old age');

  c.decideIn -= dt;
  if (c.decideIn <= 0) {
    c.decideIn = DECIDE_EVERY * (0.8 + 0.4 * w.rng());
    decide(w, c);
  }
  act(w, c, dt);
  w.surface.settle(c);
}

function decide(w: World, c: Creature): void {
  const S = w.surface;
  const t = c.traits;
  const asleep = c.action === 'sleep';
  const sight = t.vision * (asleep ? 0.35 : 1) * (S.night(c, w.time) && !t.nocturnal ? 0.6 : 1);
  const near = nearby(w, c, sight, NEAR);

  // 1. danger — the nearest thing that hunts us (or just bit us)
  let threat: Creature | null = null;
  let threatD = Infinity;
  for (const o of near) {
    if (o === c) continue;
    const bitUs = o.id === c.attacker && w.time - c.attackedAt < 4;
    if (!bitUs && !preysOn(o, c)) continue;
    if (c.alt > AIRBORNE * 3 && !o.traits.flies) continue; // safe on the wing from anything that walks
    const d = S.dist(c, o);
    // flight distance: a hunter charging at it is seen at once, one charging at another a little nearer;
    // a stalker creeping in low goes unnoticed until it is half as near; a hunter about its own business —
    // eating, wandering — is watched, and fled when it comes within two-fifths of sight, a sleeping one
    // only when nearly stepped on. (Prey that bolted from every hunter in sight spent two days in five
    // running or crouched in a bush, and starved; prey that let hunters come close was eaten.)
    if (!bitUs) {
      const hunting = o.action === 'hunt';
      const charging = hunting && o.chaseT > 0;
      // (a stalker matched to its ground creeps nearer before it is made out: see selection.ts)
      const reach = charging ? (o.target === c.id ? 1 : 0.6) : hunting ? 0.5 * (SEEN_FLOOR + (1 - SEEN_FLOOR) * seenAs(w, o)) : o.action === 'sleep' ? 0.15 : 0.4;
      if (d > sight * reach) continue;
    }
    if (d < threatD) {
      threatD = d;
      threat = o;
    }
  }
  // an alarm runs through a herd: kin bolting from a hunter set the rest running from it too, before
  // they've seen it themselves (and wake the sleepers)
  let alarmed = false;
  if (!threat && t.herding > 0.3) {
    for (const o of near) {
      // only close kin carry the alarm, and only about a hunter that is close enough to matter
      if (o === c || o.species !== c.species || o.action !== 'flee') continue;
      if (S.dist(c, o) > 9) continue;
      const th = w.creatures.find((x) => x.id === o.target && x.alive);
      if (!th || (c.alt > AIRBORNE * 3 && !th.traits.flies)) continue;
      const d = S.dist(c, th);
      if (d > t.vision * 0.8) continue;
      threat = th;
      threatD = d;
      alarmed = true;
      break;
    }
  }
  // the young bolt when their parent does (they follow it through the escape, not just a stroll)
  if (!threat && c.age < t.maturity && c.parent !== null) {
    const mum = w.creatures.find((o) => o.id === c.parent && o.alive);
    if (mum && mum.action === 'flee' && S.dist(c, mum) < 20) {
      const th = w.creatures.find((x) => x.id === mum.target && x.alive);
      if (th) {
        threat = th;
        threatD = S.dist(c, th);
        alarmed = true;
      }
    }
  }
  if (threat && (!asleep || threatD < sight || alarmed)) {
    c.action = 'flee';
    c.target = threat.id;
    return;
  }

  // a gilled body ashore for half its breath goes back to the water, whatever it was doing
  if (t.ashore < BREATHES_AIR && c.dry > t.ashore * 0.5 && S.groundOf(c) > S.level(c) + 0.1) {
    const back = S.nearestWhere(c, true);
    if (back) {
      c.action = 'wander';
      c.target = -1;
      S.aim(c, back);
      return;
    }
  }

  // hysteresis: a meal in progress continues until full, a courtship until it's done — re-deliberating
  // every half-second would otherwise drop the food the moment hunger dipped under the threshold
  // that started the meal, and nobody but the grazers ever got fed enough to breed
  const hunger = 1 - c.energy / (t.maxEnergy * growthOf(c));
  if (FEEDING.has(c.action) && hunger > 0.04) return;
  if (c.action === 'mate' && c.breedCooldown <= 0) return;

  // 2. sleep — when tired at its time of day; a sleeper keeps sleeping until rested
  const night = S.night(c, w.time);
  const myNight = t.nocturnal ? !night : night;
  if (asleep && c.fatigue > 0.1 && hunger < 0.9) return;
  if ((c.fatigue > 0.9 || (c.fatigue > 0.5 && myNight)) && hunger < 0.8) {
    // a flier roosts in the crown of the nearest broadleaf it can reach, out of reach of anything that
    // walks: it makes for the tree, and goes up into it to sleep
    if (t.flies && c.perch < 0) {
      const i = S.nearestTree(c, ROOST_REACH);
      if (i >= 0) {
        const tree = S.trees()[i];
        if (S.dist(c, tree) > 2.5) {
          c.action = 'wander';
          c.target = -1;
          S.aim(c, tree);
          return;
        }
        c.perch = i;
      }
    }
    // a creature of both worlds that breathes air hauls out to sleep (a seal on the rocks, an otter on
    // the bank): it swims for the shore first, and sleeps once it is on dry ground
    if (t.habitat === 'amphibious' && t.ashore >= BREATHES_AIR && S.groundOf(c) < S.level(c) - 0.3) {
      const bank = S.nearestWhere(c, false, 90); // (from the middle of a wide lake, too)
      if (bank) {
        c.action = 'wander';
        c.target = -1;
        S.aim(c, bank);
        return;
      }
    }
    c.action = 'sleep';
    return;
  }

  // 3. eat — grazers nibble whenever not full; others eat when properly hungry
  const grazer = t.diet === 'herbivore' || t.diet === 'filter';
  if (hunger > (grazer ? 0.25 : 0.4)) {
    if (findFood(w, c, near, sight, hunger)) return;
  }

  // 4. breed — well fed, adult, and not crowded: a dense herd breeds slowly, a full world not at all
  // only animals in good condition breed — so a population that has stripped its food stops
  // multiplying before it starves (the boom-bust brake). Hunters feast and fast, so their bar is lower.
  // (the cold-blooded breed on less: burning little to stay alive, a fish or a frog spawns on a fair meal,
  // not a full store — held to the warm-blooded bar, a lake's fish were fed well enough to court one hour
  // in twenty-five, and a line of them seldom outlived a bad year)
  const fedEnough = t.diet === 'carnivore' ? 0.45 : t.endotherm ? 0.28 : 0.4;
  if (c.age > t.maturity && c.breedCooldown <= 0 && hunger < fedEnough && roomToBreed(w, c, near)) {
    // the nearest willing partner — favouring one that looks like itself (like prefers like: it keeps a
    // species' form together, and lets two forms within one drift apart)
    let mate: Creature | null = null;
    let md = Infinity;
    const mine = descriptorOf(c.genome);
    for (const o of near) {
      if (o === c || o.species !== c.species || o.age < o.traits.maturity || o.breedCooldown > 0) continue;
      if (o.energy < o.traits.maxEnergy * 0.45 || o.action === 'sleep' || o.action === 'flee') continue;
      // (…and a showy one: a crest, a bright coat, a bold pattern — see selection.ts)
      const d = (S.dist(c, o) * (1 + MATE_LIKENESS * morphDistance(mine, descriptorOf(o.genome))) * (1 + MATE_FIT * (1 - o.fit))) / (1 + MATE_SHOW * showiness(o.genome));
      if (d < md) {
        md = d;
        mate = o;
      }
    }
    if (mate) {
      c.action = 'mate';
      c.target = mate.id;
      c.courtT = 0;
      return;
    }
    // radial / oozing kinds bud alone when there is no partner (well fed, not brim-full: slow drifters
    // in a wide lake seldom meet, and budding only when full kept a lake's cephalopods to a handful)
    if ((t.locomotion === 'drift' || t.locomotion === 'ooze') && hunger < 0.3) {
      breed(w, c, null);
      return;
    }
    // no one in sight: call — head for the nearest of its kind within earshot (solitary hunters and
    // scattered shoals would otherwise never meet)
    // roaming hunters range far wider to find a mate than herd animals ever need to
    const far = nearby(w, c, t.vision * SCENT * (t.diet === 'carnivore' ? 2 : 1), SCENT_BUF);
    let call: Creature | null = null;
    let cd = Infinity;
    for (const o of far) {
      if (o === c || o.species !== c.species || o.age < o.traits.maturity) continue;
      const d = S.dist(c, o);
      if (d < cd) {
        cd = d;
        call = o;
      }
    }
    if (call) {
      c.action = 'wander';
      c.target = -1;
      S.aim(c, call);
      return;
    }
  }

  // a flight in progress finishes at its destination (re-picking a stroll every half-second would
  // keep a flier circling aloft forever, never arriving anywhere to land)
  if (c.action === 'wander' && c.alt > AIRBORNE && S.toGoal(c) > 6) return;

  // a big flier with nothing to do on a fine day rides the thermals: up high, circling, for a minute or
  // two at a time, at little cost (a hawk's day is mostly this)
  const spell = Math.floor(w.time / 20);
  if (t.flies && t.lift >= SOAR_LIFT && t.mass >= SOAR_MASS && !night && hunger < 0.35 && c.age > t.maturity && unitHash(w.seed, c.id, spell, 0x50a) < 0.12) {
    c.action = 'wander';
    c.target = -1;
    c.soarT = 45 + 75 * unitHash(w.seed, c.id, spell, 0x50b);
    S.aim(c, S.ahead(c, SOAR_BANK, 30));
    return;
  }

  // 5. wander — herd animals drift toward their own kind; a hungry hunter follows its nose; the young
  // keep close to a parent
  c.action = 'wander';
  c.target = -1;
  // a mother keeps close to her clutch until it hatches
  const clutch = w.eggs.find((e) => e.mother === c.id);
  if (clutch) {
    S.aim(c, S.around(clutch, c.wanderSeed + w.time * 0.25, 2.2));
    return;
  }
  if (c.age < t.maturity && c.parent !== null) {
    const mum = w.creatures.find((o) => o.id === c.parent && o.alive);
    if (mum && S.dist(c, mum) < 60) {
      S.aim(c, S.around(mum, c.wanderSeed + w.time * 0.3, 1.5 + mum.traits.radius * 2));
      return;
    }
  }
  if ((t.diet === 'carnivore' || t.diet === 'omnivore') && hunger > 0.45) {
    const far = nearby(w, c, t.vision * SCENT, SCENT_BUF);
    let best: Creature | null = null;
    let bd = Infinity;
    for (const o of far) {
      if (!preysOn(c, o)) continue;
      const d = S.dist(c, o);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) {
      S.aim(c, S.offset(best, (w.rng() - 0.5) * 6, (w.rng() - 0.5) * 6));
      return;
    }
  }
  const herd = t.herding > 0 ? S.centroid(near, (o) => o !== c && o.species === c.species) : null;
  // a well-fed flier sometimes ranges far — the trip is flown
  // (rolled at every deliberation, so the odds are per ~0.6 s: about one roam per half-minute adrift)
  const wanderR = t.flies && hunger < 0.3 && w.rng() < 0.02 ? 24 + t.flySpeed * 3 : 6 + t.speed * 4;
  let to = S.ahead(c, (w.rng() - 0.5) * 1.6, wanderR);
  if (herd && S.dist(c, herd) > 5) to = S.pull(to, herd, t.herding, 0.7);
  // keep the destination inside the world (a target past the edge was never reached: the walker
  // turned back at the wall, but a flier on a long trip slid along it forever)
  S.aim(c, S.keepInside(to, 10));
}

/** Below this mass, prey can hide from hunters in the bushes. */
export const COVER_MASS = 1.5;

/** The nearest bush to a place within `within` (a tie to the one placed first). */
export function nearestBush(w: World, p: Place, within: number): Plant | null {
  return w.surface.nearestBush(w.plants, p, within);
}

/** A small animal crouched in a thicket while it flees — out of any hunter's reach. */
export function hidden(w: World, c: Creature): boolean {
  if (c.action !== 'flee' || c.traits.mass >= COVER_MASS || c.alt > AIRBORNE) return false;
  const b = nearestBush(w, c, 4);
  return !!b && w.surface.dist(c, b) < b.size * 0.8 + 0.45;
}

/** Pick the best food in sight for this diet; returns true if a food action was chosen. */
function findFood(w: World, c: Creature, near: Creature[], sight: number, hunger: number): boolean {
  const S = w.surface;
  const t = c.traits;
  const eatsPlants = t.diet === 'herbivore' || t.diet === 'omnivore';
  const eatsFruit = t.diet === 'herbivore' || t.diet === 'omnivore' || t.diet === 'nectar';
  const eatsMeat = t.diet === 'carnivore' || t.diet === 'omnivore';

  let best = -Infinity;
  let pick: { action: Action; target: number; at: Place } | null = null;
  const consider = (score: number, action: Action, target: number, at: Place) => {
    if (score > best) {
      best = score;
      pick = { action, target, at };
    }
  };

  // carcasses — an easy meal for scavengers
  if (eatsMeat) {
    for (const k of w.corpses) {
      const d = S.dist(c, k);
      if (d > sight || !reachable(w, c, k)) continue;
      consider(30 - d * 0.5 + Math.min(20, k.meat * 0.1), 'scavenge', k.id, k);
    }
    // a clutch left unguarded: eggs of another kind (raided only when properly hungry)
    if (hunger > 0.35) {
      for (const e of w.eggs) {
        if (e.species === c.species) continue;
        const d = S.dist(c, e);
        if (d > sight || !reachable(w, c, e)) continue;
        const guarded = w.creatures.some((o) => o.id === e.mother && o.alive && S.dist(e, o) < 3);
        consider(22 - d * 0.6 - (guarded ? 14 : 0), 'scavenge', e.id, e);
      }
    }
  }
  // prey
  if (eatsMeat && hunger > (t.diet === 'carnivore' ? 0.3 : 0.55)) {
    for (const o of near) {
      if (o === c || !preysOn(c, o)) continue;
      if (!t.flies && o.alt > AIRBORNE * 3) continue; // out of reach in the air
      if (hidden(w, o)) continue; // gone to ground
      const d = S.dist(c, o);
      // (an animal matched to the ground it stands on is spotted only nearer: see selection.ts)
      if (d > sight * (SEEN_FLOOR + (1 - SEEN_FLOOR) * seenAs(w, o))) continue;
      // the young, the weak, the asleep are easier — and anything it can outrun
      const outrun = (t.sprint - o.traits.sprint * (0.75 + 0.25 * growthOf(o))) / t.sprint;
      const ease = (o.action === 'sleep' ? 8 : 0) + (1 - o.health / o.traits.maxHealth) * 10 + (o.age < o.traits.maturity ? 6 : 0) + 8 * Math.max(-1, Math.min(1, outrun));
      // …and what it is worth: a deer feeds a cat for days, a mouse for an afternoon (hunters that took
      // the easiest prey alone ate the valley's small kinds out and left the big ones be)
      const go = growthOf(o);
      const worth = 6 * Math.min(1, ((o.traits.maxEnergy * 0.8 + 30) * go * go) / (t.maxEnergy * 0.6));
      consider((t.diet === 'carnivore' ? 22 : 8) - d * 0.6 + ease + worth, 'hunt', o.id, o);
    }
  }
  // fruit
  if (eatsFruit) {
    for (const p of S.plantsWithin(w.plants, c, sight)) {
      if (p.fruit < 1) continue;
      const d = S.dist(c, p);
      if (d > sight || !reachable(w, c, p)) continue;
      consider((t.diet === 'nectar' ? 30 : t.diet === 'herbivore' ? 8 : 16) - d * 0.45 + p.fruit, 'forage', p.id, p);
    }
  }
  // grass — search a ring of cells for the richest within reach
  // (a fish grazes only what grows where it can flop to: see canStand)
  if (eatsPlants) {
    const here = cellOf(w, c);
    let bk = -1, bs = -Infinity;
    const r = Math.min(sight, 22);
    const steps = 10;
    for (let i = 0; i < steps * 2; i++) {
      const ang = c.wanderSeed + i * 2.399; // golden-angle probes
      const rr = r * Math.sqrt((i + 0.5) / (steps * 2));
      const at = S.around(c, ang, rr);
      if (!S.inBounds(at) || !reachable(w, c, at)) continue;
      const k = cellOf(w, at);
      const s = w.grass[k] * 10 - rr * 0.25;
      if (s > bs) {
        bs = s;
        bk = k;
      }
    }
    if (w.grass[here] > 0.25) {
      bk = here;
      bs = w.grass[here] * 10 + 2;
    }
    if (bk >= 0 && w.grass[bk] > 0.12) {
      const cc = cellCenter(w, bk);
      consider(bs + (t.diet === 'herbivore' ? 6 : -4), 'graze', bk, S.offset(cc, (w.rng() - 0.5) * 2, (w.rng() - 0.5) * 2));
    }
  }
  // algae — filter feeders sieve the lake
  // (…and anything that swims well and is not a pure hunter grazes it as it goes: a fish, a lobe-fin)
  if (t.diet === 'filter' || (t.swim >= 0.45 && t.diet !== 'carnivore')) {
    let bk = -1, bs = -Infinity;
    for (let i = 0; i < 20; i++) {
      const ang = c.wanderSeed + i * 2.399;
      const rr = Math.min(sight, 26) * Math.sqrt((i + 0.5) / 20);
      const at = S.around(c, ang, rr);
      if (!S.inBounds(at) || !reachable(w, c, at) || S.height(at) > S.level(at) - 0.05) continue;
      const k = cellOf(w, at);
      const s = w.algae[k] * 10 - rr * 0.2;
      if (s > bs) {
        bs = s;
        bk = k;
      }
    }
    const hereA = cellOf(w, c);
    if (w.algae[hereA] > 0.2) {
      bk = hereA;
      bs = w.algae[hereA] * 10 + 2;
    }
    if (bk >= 0 && w.algae[bk] > 0.1) consider(bs + 4, 'filter', bk, cellCenter(w, bk));
  }
  if (!pick) return false;
  const chosen = pick as { action: Action; target: number; at: Place };
  if (chosen.action !== c.action || chosen.target !== c.target) c.chaseT = 0;
  c.action = chosen.action;
  c.target = chosen.target;
  S.aim(c, chosen.at);
  return true;
}

/** Can `c` get to a place for a meal — and, a gilled body going ashore, back to the water before its breath
 *  runs out? (A lobe-finned fish takes the carcass at the waterline, not the fruit up the bank.) */
function reachable(w: World, c: Creature, at: Place): boolean {
  const t = c.traits;
  if (!canStand(w, t, at)) return false;
  if (t.ashore >= BREATHES_AIR || w.surface.height(at) <= w.surface.level(at) + 0.1) return true;
  const pace = t.speed * (t.locomotion === 'swim' ? 0.15 + 0.85 * t.walk : 1);
  return w.surface.dist(c, at) <= Math.max(0, t.ashore - c.dry) * pace * 0.3;
}

/** how far, at the least, a body is seen against its ground (× sight): the best-matched coat is still seen
 *  at this share of the distance a glaring one is */
const SEEN_FLOOR = 0.45;
/** how strongly a mate is drawn to a showy partner: its distance counts 1 / (1 + MATE_SHOW × showiness) */
const MATE_SHOW = 1.5;

/** How plainly a creature shows: its coat against its ground, and any display it carries (0 … 1). */
function seenAs(w: World, c: Creature): number {
  return Math.min(1, conspicuity(w, c) + 0.35 * showiness(c.genome));
}
