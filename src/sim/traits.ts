/**
 * Ecological traits — what a grown body can DO, read off its anatomy.
 *
 * Nothing here is a separate "stats" gene: a creature's diet, speed, senses, weapons and habitat are
 * all derived from the phenotype the breeder already evolves. So the world selects on the same
 * bodies you breed: long legs run, fangs hunt, a beak forages, a carapace shrugs off bites, big eyes
 * see far, glowing eyes hunt at night, fins and gills keep a creature in the water. Evolving a body
 * in the Breed view and releasing it is therefore a real experiment — and offspring born in the
 * world mutate, so selection keeps acting on anatomy there too.
 *
 * Pure and deterministic. Scaled with simple allometry (Kleiber-ish metabolism ∝ mass^0.75,
 * lifespan ∝ mass^0.2) so a big animal is a slow-burning, long-lived, hungry thing and a small one
 * lives fast.
 */
import type { Genome, Terminal } from '../engine/genome';

/** a patagium's lift per unit of its area over the body's weight^⅔, and the most it can give (a glide) */
const PATAGIUM_LIFT = 1.2;
const PATAGIUM_MAX = 0.75;

/**
 * A glider's patagium as an area (body units²): on a bilateral body, the skin from each webbed leg to the
 * next leg behind it on the same side (AppendageGene.web) — as long as the gap between their roots, as
 * deep as the web's share of the two legs' mean length. Both flanks, summed. 0 on a radial body.
 */
export function patagiumArea(p: Phenotype): number {
  if (p.genomeRef.symmetry === 'radial') return 0;
  const kids: number[][] = p.nodes.map(() => []);
  for (const [a, b] of p.edges) kids[a].push(b);
  const legs: { x: number; z: number; web: number; len: number }[] = [];
  for (const [a, b] of p.edges) {
    const n = p.nodes[b];
    if (p.nodes[a].kind !== 'spine' || n.part?.kind !== 'leg') continue;
    let len = 0;
    for (let cur = b; ; ) {
      const next = kids[cur].find((k) => p.nodes[k].part?.kind === 'leg');
      if (next === undefined) break;
      const u = p.nodes[cur].pos, v = p.nodes[next].pos;
      len += Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
      cur = next;
    }
    legs.push({ x: n.pos[0], z: n.pos[2], web: n.part.web ?? 0, len });
  }
  let area = 0;
  for (const side of [-1, 1]) {
    const row = legs.filter((l) => Math.sign(l.x) === side).sort((u, v) => v.z - u.z);
    for (let i = 0; i + 1 < row.length; i++) if (row[i].web > 0) area += (row[i].z - row[i + 1].z) * row[i].web * ((row[i].len + row[i + 1].len) / 2);
  }
  return area;
}
import { isScullingTail, type Phenotype } from '../engine/grow';
import { mouthVariant, eyeVariant, type MouthVariant } from '../viewer/partStyles';

export type Diet = 'herbivore' | 'omnivore' | 'carnivore' | 'filter' | 'nectar';
export type Locomotion = 'walk' | 'slither' | 'swim' | 'ooze' | 'drift';
export type Habitat = 'land' | 'water' | 'amphibious';

