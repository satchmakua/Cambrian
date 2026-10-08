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
import type { Phenotype } from '../engine/grow';
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
  habitat: Habitat;
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
}

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
  let barb = false, club = false, shell = false, finTail = false;
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
        // leg reach = the chain's drop from hip to foot
        let c = i;
        while (parent[c] >= 0 && p.nodes[parent[c]].part?.kind === 'leg') c = parent[c];
        legReach = Math.max(legReach, p.nodes[c].pos[1] - n.pos[1]);
      }
      if (k === 'fin') fins++;
      if (k === 'wing') wings++;
      if (k === 'tail') {
        tails++;
        if (n.terminal === 'fin') finTail = true;
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

  // --- how it moves, and where it can live ---
  let locomotion: Locomotion;
  if (radial) locomotion = 'drift';
  else if (legs >= 2) locomotion = 'walk';
  else if (fins + (finTail ? 1 : 0) >= 1 || gills > 0) locomotion = 'swim';
  else if (elong > 2.4) locomotion = 'slither';
  else locomotion = 'ooze';
  const aquaticBits = fins + (finTail ? 1 : 0) + gills;
  const habitat: Habitat =
    locomotion === 'swim' || locomotion === 'drift'
      ? 'water'
      : locomotion === 'slither' || aquaticBits > 0 || g.covering.type === 'slime'
        ? 'amphibious'
        : 'land';

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
  const speed = base * Math.pow(s, 0.35);
  const sprint = speed * (diet === 'carnivore' ? 2.1 : 1.85);

  // senses: big / many eyes see further; glowing & slit eyes own the night
  const ev = eyeVariant(eyeStyle);
  const vision = 9 + 70 * Math.min(0.5, eyeR / Math.max(0.25, s * 0.6)) + Math.min(eyes, 8) * 0.8 + (ev === 'compound' ? 4 : 0);
  const nocturnal = ev === 'glowing' || ev === 'slit';

  // weapons & armour
  const weapon = MOUTH_BITE[mouth] + 0.12 * claws + 0.35 * Math.min(horns, 4) + 0.4 * Math.min(pincers, 2) + (barb ? 0.6 : 0) + (club ? 0.5 : 0);
  const attack = weapon * 6 * Math.pow(mass, 0.66);
  const cov = g.covering.type;
  const armour =
    (shell ? 0.4 : 0) +
    (cov === 'plates' ? 0.25 : cov === 'chitin' ? 0.18 : cov === 'scales' ? 0.1 : 0) +
    Math.min(spines, 4) * 0.06 +
    Math.min(horns, 2) * 0.03;
  const defense = Math.min(0.8, armour);

  const maxHealth = 40 * Math.pow(mass, 0.9) + 10;
  const maxEnergy = 100 * mass + 20;
  const metabolism = 0.42 * Math.pow(mass, 0.75) + 0.05;
  const lifespan = 900 * Math.pow(mass, 0.2) * (shell ? 1.4 : 1);
  const maturity = lifespan * 0.16;
  const litter = mass < 0.6 ? 3 : mass < 2 ? 2 : 1;
  const herding = diet === 'herbivore' ? 0.8 : diet === 'filter' ? 0.6 : diet === 'omnivore' ? 0.35 : 0.1;
  const turnRate = 2.6 / Math.pow(s, 0.3);

  return {
    mass,
    length,
    height,
    radius,
    locomotion,
    habitat,
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
  };
}
