/**
 * Motion — carrying out what a creature decided: steering over ground, water and air (flight, glides,
 * soaring, roosting), eating and biting on arrival, and keeping bodies from walking through one another.
 */
import type { Traits } from './traits';
import { heightAt, inBounds, WATER_LEVEL } from './terrain';
import { perchHeight, standsOf } from './stands';
import { climateOf, AIRBORNE, ALGAE_ENERGY, aName, canStand, cellOf, CLIMB, COURT_TIME, EGG_ENERGY, FRUIT_ENERGY, GRASS_ENERGY, growthOf, INTAKE, isNight, log, MEAT_ENERGY, SINK, SOAR_BANK, speciesById, type Creature, type World } from './model';
import { breed, die } from './population';
import { COVER_MASS, hidden, nearestBush } from './behaviour';

/** Carry out the current action for one step: steer, move, and eat / bite / mate on arrival. */
export function act(w: World, c: Creature, dt: number): void {
  const t = c.traits;
  const g = growthOf(c);
  let goal: { x: number; z: number } | null = null;
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
      const dx = c.x - th.x, dz = c.z - th.z;
      const d = Math.hypot(dx, dz) || 1;
      goal = { x: c.x + (dx / d) * 10, z: c.z + (dz / d) * 10 };
      pace = t.sprint / t.speed;
      // small prey dive for cover: the nearest bush that isn't past the hunter — and once in the
      // thicket it crouches there (no hunter can follow it in; see hidden())
      if (t.mass < COVER_MASS && t.habitat !== 'water' && c.alt <= AIRBORNE) {
        const b = nearestBush(w, c.x, c.z, 9);
        if (b) {
          const bx = b.x - c.x, bz = b.z - c.z;
          const bd = Math.hypot(bx, bz) || 1;
          if ((bx * -dx + bz * -dz) / (bd * d) < 0.5) {
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
        c.tx = c.x + Math.sin(c.heading + SOAR_BANK) * 30;
        c.tz = c.z + Math.cos(c.heading + SOAR_BANK) * 30;
        if (c.soarT <= 0) {
          c.soarT = 0;
          c.tx = c.x;
          c.tz = c.z;
          c.decideIn = 0;
        }
      }
      goal = { x: c.tx, z: c.tz };
      pace = 0.45;
      if (Math.hypot(c.tx - c.x, c.tz - c.z) < arrive) c.decideIn = Math.min(c.decideIn, 0.2);
      break;
    case 'graze':
    case 'filter': {
      const field = c.action === 'graze' ? w.grass : w.algae;
      const here = cellOf(w, c.x, c.z);
      const d = Math.hypot(c.tx - c.x, c.tz - c.z);
      // graze IN PLACE while the patch underfoot holds out; only travel when it is cropped bare
      if ((field[here] < 0.1 && d > arrive + 1.5) || !landed) {
        goal = { x: c.tx, z: c.tz };
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
        goal = { x: c.tx, z: c.tz };
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
      const d = Math.hypot(p.x - c.x, p.z - c.z);
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
        if (Math.hypot(e.x - c.x, e.z - c.z) > arrive + 0.4 || !landed) {
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
      const d = Math.hypot(k.x - c.x, k.z - c.z);
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
      const d = Math.hypot(prey.x - c.x, prey.z - c.z);
      const reach = (t.radius * g + prey.traits.radius * growthOf(prey)) * 0.9 + 0.5;
      // lead the target a little
      goal = { x: prey.x + Math.sin(prey.heading) * prey.speed * 0.4, z: prey.z + Math.cos(prey.heading) * prey.speed * 0.4 };
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
      const d = Math.hypot(m.x - c.x, m.z - c.z);
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
        const mx = (c.x + m.x) / 2, mz = (c.z + m.z) / 2;
        const ang = Math.atan2(c.x - mx, c.z - mz) + 0.9;
        const R = contact * 0.6 + 0.9;
        goal = { x: mx + Math.sin(ang) * R, z: mz + Math.cos(ang) * R };
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
function planFlight(w: World, c: Creature, goal: { x: number; z: number } | null): { x: number; z: number } | null {
  const t = c.traits;
  const aloft = c.alt > AIRBORNE;
  const d = goal ? Math.hypot(goal.x - c.x, goal.z - c.z) : 0;
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
    else if (c.action === 'flee' || (c.action === 'wander' && goal && d > 10 && heightAt(w.terrain, goal.x, goal.z) < heightAt(w.terrain, c.x, c.z) - 1.5)) {
      const reach = GLIDE_LEAP * glideRatio(t);
      const lx = c.x + Math.sin(c.heading) * reach, lz = c.z + Math.cos(c.heading) * reach;
      fly = inBounds(w.terrain, lx, lz) && canStand(w, t, lx, lz);
    }
  }
  if (!fly && aloft && !canStand(w, t, c.x, c.z)) {
    fly = true; // can't land here
    if (!goal) {
      // nowhere to be (asleep, feeding…) yet over water: head straight out from the lake
      const dx = c.x - w.terrain.lakeX, dz = c.z - w.terrain.lakeZ;
      const n = Math.hypot(dx, dz) || 1;
      goal = { x: c.x + (dx / n) * 12, z: c.z + (dz / n) * 12 };
    }
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

/** Turn toward the goal within the turn rate, then move — respecting habitat, terrain and bounds. */
function steer(w: World, c: Creature, goal: { x: number; z: number } | null, pace: number, dt: number): void {
  const t = c.traits;
  const g = growthOf(c);
  const ground = heightAt(w.terrain, c.x, c.z);
  // altitude: climb toward a per-creature cruising height while it wants the air, settle otherwise
  // (a hunter stoops at twice the sink rate)
  if (t.flies) {
    // a strong flier climbs fast and cruises high; one whose wings barely carry it labours up and keeps low
    const strength = Math.min(1, Math.max(0, (t.lift - 0.8) / 0.8));
    const cruise = 5 + 9 * strength + 4 * ((c.wanderSeed * 0.618) % 1) + (c.action === 'flee' ? 3 : 0) + (c.soarT > 0 ? 6 + 8 * strength : 0);
    // (asleep in a tree: up in its crown)
    const roost = c.perch >= 0 && c.action === 'sleep' ? perchHeight(standsOf(w.terrain).trees[c.perch]) : 0;
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
    if (ground < WATER_LEVEL) terrainMul = swimmer ? 1 : t.habitat === 'land' ? 0.45 : 0.3 + 0.7 * t.swim;
    else if (swimmer) terrainMul = 0.15 + 0.85 * t.walk;
  }
  // the cold-blooded are sluggish after dark, and in the cold of the year
  const chill = t.endotherm ? 1 : (isNight(w.time) ? 0.65 : 1) * Math.max(0.3, 1 - 0.3 * climateOf(w).cold);
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
  const want = Math.atan2(goal.x - c.x, goal.z - c.z);
  let dh = want - c.heading;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const maxTurn = t.turnRate * dt * (pace > 1 ? 1.3 : 1) * (aloft ? 0.7 : 1); // a wide banking turn aloft
  c.heading += Math.max(-maxTurn, Math.min(maxTurn, dh));

  const step = c.speed * dt;
  let nx = c.x + Math.sin(c.heading) * step;
  let nz = c.z + Math.cos(c.heading) * step;
  // airborne, only the world's edge stops it — water and steep ground pass beneath. (A body that has come
  // down where it cannot stand — a glider short of the bank — struggles on until it can.)
  const stranded = !aloft && !canStand(w, t, c.x, c.z);
  const ok = inBounds(w.terrain, nx, nz) && (aloft || stranded || canStand(w, t, nx, nz));
  if (!ok) {
    // blocked (shore / world edge): slide along by trying a turn either way
    for (const turn of [0.9, -0.9, 1.8, -1.8, Math.PI]) {
      const h = c.heading + turn;
      const tx = c.x + Math.sin(h) * step, tz = c.z + Math.cos(h) * step;
      if (inBounds(w.terrain, tx, tz) && (aloft || canStand(w, t, tx, tz))) {
        c.heading = h;
        nx = tx;
        nz = tz;
        break;
      }
      if (turn === Math.PI) {
        nx = c.x;
        nz = c.z;
        c.decideIn = 0;
      }
    }
  }
  // a glider over falling ground is that much higher above it (and over rising ground, lower)
  if (t.glides && !t.flies && c.alt > 0) c.alt = Math.max(0, c.alt + ground - heightAt(w.terrain, nx, nz));
  c.x = nx;
  c.z = nz;
  c.heading = Math.atan2(Math.sin(c.heading), Math.cos(c.heading));
}

/** A glider's leap (bu): how high it gets off flat ground. */
const GLIDE_LEAP = 1.4;
/** forward over down: 2 at the least lift a glider has (0.4), 6 at the most (0.8) */
function glideRatio(t: Traits): number {
  return 2 + 10 * Math.max(0, Math.min(0.4, t.lift - 0.4));
}

// --- room: bodies do not pass through each other ---------------------------------------------------

/** Two bodies on the ground ease apart once nearer than this share of their radii summed. A bite lands
 *  inside 0.9 of the sum and a mating inside all of it, and the pair engaged in either is let be
 *  anyway (see `engaged`): a long hunter's footprint must never hold its jaws off its prey. */
const ROOM = 0.8;
/** The share of an overlap eased out each second: over a pass (every other step) the whole of it, up
 *  to ROOM_PUSH — the eye still sees a shuffle, as the actor eases toward where the sim puts it. (At
 *  four a second, grazers drifting into one another as they fed outran it and stood inside each other.) */
const ROOM_RATE = 10;
/** A long body's footprint runs down its heading over this share of its length: its trunk, from the
 *  shoulders to the hips (a snout or a tail tip may still pass over a neighbour's). */
const ROOM_SPAN = 0.7;
/** the closest points of the last `segmentGap` (on the first segment, then the second) */
const ROOM_AT = new Float64Array(4);

/** The distance between segments p1 + s·d1 and p2 + t·d2 (s, t in 0..1); the closest points are
 *  left in ROOM_AT. */
function segmentGap(p1x: number, p1z: number, d1x: number, d1z: number, p2x: number, p2z: number, d2x: number, d2z: number): number {
  const rx = p1x - p2x, rz = p1z - p2z;
  const A = d1x * d1x + d1z * d1z, E = d2x * d2x + d2z * d2z, F = d2x * rx + d2z * rz;
  let s = 0, t = 0;
  if (A <= 1e-9) {
    if (E > 1e-9) t = Math.min(1, Math.max(0, F / E));
  } else {
    const C = d1x * rx + d1z * rz;
    if (E <= 1e-9) {
      s = Math.min(1, Math.max(0, -C / A));
    } else {
      const B = d1x * d2x + d1z * d2z;
      const den = A * E - B * B;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (B * F - C * E) / den)) : 0;
      t = (B * s + F) / E;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -C / A));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (B - C) / A));
      }
    }
  }
  ROOM_AT[0] = p1x + d1x * s;
  ROOM_AT[1] = p1z + d1z * s;
  ROOM_AT[2] = p2x + d2x * t;
  ROOM_AT[3] = p2z + d2z * t;
  return Math.hypot(ROOM_AT[0] - ROOM_AT[2], ROOM_AT[1] - ROOM_AT[3]);
}