export interface Traits {
  mass: number; // bu³ (body volume, ~ mass)
  length: number; // body length (bu)
  height: number; // standing height (bu)
  radius: number; // a body "footprint" radius for contact (bu)
  locomotion: Locomotion;
  /** where it can live: a summary of the capacities below — 'water' if it cannot walk, 'amphibious' if
   *  it walks and swims, 'land' if it walks but swims poorly */
  habitat: Habitat;
  /** 0..1: how well it moves through water (a tail fin, paired fins, gills, a sculling tail, paddles) */
  swim: number;
  /** 0..1: how well it moves on land (legs that carry it; a lobe-finned fish crawls a little) */
  walk: number;
  /** seconds it can stay out of water (a gilled body's breath; BREATHES_AIR for an air-breather): longer
   *  as its limbs carry it — a lobe-finned fish makes short trips ashore, a walking one long ones */
  ashore: number;
  diet: Diet;
  mouth: MouthVariant;
  speed: number; // cruise speed (bu/s) on its native ground
  sprint: number; // chase / flight speed (bu/s)
  turnRate: number; // rad/s
  vision: number; // perception radius (bu)
  nocturnal: boolean;
  attack: number; // damage per second in contact
  defense: number; // 0..0.8 fraction of damage shrugged off
  maxHealth: number;
  maxEnergy: number;
  metabolism: number; // energy/s at rest
  lifespan: number; // seconds of sim time
  maturity: number; // age (s) at which it can breed
  litter: number; // offspring per brood
  herding: number; // 0..1 how strongly it keeps with its own kind
  legs: number;
  winged: boolean;
  /** wing against weight: the open span its wings draw (the same sizing the viewer uses), squared, over
   *  its mass — a songbird ~2, a hawk ~0.9, a flap of skin on a heavy body near 0. By degrees: */
  lift: number;
  /** lift ≥ 0.8 on legs: powered flight — it takes off, climbs, crosses water and terrain, and escapes
   *  anything that can't follow it up, at an energy price the steeper the less lift it has */
  flies: boolean;
  /** 0.4 ≤ lift < 0.8 on legs: it glides — leaps (or drops from a height) and can only come down, the
   *  further the more lift it has and the more the ground falls away below it */
  glides: boolean;
  flySpeed: number; // airspeed (bu/s)
  /** warm-blooded (fur / feathers): a high, steady burn, active in the cold of night. Everything else
   *  is cold-blooded — a fraction of the running cost, but sluggish after dark. */
  endotherm: boolean;
  /** lays eggs (everything but the furred, which bear live young; the budding kinds bud) */
  oviparous: boolean;
}

/** How far a wing opens, × the trunk's own span, from the wing's own size gene (its tip's thickness over
 *  the trunk's girth: ~0.2–1 across every winged plan). The viewer draws the wing by it (wingOpenSpan) and
 *  flight is reckoned from it, so what a wing looks like and what it carries agree. Below WING_FLAP it
 *  shrinks toward a flap of skin — the first step of a wing a line grows from nothing. */
export const WING_FLAP = 0.15;
export function wingSpanFactor(gene: number): number {
  return gene < WING_FLAP ? gene * ((0.55 + WING_FLAP) / WING_FLAP) : 0.55 + gene;
}

/** `ashore` for a body that breathes air: as long as it likes (a finite number, so every trait stays one) */
export const BREATHES_AIR = 1e6;

const LEG_TIPS = new Set<Terminal>(['foot', 'claw', 'pincer', 'paw', 'hoof', 'hand']);

const MOUTH_DIET: Record<MouthVariant, Diet> = {
  herbivore: 'herbivore',
  maw: 'omnivore',
  fanged: 'carnivore',
  beak: 'omnivore',
  mandibles: 'omnivore',
  sucker: 'carnivore',
  lamprey: 'carnivore',
  baleen: 'filter',
  proboscis: 'nectar',
  trunk: 'herbivore',
};
const MOUTH_BITE: Record<MouthVariant, number> = {
  herbivore: 0.25,
  maw: 0.9,
  fanged: 1.5,
  beak: 0.8,
  mandibles: 1.1,
  sucker: 0.9,
  lamprey: 1.2,
  baleen: 0.2,
  proboscis: 0.15,
  trunk: 0.5,
};

