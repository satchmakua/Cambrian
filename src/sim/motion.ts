/**
 * Motion — carrying out what a creature decided: steering over ground, water and air (flight, glides,
 * soaring, roosting), eating and biting on arrival, and keeping bodies from walking through one another.
 * Every place, distance and turn goes through the world's surface (surface.ts).
 */
import type { Traits } from './traits';
import { perchHeight } from './stands';
import type { Place } from './surface';
import { climateOf, AIRBORNE, ALGAE_ENERGY, aName, canStand, cellOf, CLIMB, COURT_TIME, EGG_ENERGY, FRUIT_ENERGY, GRASS_ENERGY, growthOf, INTAKE, log, MEAT_ENERGY, SINK, SOAR_BANK, speciesById, type Creature, type World } from './model';
import { breed, die } from './population';
import { COVER_MASS, hidden, nearestBush } from './behaviour';

/** Carry out the current action for one step: steer, move, and eat / bite / mate on arrival. */
export function act(w: World, c: Creature, dt: number): void {
  const S = w.surface;
  const t = c.traits;
  const g = growthOf(c);
  let goal: Place | null = null;
  let pace = 0; // fraction of cruise speed (>1 = sprinting)
  let arrive = 1.2 + t.radius * g;
  // (a roost is for sleeping, a thermal for idling: either ends when the creature is about anything else)
  if (c.action !== 'sleep') c.perch = -1;
  if (c.action !== 'wander') c.soarT = 0;
  // a flier comes down before it eats, grazes or courts (it keeps approaching while it settles)
  const landed = c.alt <= AIRBORNE;

  switch (c.action) {
    case 'sleep':
      pace = 0;
      break;
    case 'flee': {
      const th = w.creatures.find((o) => o.id === c.target && o.alive);
      if (!th) {
        c.action = 'wander';
        c.decideIn = 0;
        break;
      }
      const d = S.dist(c, th) || 1;
      goal = S.away(c, th, 10);
      pace = t.sprint / t.speed;
      // small prey dive for cover: the nearest bush that isn't past the hunter — and once in the
      // thicket it crouches there (no hunter can follow it in; see hidden())
      if (t.mass < COVER_MASS && t.habitat !== 'water' && c.alt <= AIRBORNE) {
        const b = nearestBush(w, c, 9);
        if (b) {
          const bd = S.dist(c, b) || 1;
          if (S.cosAt(c, b, th) < 0.5) {
            if (bd < b.size * 0.8 + 0.3) {
              goal = null; // crouched in the thicket
              pace = 0;
            } else goal = b;
          }
        }
      }
      if (d > t.vision * 1.2) {
        c.action = 'wander'; // escaped
        c.decideIn = 0;
      }
      break;
    }
    case 'wander':
      if (c.soarT > 0) {
        // circling: always making for a point ahead and to one side, it banks round and round
        c.soarT -= dt;
        S.aim(c, S.ahead(c, SOAR_BANK, 30));
        if (c.soarT <= 0) {
          c.soarT = 0;
          S.aim(c, c);
          c.decideIn = 0;
        }
      }
      goal = S.goal(c);
      pace = 0.45;
      if (S.toGoal(c) < arrive) c.decideIn = Math.min(c.decideIn, 0.2);
      break;
    case 'graze':
    case 'filter': {
      const field = c.action === 'graze' ? w.grass : w.algae;
      const here = cellOf(w, c);
      const d = S.toGoal(c);
      // graze IN PLACE while the patch underfoot holds out; only travel when it is cropped bare
      if ((field[here] < 0.1 && d > arrive + 1.5) || !landed) {
        goal = S.goal(c);
        pace = 0.8;
      } else {
        // crop the cell underfoot
        const k = here;
        const per = c.action === 'graze' ? GRASS_ENERGY : ALGAE_ENERGY;
        const rate = (INTAKE[t.diet][c.action === 'graze' ? 'grass' : 'algae'] ?? 1) * t.metabolism; // energy/s
        const bite = Math.min(field[k], (rate / per) * dt);
        field[k] -= bite;
        c.energy += bite * per;
        pace = 0.08; // shuffle while cropping
        goal = S.goal(c);
        if (c.energy > t.maxEnergy * g * 0.97) done(c);
        else if (field[k] < 0.04 && d <= arrive + 1.5) done(c); // patch and target both cropped
      }
      break;
    }
    case 'forage': {
      const p = w.plants.find((q) => q.id === c.target);
      if (!p || p.fruit < 0.2) {
        done(c);
        break;
      }
      const d = S.dist(c, p);
      arrive += p.size;
      if (d > arrive || !landed) {
        goal = p;
        pace = 0.85;
      } else {
        // a fruit every ~1.2 s
        const rate = (INTAKE[t.diet].fruit ?? 1) * t.metabolism;
        const per = FRUIT_ENERGY * (1 + t.mass * 0.6); // a big animal strips a bush faster for the same fruit count
        const take = Math.min(p.fruit, (rate / per) * dt);
        p.fruit -= take;
        c.energy += take * per;
        if (c.energy > t.maxEnergy * g * 0.97) done(c);
      }
      break;
    }
    case 'scavenge':
    case 'eat': {
      const k = w.corpses.find((q) => q.id === c.target);
      if (!k && c.action === 'scavenge') {
        // raiding a nest
        const ei = w.eggs.findIndex((q) => q.id === c.target);
        if (ei < 0) {
          done(c);
          break;
        }
        const e = w.eggs[ei];
        if (S.dist(c, e) > arrive + 0.4 || !landed) {
          goal = e;
          pace = 0.9;
        } else {
          w.eggs.splice(ei, 1);
          c.energy = Math.min(t.maxEnergy * g, c.energy + EGG_ENERGY);
          c.bitAt = w.time;
          done(c);
        }
        break;
      }
      if (!k || k.meat <= 0.5) {
        done(c);
        break;
      }
      const d = S.dist(c, k);
      if (d > arrive + 0.6 || !landed) {
        goal = k;
        pace = 1;
      } else {
        c.action = 'eat';
        const bite = Math.min(k.meat, (INTAKE[t.diet].meat ?? 1) * t.metabolism * dt);
        k.meat -= bite;
        c.energy += bite * MEAT_ENERGY;
        if (c.energy > t.maxEnergy * g * 0.97) done(c);
      }
      break;
    }
    case 'hunt': {
      const prey = w.creatures.find((o) => o.id === c.target && o.alive);
      if (!prey) {
        if (c.action === 'hunt') done(c);
        break;
      }
      if (hidden(w, prey)) {
        done(c); // it went to ground in a thicket: give it up
        c.decideIn = 2;
        break;
      }
      const d = S.dist(c, prey);
      const reach = (t.radius * g + prey.traits.radius * growthOf(prey)) * 0.9 + 0.5;
      // lead the target a little
      goal = S.ahead(prey, 0, prey.speed, 0.4);
      // STALK, then POUNCE: creep in at a crouching walk until within a short dash (or until the
      // prey bolts), then sprint all out — and give the dash up if it hasn't connected in a few
      // seconds, rather than run itself to death behind something faster
      const dash = reach + 2.5 + t.sprint * 0.9;
      const bolted = prey.action === 'flee' && prey.target === c.id;
      if (c.chaseT > 0 || d < dash || bolted || t.flies) {
        c.chaseT += dt;
        pace = t.sprint / t.speed;
      } else pace = 0.5;
      // jaws only meet at the same height: a walker can't bite a bird on the wing
      if (d < reach && Math.abs(prey.alt - c.alt) < reach + 0.6) {
        bite(w, c, prey, dt);
        c.chaseT = Math.min(c.chaseT, 0.5); // a struggle at the throat is not a lost chase
        pace = 0.3;
      }
      if (d > t.vision * 1.3 && c.action === 'hunt') done(c); // lost it
      else if (!t.flies && prey.alt > AIRBORNE * 3 && c.action === 'hunt') done(c); // it flew off
      else if (c.chaseT > 4.5 && c.action === 'hunt') {
        done(c); // spent: let it go and get its breath back
        c.decideIn = 2.5;
      }
      break;
    }
    case 'mate': {
      const m = w.creatures.find((o) => o.id === c.target && o.alive);
      if (!m || m.breedCooldown > 0 || m.action === 'flee') {
        done(c);
        break;
      }
      const d = S.dist(c, m);
      const contact = t.radius + m.traits.radius;
      if (d > contact + 3 || !landed || m.alt > AIRBORNE) {
        // court from close by and on the ground: approach first
        goal = m;
        pace = 0.75;
        c.courtT = 0;
      } else if (c.courtT < COURT_TIME) {
        // the display: the pair circle each other about their midpoint (the partner, if it's idle,
        // is drawn into the dance — two suitors orbiting the same way go round each other; one busy
        // feeding or hunting carries on and is simply courted)
        c.courtT += dt;
        if (m.action === 'wander' && m.age >= m.traits.maturity && m.breedCooldown <= 0) {
          m.action = 'mate';
          m.target = c.id;
          m.courtT = c.courtT;
        }
        const mid = S.mid(c, m);
        const ang = S.bearing(mid, c) + 0.9;
        const R = contact * 0.6 + 0.9;
        goal = S.around(mid, ang, R);
        pace = 0.3;
      } else if (d > contact + 0.8) {
        goal = m;
        pace = 0.5;
      } else if (c.breedCooldown <= 0) {
        breed(w, c, m);
        c.courtT = 0;
        done(c);
      }
      break;
    }
  }

  if (t.flies || t.glides || c.alt > 0) goal = planFlight(w, c, goal);
  steer(w, c, goal, pace, dt);
}