/** A creature's footprint: its trunk, a segment out along its heading both ways by `half`, `r` round. */
function footprintOf(c: Creature): { half: number; r: number } {
  const g = growthOf(c);
  const r = c.traits.radius * g;
  return { half: Math.max(0, c.traits.length * g * ROOM_SPAN * 0.5 - r), r };
}

/** How far apart two creatures' footprints are, less the room they keep (negative: they overlap by that much). */
export function footprintGap(a: Creature, b: Creature): number {
  const fa = footprintOf(a), fb = footprintOf(b);
  const ax = Math.sin(a.heading) * fa.half, az = Math.cos(a.heading) * fa.half;
  const bx = Math.sin(b.heading) * fb.half, bz = Math.cos(b.heading) * fb.half;
  return segmentGap(a.x - ax, a.z - az, 2 * ax, 2 * az, b.x - bx, b.z - bz, 2 * bx, 2 * bz) - ROOM * (fa.r + fb.r);
}

/** A hunter at its prey's throat, or a pair courting: close is the point. */
function engaged(a: Creature, b: Creature): boolean {
  return ((a.action === 'hunt' || a.action === 'mate') && a.target === b.id) || ((b.action === 'hunt' || b.action === 'mate') && b.target === a.id);
}

/** keepRoom's per-step scratch: each body on the ground, its trunk's half-vector, the room it keeps
 *  and its weight, and the box round it (grown as the valley fills, never shrunk) */