/** Derive the ecological traits of a grown creature. */
export function traitsOf(p: Phenotype): Traits {
  const g: Genome = p.genomeRef;
  const parent = new Int32Array(p.nodes.length).fill(-1);
  for (const [a, b] of p.edges) parent[b] = a;

  let mass = 0;
  let legs = 0, fins = 0, wings = 0, tails = 0, gills = 0, horns = 0, spines = 0, pincers = 0, claws = 0;
  let barb = false, club = false, shell = false, finTail = false, scull = false;
  // fin ↔ leg (see AppendageGene.form): how leg-like its fins are, how fin-like its legs
  let finForm = 0, legForm = 0, flippers = 0;
  let eyes = 0, eyeR = 0;
  let eyeStyle = 0, mouthStyle = 0.1;
  let legReach = 0;
  for (let i = 0; i < p.nodes.length; i++) {
    const n = p.nodes[i];
    const s = n.scale ?? [1, 1, 1];
    if (n.kind === 'spine') mass += (4 / 3) * Math.PI * n.radius ** 3 * s[0] * s[1] * s[2] * 0.62;
    else if (n.kind === 'limb' || n.kind === 'terminal') mass += Math.PI * n.radius ** 2 * n.radius * 2 * 0.4;
    const k = n.part?.kind;
    if (n.kind === 'terminal') {
      if (k === 'leg' && LEG_TIPS.has(n.terminal as Terminal)) {
        legs++;
        legForm += n.part?.form ?? 1;
        // leg reach = the chain's drop from hip to foot
        let c = i;
        while (parent[c] >= 0 && p.nodes[parent[c]].part?.kind === 'leg') c = parent[c];
        legReach = Math.max(legReach, p.nodes[c].pos[1] - n.pos[1]);
      }
      if (k === 'fin') {
        fins++;
        finForm += n.part?.form ?? 0;
        // a flipper: a leg gone to a fin (its form low but not none) — a broad paddle that rows
        const f = n.part?.form ?? 0;
        if (f > 0 && f <= 0.35) flippers++;
      }
      if (k === 'wing') wings++;
      if (k === 'tail') {
        tails++;
        // a fin-tipped tail is a caudal fin — unless it's feathered (then it's a bird's tail fan)
        if (n.terminal === 'fin' && g.covering.type !== 'feathers') finTail = true;
        // …and a crocodile's flattened tail is a paddle too
        if (isScullingTail(n.part, n.terminal)) scull = true;
      }
      if (k === 'gill' || n.terminal === 'gill') gills++;
      if (k === 'horn') horns++;
      if (k === 'spine') spines++;
      if (n.terminal === 'pincer') pincers++;
      if (n.terminal === 'claw' && k === 'leg') claws++;
      if (n.terminal === 'barb') barb = true;
      if (n.terminal === 'club') club = true;
      if (n.terminal === 'carapace') shell = true;
      if (n.terminal === 'eye') {
        eyes++;
        eyeR = Math.max(eyeR, n.radius);
        eyeStyle = n.part?.style ?? 0;
      }
      if (n.terminal === 'mouth') mouthStyle = n.part?.style ?? 0.1;
    }
  }
  mass = Math.max(mass, 0.05);
  const { min, max } = p.bounds;
  const length = max[2] - min[2];
  const width = max[0] - min[0];
  const height = max[1] - min[1];
  const radius = Math.max(0.3, Math.min(width, length) * 0.45);
  const radial = g.symmetry === 'radial';
  const elong = length / Math.max(0.2, (width + height) / 2);

  const cov = g.covering.type;
  const s0 = Math.cbrt(mass);

  // --- how well it moves on land and in water, and how long it can stay out ---
  // (by degrees, not by label: a lobe-finned fish crawls a little and swims well, a paddle-footed
  // walker swims a little and walks well — each step of a crossing between water and land can live)
  const legLike = legs > 0 ? legForm / legs : 1; // 1 legs as legs … 0 legs gone to paddles
  const paddles = legs * (1 - legLike);
  let walk: number;
  if (radial) walk = 0;
  else if (legs >= 2) {
    // legs long enough to carry the body, and legs rather than paddles
    const support = Math.min(1, legReach / Math.max(0.3, s0) / 0.7);
    walk = (0.35 + 0.65 * support) * Math.min(1, Math.max(0.25, 1.35 * legLike - 0.2));
  } else if (fins > 0 || finTail || gills > 0) walk = Math.min(0.35, 0.15 * finForm); // a fish crawls only on lobes
  else if (elong > 2.4) walk = 0.45; // slithering
  else walk = 0.3; // oozing
  let swim =
    0.45 * (finTail ? 1 : 0) +
    0.1 * Math.min(6, fins) * (1 - 0.5 * Math.min(1, finForm / Math.max(1, fins))) +
    (gills > 0 ? 0.2 : 0) +
    0.25 * Math.min(2, paddles) +
    0.2 * Math.min(4, flippers) +
    (scull ? 0.35 : 0) +
    (radial ? 0.6 : 0) +
    (legs === 0 && elong > 2.4 ? 0.4 : 0) +
    (cov === 'slime' ? 0.15 : 0) +
    // a wet bare skin on legs (a frog's, a newt's) is at home in the water
    (cov === 'skin' && legs >= 2 && g.covering.sheen >= 0.5 ? 0.1 : 0);
  if (legs >= 2) swim = Math.max(swim, 0.12); // any walker can paddle a little
  swim = Math.min(1, swim);
  // a gilled body breathes water: out of it, it has only so long — longer as its limbs carry it
  // (gills, or a fish's tail fin on a legless body — not a seal's: flippers come from legs, and lungs with them)
  const gilled = !radial && (gills > 0 || (legs === 0 && finTail && flippers === 0));
  const ashore = gilled ? 8 + 500 * walk : BREATHES_AIR;
  const habitat: Habitat = walk < 0.12 ? 'water' : swim >= 0.25 ? 'amphibious' : 'land';
  let locomotion: Locomotion;
  if (radial) locomotion = 'drift';
  else if (legs >= 2 && walk >= 0.3) locomotion = 'walk';
  // (swimming takes parts to swim with: a long slimy body glides, it does not swim)
  else if (swim >= 0.45 && (fins > 0 || finTail || gills > 0 || paddles > 0.5 || scull)) locomotion = 'swim';
  else if (legs >= 2) locomotion = 'walk';
  else if (elong > 2.4) locomotion = 'slither';
  else locomotion = 'ooze';

  const mouth = mouthVariant(mouthStyle);
  const diet = MOUTH_DIET[mouth];
  const s = Math.cbrt(mass); // linear size

  // speed: legs carry a walker in proportion to their reach; swimmers/slitherers by body length
  const base =
    locomotion === 'walk'
      ? 1.1 + 2.4 * Math.min(1.4, legReach / Math.max(0.3, s)) * (legs <= 4 ? 1 : 0.85)
      : locomotion === 'swim'
        ? 2.2 + 0.4 * elong
        : locomotion === 'slither'
          ? 1.4 + 0.15 * elong
          : locomotion === 'drift'
            ? 1.0
            : 0.55;
  // (a patagium is a sail: skin slung between the legs hobbles the stride on the ground — a glider runs
  // a quarter slower at its widest; a free web would spread through a valley with nothing against it)
  const patLift = Math.min(PATAGIUM_MAX, (PATAGIUM_LIFT * patagiumArea(p)) / (s * s));
  const speed = base * Math.pow(s, 0.35) * (1 - 0.25 * (patLift / PATAGIUM_MAX));
  const sprint = speed * (diet === 'carnivore' ? 2.1 : 1.85);

  // senses: big / many eyes see further; glowing & slit eyes own the night
  const ev = eyeVariant(eyeStyle);
  const vision = 9 + 70 * Math.min(0.5, eyeR / Math.max(0.25, s * 0.6)) + Math.min(eyes, 8) * 0.8 + (ev === 'compound' ? 4 : 0);
  const nocturnal = ev === 'glowing' || ev === 'slit';

  // weapons & armour
  const weapon = MOUTH_BITE[mouth] + 0.12 * claws + 0.35 * Math.min(horns, 4) + 0.4 * Math.min(pincers, 2) + (barb ? 0.6 : 0) + (club ? 0.5 : 0);
  const attack = weapon * 6 * Math.pow(mass, 0.66);
  const armour =
    (shell ? 0.4 : 0) +
    (cov === 'crystal' ? 0.3 : cov === 'plates' ? 0.25 : cov === 'chitin' ? 0.18 : cov === 'scales' ? 0.1 : 0) +
    Math.min(spines, 4) * 0.06 +
    Math.min(horns, 2) * 0.03;
  const defense = Math.min(0.8, armour);

  const maxHealth = 40 * Math.pow(mass, 0.9) + 10;
  const maxEnergy = 100 * mass + 20;
  // hunters are sit-and-wait engines: a low resting burn between big meals; cold-blooded bodies
  // (scales, chitin, slime, bare skin, plates) run on roughly half the fuel of furred/feathered ones
  const endotherm = cov === 'fur' || cov === 'feathers';
  const metabolism = (0.42 * Math.pow(mass, 0.75) + 0.05) * (diet === 'carnivore' ? 0.7 : 1) * (endotherm ? 1 : 0.5);
  const lifespan = 900 * Math.pow(mass, 0.2) * (shell ? 1.4 : 1);
  const maturity = lifespan * 0.16;
  // (the small breed fast: a mouse's litter is a big one — at two to a brood the valley's rodents were
  // eaten faster than they were born)
  const litter = mass < 0.5 ? 4 : mass < 1 ? 3 : mass < 2 ? 2 : 1;
  const herding = diet === 'herbivore' ? 0.8 : diet === 'filter' ? 0.6 : diet === 'omnivore' ? 0.35 : 0.1;
  const turnRate = 2.6 / Math.pow(s, 0.3);
  // flight, by degrees: the open span the wings draw (as wingOpenSpan sizes it: off the trunk's length
  // and girth, by the wing tip's thickness) squared — the wing's area — against the body's weight. A
  // bigger body needs disproportionately more wing (area grows as the square, weight as the cube).
  let lift = 0;
  if (wings > 0) {
    let z0 = Infinity, z1 = -Infinity, girth = 0, tip = 0;
    for (const n of p.nodes) {
      if (n.kind === 'terminal' && n.part?.kind === 'wing') tip = Math.max(tip, n.radius);
      if (n.kind !== 'spine' || (n.segment ?? 0) !== 0) continue;
      z0 = Math.min(z0, n.pos[2] - n.radius);
      z1 = Math.max(z1, n.pos[2] + n.radius);
      girth = Math.max(girth, n.radius);
    }
    const trunk = Number.isFinite(z1 - z0) ? z1 - z0 : 1;
    const span = Math.max(trunk * 1.15, girth * 3) * wingSpanFactor(Math.max(tip, 0.06) / Math.max(girth, 0.1));
    lift = (0.6 * (span / s) ** 2) / s;
  }
  // …or a patagium: skin stretched between fore and hind legs (AppendageGene.web). Its area against the
  // body's weight carries a glide, never more — it is a sail, not a wing.
  lift = Math.max(lift, patLift);
  const flies = lift >= 0.8 && locomotion === 'walk';
  const glides = !flies && lift >= 0.4 && locomotion === 'walk';
  const flySpeed = flies || glides ? Math.max(speed * 2.3, 5.5) * Math.pow(s, 0.12) * (glides ? 0.8 : 1) : 0;

  return {
    mass,
    length,
    height,
    radius,
    locomotion,
    habitat,
    swim,
    walk,
    ashore,
    diet,
    mouth,
    speed,
    sprint,
    turnRate,
    vision,
    nocturnal,
    attack,
    defense,
    maxHealth,
    maxEnergy,
    metabolism,
    lifespan,
    maturity,
    litter,
    herding,
    legs,
    winged: wings > 0,
    lift,
    flies,
    glides,
    flySpeed,
    endotherm,
    oviparous: cov !== 'fur',
  };
}