/**
 * Should a flier be in the air for what it is doing? Long trips, escapes and the approach to a
 * distant meal are flown; feeding, sleeping and courting happen on the ground. A hunter cruises in
 * high and stoops onto its prey from close range. It never sets down where it can't stand (over the
 * lake): it keeps flying — making for the shore if it had nowhere to go.
 */
function planFlight(w: World, c: Creature, goal: Place | null): Place | null {
  const S = w.surface;
  const t = c.traits;
  const aloft = c.alt > AIRBORNE;
  const d = goal ? S.dist(c, goal) : 0;
  // hysteresis on the INTENT, not the altitude: once it has decided to come down, a fresh nearby
  // goal picked during the descent mustn't send it climbing again
  const flying = c.fly;
  let fly = false;
  if (t.flies) {
    switch (c.action) {
      case 'flee':
        fly = true;
        break;
      case 'wander':
        // a stroll is walked; only a long trip (a far roam, a call to a distant mate) is flown
        fly = d > (flying ? 6 : 24);
        break;
      case 'forage':
      case 'scavenge':
        fly = d > (flying ? 5 : 14);
        break;
      case 'hunt':
        fly = d > (flying ? 6 : 16);
        break;
      default:
        fly = false;
    }
    if (c.energy < t.maxEnergy * growthOf(c) * 0.06) fly = false; // too spent to take off
  } else if (t.glides) {
    // a glider takes to the air only to escape, or to cross a long way down a slope — and only where it
    // would come down on ground it can stand on; once up, it rides its glide out
    if (flying && c.alt > 0.05) fly = true;
    else if (c.action === 'flee' || (c.action === 'wander' && goal && d > 10 && S.height(goal) < S.height(c) - 1.5)) {
      const leap = S.ahead(c, 0, GLIDE_LEAP * glideRatio(t));
      fly = S.inBounds(leap) && canStand(w, t, leap);
    }
  }
  if (!fly && aloft && !canStand(w, t, c)) {
    fly = true; // can't land here
    // nowhere to be (asleep, feeding…) yet over water: head straight for the shore
    if (!goal) goal = S.offWater(c, 12);
  }
  c.fly = fly;
  return goal;
}