const RS = {
  c: [] as Creature[],
  hx: new Float64Array(64), hz: new Float64Array(64), r: new Float64Array(64), m: new Float64Array(64),
  x0: new Float64Array(64), x1: new Float64Array(64), z0: new Float64Array(64), z1: new Float64Array(64),
  keys: new Float64Array(64),
};
function roomScratch(n: number): void {
  if (RS.hx.length >= n) return;
  const len = Math.max(n, RS.hx.length * 2);
  for (const k of ['hx', 'hz', 'r', 'm', 'x0', 'x1', 'z0', 'z1', 'keys'] as const) RS[k] = new Float64Array(len);
}
/** the sort key's index field: a box's west edge in 1/64 bu, then its body's index below it (a numeric
 *  sort of plain numbers, several times faster than sorting indices through a comparator) */
const ROOM_IDX = 4096;
/** the pass runs every other step, over both steps' time */
const ROOM_EVERY = 2;
/** the most a body is moved in one pass (bu) */
const ROOM_PUSH = 0.5;

/**
 * May a body pushed to (x, z) stand there? Its ground is known where it stands (`y`, from its own
 * step): well clear of the waterline, a push of ROOM_PUSH can't carry it across where it may stand
 * (a bu of height to spare, against banks no steeper than one in one), and the terrain — fractal
 * noise and the river's course, the dearest thing in the pass — goes unsampled.
 */