/** The current action is finished or impossible — drop it and deliberate next step. */
export function done(c: Creature): void {
  c.action = 'wander';
  c.target = -1;
  c.decideIn = 0;
  c.courtT = 0;
  c.chaseT = 0;
}

function bite(w: World, a: Creature, b: Creature, dt: number): void {
  const ga = growthOf(a);
  const dmg = a.traits.attack * ga * ga * (1 - b.traits.defense) * dt;
  b.health -= dmg;
  b.attacker = a.id;
  b.attackedAt = w.time;
  a.bitAt = w.time;
  if (b.action === 'sleep') b.decideIn = 0; // woken
  // armed prey bite back
  const gb = growthOf(b);
  if (b.traits.attack * gb * gb > a.traits.attack * 0.35) {
    a.health -= b.traits.attack * gb * gb * 0.45 * (1 - a.traits.defense) * dt;
    if (a.health <= 0) {
      a.kills += 0;
      return;
    }
  }
  if (b.health <= 0) {
    const spA = speciesById(w, a.species), spB = speciesById(w, b.species);
    log(w, 'kill', `${aName(spA?.name ?? '?')} killed ${aName(spB?.name ?? '?')}`, a.species, b.id);
    a.kills++;
    die(w, b, 'predation');
    const corpse = w.corpses[w.corpses.length - 1];
    a.action = 'eat';
    a.target = corpse.id;
  }
}

/** the ways a blocked body tries in turn (radians off its heading), before it gives up and stands */
const SIDESTEPS = [0.9, -0.9, 1.8, -1.8, Math.PI];

/** Turn toward the goal within the turn rate, then move — respecting habitat, terrain and bounds. */
function steer(w: World, c: Creature, goal: Place | null, pace: number, dt: number): void {
  const S = w.surface;
  const t = c.traits;
  const g = growthOf(c);
  const ground = S.height(c);
  // altitude: climb toward a per-creature cruising height while it wants the air, settle otherwise
  // (a hunter stoops at twice the sink rate)
  if (t.flies) {
    // a strong flier climbs fast and cruises high; one whose wings barely carry it labours up and keeps low
    const strength = Math.min(1, Math.max(0, (t.lift - 0.8) / 0.8));
    const cruise = 5 + 9 * strength + 4 * ((c.wanderSeed * 0.618) % 1) + (c.action === 'flee' ? 3 : 0) + (c.soarT > 0 ? 6 + 8 * strength : 0);
    // (asleep in a tree: up in its crown)
    const roost = c.perch >= 0 && c.action === 'sleep' ? perchHeight(S.trees()[c.perch]) : 0;
    const want = c.fly ? cruise : roost;
    const sink = c.action === 'hunt' ? SINK * 2 : SINK;
    const climb = CLIMB * (0.35 + 0.65 * strength);
    c.alt = Math.max(0, c.alt + Math.max(-sink * dt, Math.min(climb * dt, want - c.alt)));
  } else if (t.glides || c.alt > 0) {
    // a glider cannot climb: it leaps up (or is already up) and comes down at its glide ratio — two
    // lengths forward for one down at the least lift, six at the most
    if (t.glides && c.fly && c.alt <= 0.05) c.alt = GLIDE_LEAP;
    c.alt = Math.max(0, c.alt - (c.speed / glideRatio(t)) * dt);
    if (c.alt === 0) c.fly = false;
  }
  const aloft = c.alt > AIRBORNE;
  const flying = aloft || c.fly;
  // in the water a body moves as well as it swims, on land as well as it walks: a land animal wades
  // slowly, an otter swims nearly as it runs, a lobe-finned fish crawls ashore at a fraction of its pace
  let terrainMul = 1;
  if (!aloft) {
    const swimmer = t.locomotion === 'swim' || t.locomotion === 'drift';
    if (ground < S.level(c)) terrainMul = swimmer ? 1 : t.habitat === 'land' ? 0.45 : 0.3 + 0.7 * t.swim;
    else if (swimmer) terrainMul = 0.15 + 0.85 * t.walk;
  }
  // the cold-blooded are sluggish after dark, and in the cold of the year
  const local = t.endotherm ? undefined : S.seasonsNow?.(w);
  const chill = t.endotherm ? 1 : (S.night(c, w.time) ? 0.65 : 1) * Math.max(0.3, 1 - 0.3 * (local ? local.cold[S.cellOf(c)] : climateOf(w).cold));
  // on the wing: a flier can't dawdle (a floor on the pace), sprints a little faster than it cruises,
  // and slows as it comes in to land
  const airPace = !c.fly ? (c.action === 'hunt' ? 1.1 : 0.5) : pace > 1 ? 1.25 : Math.max(0.7, pace);
  const targetSpeed = goal
    ? flying
      ? t.flySpeed * airPace
      : t.speed * pace * terrainMul * chill * (0.75 + 0.25 * g)
    : 0;
  c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 3);
  if (!goal || c.speed < 0.01) {
    if (!goal) c.speed *= Math.max(0, 1 - dt * 4);
    return;
  }
  const maxTurn = t.turnRate * dt * (pace > 1 ? 1.3 : 1) * (aloft ? 0.7 : 1); // a wide banking turn aloft
  S.turnToward(c, goal, maxTurn);

  const step = c.speed * dt;
  let next: Place = S.ahead(c, 0, step);
  // airborne, only the world's edge stops it — water and steep ground pass beneath. (A body that has come
  // down where it cannot stand — a glider short of the bank — struggles on until it can.)
  const stranded = !aloft && !canStand(w, t, c);
  const ok = S.inBounds(next) && (aloft || stranded || canStand(w, t, next));
  if (!ok) {
    // blocked (shore / world edge): slide along by trying a turn either way
    for (const turn of SIDESTEPS) {
      const tried = S.ahead(c, turn, step);
      if (S.inBounds(tried) && (aloft || canStand(w, t, tried))) {
        S.turn(c, turn);
        next = tried;
        break;
      }
      if (turn === Math.PI) {
        next = c; // nowhere to go: it stands, and thinks again
        c.decideIn = 0;
      }
    }
  }
  // a glider over falling ground is that much higher above it (and over rising ground, lower)
  if (t.glides && !t.flies && c.alt > 0) c.alt = Math.max(0, c.alt + ground - S.height(next));
  S.moveTo(c, next);
  S.tidy(c);
}

/** A glider's leap (bu): how high it gets off flat ground. */
const GLIDE_LEAP = 1.4;
/** forward over down: 2 at the least lift a glider has (0.4), 6 at the most (0.8) */
function glideRatio(t: Traits): number {
  return 2 + 10 * Math.max(0, Math.min(0.4, t.lift - 0.4));
}

// --- room: bodies do not pass through each other ---------------------------------------------------

/** Bodies on the ground ease apart where their footprints overlap: the lighter giving way, never where
 *  the one moved couldn't stand (the surface's own pass: see the valley's in valley.ts). */
export function keepRoom(w: World, dt: number): void {
  w.surface.keepRoom(w, dt);
}

/** How far apart two creatures' footprints are, less the room they keep (negative: they overlap by that much). */
export function footprintGap(w: World, a: Creature, b: Creature): number {
  return w.surface.footprintGap(a, b);
}