function mayStand(w: World, c: Creature, x: number, z: number): boolean {
  if (!inBounds(w.terrain, x, z)) return false;
  const t = c.traits;
  if (t.habitat === 'amphibious') return true;
  if (t.habitat === 'land' ? c.y > WATER_LEVEL + 0.5 : c.y < WATER_LEVEL - 1.3) return true;
  return canStand(w, t, x, z);
}

/**
 * Bodies keep their room. Released on one spot, or drawn to one another by the herd, animals stood
 * inside each other: two crocodiles crossed like a pair of scissors, centipedes ran through
 * centipedes. Each pair on the ground whose footprints overlap is eased apart along the line between
 * their nearest points, the lighter giving way the more — a mouse steps round a bear, not the bear
 * round the mouse. Not aloft (a flock passes over and under), not a fish against a walker (the one
 * is under the water, the other wades above it), never where the one moved couldn't stand.
 *
 * The pairs are found by sweep and prune (each body's box, sorted by its west edge, against the boxes
 * that start before its east edge ends): a body meets only the few it could touch, so a valley of a
 * hundred and fifty costs about what thirty did.
 */
export function keepRoom(w: World, dt: number): void {
  if (w.stepCount % ROOM_EVERY) return;
  const k = Math.min(1, dt * ROOM_EVERY * ROOM_RATE);
  const cs = RS.c;
  cs.length = 0;
  for (const c of w.creatures) if (c.alive && c.alt <= AIRBORNE) cs.push(c);
  const n = Math.min(cs.length, ROOM_IDX);
  if (n < 2) return;
  roomScratch(n);
  const keys = RS.keys.subarray(0, n);
  for (let i = 0; i < n; i++) {
    const c = cs[i];
    const g = growthOf(c);
    const r = c.traits.radius * g;
    const half = Math.max(0, c.traits.length * g * ROOM_SPAN * 0.5 - r);
    const hx = Math.sin(c.heading) * half, hz = Math.cos(c.heading) * half;
    const R = ROOM * r;
    RS.hx[i] = hx;
    RS.hz[i] = hz;
    RS.r[i] = R;
    RS.m[i] = c.traits.mass * g * g * g;
    RS.x0[i] = c.x - Math.abs(hx) - R;
    RS.x1[i] = c.x + Math.abs(hx) + R;
    RS.z0[i] = c.z - Math.abs(hz) - R;
    RS.z1[i] = c.z + Math.abs(hz) + R;
    // (the valley is a few hundred bu across: shifted positive, its 1/64ths fit far inside 2^53 with the index under them)
    keys[i] = Math.floor((RS.x0[i] + 65536) * 64) * ROOM_IDX + i;
  }
  keys.sort();
  const x0 = RS.x0;
  for (let oi = 0; oi < n; oi++) {
    const i = keys[oi] % ROOM_IDX;
    const a = cs[i];
    for (let oj = oi + 1; oj < n; oj++) {
      const j = keys[oj] % ROOM_IDX;
      if (x0[j] > RS.x1[i]) break; // sorted by the west edge: none further on can reach
      if (RS.z0[j] > RS.z1[i] || RS.z1[j] < RS.z0[i]) continue;
      const b = cs[j];
      if ((a.traits.habitat === 'water') !== (b.traits.habitat === 'water')) continue;
      const room = RS.r[i] + RS.r[j];
      const d = segmentGap(a.x - RS.hx[i], a.z - RS.hz[i], 2 * RS.hx[i], 2 * RS.hz[i], b.x - RS.hx[j], b.z - RS.hz[j], 2 * RS.hx[j], 2 * RS.hz[j]);
      if (d >= room || engaged(a, b)) continue;
      let dx = ROOM_AT[0] - ROOM_AT[2], dz = ROOM_AT[1] - ROOM_AT[3];
      if (d < 1e-6) {
        // trunks crossing at a point (or one on top of the other): part them across a's heading, the
        // side picked by where b stands (by their ids if it stands dead on the line)
        const side = Math.sin(a.heading) * (b.z - a.z) - Math.cos(a.heading) * (b.x - a.x);
        const sgn = Math.abs(side) > 1e-6 ? Math.sign(side) : (a.id + b.id) % 2 ? 1 : -1;
        dx = Math.cos(a.heading) * sgn;
        dz = -Math.sin(a.heading) * sgn;
      } else {
        dx /= d;
        dz /= d;
      }
      // the lighter gives way: each moves by the other's share of their combined weight (a herd
      // released in a heap parts over a second or two, not in one leap)
      const ma = RS.m[i], mb = RS.m[j];
      const push = Math.min(ROOM_PUSH, (room - d) * k);
      const sa = (push * mb) / (ma + mb), sb = (push * ma) / (ma + mb);
      const ax = a.x + dx * sa, az = a.z + dz * sa;
      if (mayStand(w, a, ax, az)) {
        a.x = ax;
        a.z = az;
      }
      const bx = b.x - dx * sb, bz = b.z - dz * sb;
      if (mayStand(w, b, bx, bz)) {
        b.x = bx;
        b.z = bz;
      }
    }
  }
}
