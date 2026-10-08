/**
 * Random genome generation by **morphotype** (MORPHOLOGY §4, §10, ROADMAP M10).
 *
 * A morphotype is a *multivariate prior* — coupled parameter ranges + characteristic
 * parts — not a fixed mold. Sampling one then jittering yields endless creatures that
 * still read as their kind (cat, crab, heron, dragon, cephalopod). The distribution is
 * **bimodal**: ~45% a Familiar morphotype, ~35% an Uncanny one, ~20% the free
 * "wild" compositional generator (the in-between tail). Every draw flows from the seed
 * (Pillar 3); every gene stays within `GENE_BOUNDS` (Pillar 1).
 */
import { mulberry32, range, type Rng } from './rng';
import { GENE_BOUNDS, clamp } from './bounds';
import { legSlots } from './grow';
import {
  GENOME_VERSION,
  type Genome,
  type SegmentGene,
  type AppendageGene,
  type Symmetry,
  type Terminal,
  type PartKind,
  type CoveringType,
  type PatternType,
} from './genome';

export type SymmetryMode = 'auto' | 'bilateral' | 'radial';
type Rg = readonly [number, number];

const A = GENE_BOUNDS.appendage;

// =============================================================================
// Morphotype priors
// =============================================================================

interface Morpho {
  id: string;
  cluster: 'familiar' | 'uncanny';
  weight: number;
  symmetry?: Symmetry; // default bilateral
  radialCount?: Rg;
  girth: Rg;
  repeat: Rg; // body segment count
  height?: Rg; // cross-section y/x
  elong?: Rg; // z stretch
  taper?: Rg;
  wind?: number; // prob of a serpentine S-curve
  rear?: Rg; // body-pitch per segment (rad); NEGATIVE bends the trunk up toward the head → a standing biped stance
  legPairs?: readonly number[]; // bilateral only
  legLen?: Rg; // ×girth
  legThick?: Rg; // ×girth
  legAz?: Rg; // sprawl azimuth (4.7 ≈ straight down) — overrides the posture's default
  posture?: Posture; // leg stance (§6.1): sprawling / digitigrade / plantigrade / hooved / upright
  legTerm?: readonly Terminal[];
  wings?: number;
  arms?: number; // prob of a forward-reaching grasping arm pair (primate)
  dorsal?: number;
  pectoral?: number;
  tail?: number;
  tailTerm?: readonly Terminal[];
  tailLen?: Rg; // tail segment length ×girth — default [0.7, 1.4]; birds keep a short stub under a feather fan
  tailSegs?: readonly [number, number]; // default [3, 6]
  tailThick?: Rg; // tail root radius ×girth — default [0.18, 0.34]; a fish's peduncle is thick
  tailDroop?: Rg; // tail exit elevation (rad; -π/2 = straight back, -0.75 ≈ hanging) — default [-1.25, -0.75]
  tailCurl?: Rg; // tail per-link pitch (negative curls it up) — default [-0.1, 0.15]
  neck?: Rg; // a neck between trunk and head: its girth ×body girth (absent ⇒ the head sits on the shoulders)
  neckLinks?: readonly [number, number]; // neck length in links (default [1, 1])
  neckLift?: Rg; // per-link upward bend of the neck (rad, negative = up) — default [-0.15, -0.05]
  headSize?: Rg; // head girth ×body girth — default [0.7, 1.05]; a mammal's skull is far narrower than its chest
  muzzle?: Rg; // a mammal skull: a round cranium + a narrower, dropped muzzle (muzzle girth ×cranium, ≥ 0.6)
  muzzleDrop?: Rg; // how far the muzzle hangs below the brow (pitch, rad) — default [0.3, 0.42]
  earSize?: Rg; // ear size ×the skull's (a bear's small round ears vs a fennec's) — default [1, 1]
  armLen?: Rg; // grasping-arm segment length ×girth — default [0.5, 0.72] (an ape's arms are long)
  armThick?: Rg; // grasping-arm root radius ×girth — default [0.18, 0.28]
  armTaper?: Rg; // default [0.7, 0.85]
  horns?: number;
  spines?: number;
  frill?: number;
  antennae?: number;
  ears?: number; // prob of a pair of ears (M23)
  earStyle?: Rg; // 0 pointed … 0.5 leaf … 1 round
  whiskers?: number; // prob of snout whiskers
  gills?: number; // prob of neck gill rakes
  crest?: number; // prob of a head crest/fan
  carapace?: number; // prob of a domed shell over the body
  stalkEyes?: number; // prob the eyes ride multi-segment stalks (crab/snail)
  snout?: Rg; // 0 flat face (cat/ape) … 1 long muzzle/jaw (dog/horse/croc) — elongates the head
  headShape?: readonly HeadShape[]; // pin a cranial silhouette (else drawn at random, for variety)
  headWide?: Rg; // head width ×girth (broad skull > 1) — default [0.85, 1.15]
  headDome?: Rg; // head height ×girth (domed cranium > 1, flat < 1) — default [0.78, 1.3]
  head?: number; // default 0.9
  eyeStyle?: Rg; // 0 round … 1 glowing
  eyeCount?: readonly number[];
  eyeAz?: Rg; // placement (1.0 up-fwd, ~0.3 side, ~1.6 top)
  mouthStyle?: Rg; // 0 maw · 0.19 fanged · 0.31 beak · 0.44 mandibles · 0.56 sucker · 0.69 lamprey · 0.81 baleen · 0.94 proboscis
  covering?: readonly CoveringType[]; // skin material (MORPHOLOGY §7); default ['skin']
  pattern?: readonly PatternType[]; // color field; default ['plain', 'mottle']
  coherence?: Rg; // structural-coherence dial (M24); default familiar≈1 / uncanny≈0.85
  sheen?: Rg; // matte ↔ wet/iridescent; default derives from the covering type
  hue?: Rg;
  sat?: Rg;
  light?: Rg;
}

// Terse priors. Unspecified fields fall back to sensible defaults in `compile`.
const MORPHOTYPES: readonly Morpho[] = [
  // --- familiar ---
  { id: 'felid', cluster: 'familiar', weight: 0.8, girth: [0.45, 0.6], repeat: [3, 4], height: [0.85, 1.0], elong: [1.1, 1.4], neck: [0.5, 0.6], neckLinks: [2, 2], neckLift: [-0.5, -0.38], headSize: [0.6, 0.72], muzzle: [0.6, 0.66], legPairs: [2], posture: 'digitigrade', legLen: [0.52, 1.12], legTerm: ['paw'], snout: [0, 0.2], tail: 0.97, tailSegs: [4, 5], tailLen: [0.55, 0.8], tailThick: [0.2, 0.28], tailDroop: [-1.2, -0.95], tailCurl: [-0.2, -0.05], horns: 0.03, ears: 0.9, earStyle: [0, 0.3], whiskers: 0.9, eyeStyle: [0, 0.15], mouthStyle: [0.14, 0.24], covering: ['fur'], pattern: ['spots', 'stripes', 'plain'], hue: [0.05, 0.12], sat: [0.4, 0.7] },
  { id: 'canid', cluster: 'familiar', weight: 0.8, girth: [0.42, 0.56], repeat: [3, 4], elong: [1.15, 1.45], neck: [0.48, 0.58], neckLinks: [2, 2], neckLift: [-0.48, -0.36], headSize: [0.6, 0.72], muzzle: [0.6, 0.68], muzzleDrop: [0.22, 0.32], legPairs: [2], posture: 'digitigrade', legLen: [0.56, 1.18], legTerm: ['paw'], snout: [0.55, 0.8], tail: 0.95, tailSegs: [3, 4], tailLen: [0.5, 0.72], tailThick: [0.26, 0.36], tailDroop: [-1.25, -1.0], tailCurl: [-0.15, 0.05], frill: 0.4, ears: 0.95, earStyle: [0, 0.3], whiskers: 0.6, eyeStyle: [0, 0.15], mouthStyle: [0.07, 0.18], covering: ['fur'], pattern: ['plain', 'mottle'], hue: [0.05, 0.1] },
  { id: 'rodent', cluster: 'familiar', weight: 1.3, girth: [0.3, 0.45], repeat: [2, 3], height: [0.9, 1.1], headSize: [0.68, 0.82], muzzle: [0.6, 0.68], legPairs: [2], posture: 'plantigrade', legLen: [0.4, 0.82], snout: [0.3, 0.5], tail: 0.9, tailSegs: [4, 6], tailLen: [0.6, 0.95], tailThick: [0.12, 0.2], tailDroop: [-1.3, -1.05], tailCurl: [0.0, 0.12], ears: 0.9, earStyle: [0.7, 1], whiskers: 0.95, eyeStyle: [0, 0.15], eyeCount: [2], mouthStyle: [0, 0.055], covering: ['fur'], pattern: ['plain', 'mottle'], hue: [0.04, 0.1] },
  { id: 'ungulate', cluster: 'familiar', weight: 1.3, girth: [0.45, 0.62], repeat: [3, 4], neck: [0.44, 0.54], neckLinks: [2, 2], neckLift: [-0.5, -0.42], headSize: [0.55, 0.66], muzzle: [0.62, 0.72], muzzleDrop: [0.3, 0.45], legPairs: [2], posture: 'hooved', legLen: [0.82, 1.4], legTerm: ['hoof'], headShape: ['tapered', 'wedge'], snout: [0.55, 0.85], tail: 0.7, tailSegs: [2, 3], tailLen: [0.38, 0.6], tailThick: [0.14, 0.2], tailDroop: [-0.8, -0.55], horns: 0.55, ears: 0.8, earStyle: [0.33, 0.66], eyeStyle: [0, 0.1], eyeAz: [0.3, 0.6], mouthStyle: [0, 0.055], covering: ['fur'], pattern: ['plain', 'spots'], hue: [0.06, 0.11] },
  { id: 'ursid', cluster: 'familiar', weight: 0.6, girth: [0.62, 0.82], repeat: [3, 4], height: [0.95, 1.15], neck: [0.62, 0.72], neckLift: [-0.25, -0.1], headSize: [0.62, 0.76], muzzle: [0.62, 0.7], legPairs: [2], posture: 'plantigrade', legLen: [0.42, 0.82], legThick: [0.46, 0.6], legTerm: ['paw'], snout: [0.35, 0.55], tail: 0.25, tailSegs: [1, 2], tailLen: [0.25, 0.4], tailThick: [0.26, 0.34], ears: 0.9, earStyle: [0.7, 1], earSize: [0.55, 0.7], whiskers: 0.2, headShape: ['broad'], headWide: [1.1, 1.32], headDome: [0.82, 1.02], eyeStyle: [0.22, 0.36], mouthStyle: [0.07, 0.12], covering: ['fur'], pattern: ['plain', 'mottle'], hue: [0.04, 0.09] },
  { id: 'lizard', cluster: 'familiar', weight: 0.6, girth: [0.32, 0.46], repeat: [4, 6], height: [0.6, 0.8], elong: [1.2, 1.5], legPairs: [2], posture: 'sprawling', legLen: [0.4, 0.74], legAz: [4.0, 4.3], legTerm: ['claw'], headShape: ['flat', 'wedge'], snout: [0.4, 0.65], tail: 0.95, frill: 0.25, eyeStyle: [0.4, 0.6], mouthStyle: [0.07, 0.18], covering: ['scales'], pattern: ['bands', 'reticulate', 'mottle'], hue: [0.22, 0.42], sat: [0.5, 0.85] },
  { id: 'crocodilian', cluster: 'familiar', weight: 0.5, girth: [0.4, 0.55], repeat: [5, 7], height: [0.55, 0.75], elong: [1.3, 1.6], legPairs: [2], posture: 'sprawling', legLen: [0.35, 0.62], legAz: [3.9, 4.2], legTerm: ['claw'], headShape: ['flat'], snout: [0.8, 1.0], tail: 0.95, spines: 0.7, eyeStyle: [0.4, 0.6], eyeAz: [1.4, 1.7], mouthStyle: [0.14, 0.24], covering: ['plates', 'scales'], pattern: ['mottle', 'reticulate'], hue: [0.2, 0.35], sat: [0.3, 0.6] },
  { id: 'serpent', cluster: 'familiar', weight: 0.6, girth: [0.22, 0.32], repeat: [17, 24], elong: [1.3, 1.5], headShape: ['wedge'], wind: 0.9, legPairs: [0], tail: 0.0, eyeStyle: [0.4, 0.6], mouthStyle: [0.14, 0.24], covering: ['scales'], pattern: ['bands', 'stripes', 'reticulate'], hue: [0.1, 0.4], sat: [0.5, 0.85] },
  { id: 'anuran', cluster: 'familiar', weight: 0.6, girth: [0.5, 0.7], repeat: [1, 2], height: [0.85, 1.05], legPairs: [2], posture: 'sprawling', legLen: [0.55, 0.8], tail: 0.0, eyeStyle: [0, 0.2], eyeAz: [1.3, 1.7], mouthStyle: [0.07, 0.12], covering: ['skin'], pattern: ['spots', 'mottle'], sheen: [0.55, 0.85], hue: [0.25, 0.45], sat: [0.5, 0.85] },
  { id: 'fish', cluster: 'familiar', weight: 0.7, girth: [0.4, 0.58], repeat: [4, 6], height: [1.05, 1.45], elong: [1.3, 1.6], taper: [0.78, 0.9], legPairs: [0], dorsal: 1, pectoral: 1, tail: 1, tailTerm: ['fin'], tailLen: [0.5, 0.75], tailThick: [0.5, 0.66], tailSegs: [3, 3], gills: 0.9, head: 0.3, eyeStyle: [0, 0.2], eyeAz: [0.3, 0.6], mouthStyle: [0.07, 0.12], covering: ['scales'], pattern: ['plain', 'spots', 'stripes'], sheen: [0.35, 0.6], hue: [0.45, 0.65], sat: [0.4, 0.8] },
  { id: 'shark', cluster: 'familiar', weight: 0.6, girth: [0.45, 0.62], repeat: [5, 7], height: [0.95, 1.2], elong: [1.4, 1.7], taper: [0.78, 0.9], legPairs: [0], dorsal: 1, pectoral: 1, tail: 1, tailTerm: ['fin'], tailLen: [0.6, 0.85], tailThick: [0.45, 0.6], tailSegs: [3, 4], gills: 0.95, head: 0.3, eyeStyle: [0.1, 0.3], eyeAz: [0.3, 0.6], mouthStyle: [0.13, 0.24], covering: ['skin'], pattern: ['plain', 'gradient'], hue: [0.55, 0.62], sat: [0.2, 0.45] },
  { id: 'bird', cluster: 'familiar', weight: 1.3, girth: [0.34, 0.5], repeat: [2, 3], height: [1.0, 1.3], neck: [0.42, 0.52], neckLinks: [2, 2], neckLift: [-0.42, -0.3], headSize: [0.62, 0.78], legPairs: [1], posture: 'digitigrade', legLen: [0.7, 1.0], legTerm: ['claw'], wings: 0.95, tail: 0.85, tailTerm: ['fin'], tailLen: [0.22, 0.36], tailSegs: [2, 2], rear: [-0.22, -0.1], crest: 0.45, eyeStyle: [0, 0.2], mouthStyle: [0.26, 0.37], covering: ['feathers'], pattern: ['bands', 'plain', 'spots'], hue: [0.05, 0.65], sat: [0.5, 0.9] },
  { id: 'raptor', cluster: 'familiar', weight: 1.2, girth: [0.4, 0.54], repeat: [2, 3], height: [1.0, 1.25], neck: [0.45, 0.55], neckLinks: [2, 2], neckLift: [-0.4, -0.28], headSize: [0.62, 0.76], legPairs: [1], posture: 'digitigrade', legLen: [0.7, 0.95], legTerm: ['claw'], wings: 1, tail: 0.85, tailTerm: ['fin'], tailLen: [0.22, 0.36], tailSegs: [2, 2], rear: [-0.2, -0.08], crest: 0.3, headShape: ['wedge'], eyeStyle: [0, 0.15], mouthStyle: [0.26, 0.37], covering: ['feathers'], pattern: ['bands', 'mottle'], hue: [0.06, 0.12] },
  { id: 'crab', cluster: 'familiar', weight: 1.2, girth: [0.45, 0.62], repeat: [1, 2], height: [0.5, 0.7], elong: [0.7, 0.95], legPairs: [3], posture: 'sprawling', legLen: [0.6, 0.85], legAz: [3.6, 4.0], legTerm: ['pincer', 'claw'], tail: 0.0, antennae: 0.6, carapace: 0.85, stalkEyes: 0.9, eyeStyle: [0, 0.3], eyeAz: [1.2, 1.6], mouthStyle: [0.38, 0.49], covering: ['chitin'], pattern: ['mottle', 'reticulate'], sheen: [0.3, 0.55], hue: [0.02, 0.1], sat: [0.5, 0.85] },
  { id: 'insectoid', cluster: 'familiar', weight: 1.2, girth: [0.3, 0.44], repeat: [4, 6], height: [0.75, 0.95], legPairs: [3], posture: 'sprawling', legLen: [0.55, 0.8], legAz: [3.7, 4.1], legTerm: ['claw'], antennae: 0.9, eyeStyle: [0.6, 0.8], eyeCount: [2], mouthStyle: [0.38, 0.49], covering: ['chitin'], pattern: ['bands', 'reticulate'], sheen: [0.6, 0.95], hue: [0.1, 0.6], sat: [0.5, 0.9] },
  { id: 'arachnid', cluster: 'familiar', weight: 0.9, girth: [0.36, 0.52], repeat: [1, 2], height: [0.8, 1.05], legPairs: [4], posture: 'sprawling', legLen: [0.72, 1.35], legAz: [3.6, 4.0], legTerm: ['claw'], eyeStyle: [0.2, 0.4], eyeCount: [4, 6], mouthStyle: [0.38, 0.49], covering: ['fur', 'chitin'], pattern: ['mottle', 'bands'], hue: [0.02, 0.09], sat: [0.3, 0.6] },
  // upright grasping ape/monkey: long limbs, deep chest, flat forward-eyed face, expressive head
  // upright ape: a biped (long legs) with forward-reaching grasping arms, a tall domed-skulled flat face
  { id: 'primate', cluster: 'familiar', weight: 1.0, girth: [0.3, 0.37], repeat: [3, 3], height: [1.0, 1.12], taper: [1.0, 1.08], elong: [1.25, 1.4], rear: [-0.46, -0.34], neck: [0.46, 0.56], headSize: [0.72, 0.86], muzzle: [0.62, 0.7], muzzleDrop: [0.38, 0.5], legPairs: [1], posture: 'upright', legLen: [1.05, 1.4], legThick: [0.34, 0.44], legTerm: ['foot'], arms: 1, armLen: [0.8, 1.05], armThick: [0.32, 0.42], armTaper: [0.82, 0.92], tail: 0.4, tailSegs: [3, 5], tailLen: [0.5, 0.8], tailThick: [0.14, 0.22], tailCurl: [-0.3, -0.1], ears: 0.7, earStyle: [0.7, 1], head: 1.0, headShape: ['domed'], headDome: [1.1, 1.4], snout: [0, 0.12], eyeStyle: [0, 0.15], mouthStyle: [0.07, 0.12], covering: ['fur'], pattern: ['plain', 'mottle'], hue: [0.04, 0.1], sat: [0.3, 0.6] },
  // biped: an upright two-legged walker (theropod / kangaroo / humanoid). Long strong striding legs,
  // grasping arms, a heavy balancing tail, a proper head. Wide covering/mouth range so it spans a
  // furred kangaroo, a scaled raptor-thing, a feathered strider — a whole basin of two-legged forms.
  { id: 'biped', cluster: 'familiar', weight: 1.0, girth: [0.3, 0.4], repeat: [2, 2], height: [1.15, 1.5], elong: [0.8, 1.05], rear: [-0.5, -0.3], neck: [0.46, 0.56], legPairs: [1], posture: 'upright', legLen: [1.25, 1.7], legThick: [0.34, 0.48], legTerm: ['foot', 'claw'], arms: 1, tail: 0.75, tailTerm: ['none', 'none', 'club'], tailThick: [0.26, 0.36], head: 1.0, headShape: ['domed', 'round', 'wedge'], snout: [0, 0.45], ears: 0.4, earStyle: [0, 1], eyeStyle: [0, 0.4], mouthStyle: [0, 0.24], covering: ['fur', 'skin', 'scales', 'feathers'], pattern: ['plain', 'mottle', 'stripes', 'bands'], hue: [0, 1], sat: [0.35, 0.75] },
  // weasel/otter: long tube body on short legs, small head, a long tail
  { id: 'mustelid', cluster: 'familiar', weight: 0.5, girth: [0.3, 0.42], repeat: [6, 9], height: [0.8, 1.0], elong: [1.0, 1.2], headSize: [0.72, 0.85], muzzle: [0.6, 0.68], muzzleDrop: [0.2, 0.3], legPairs: [2], posture: 'plantigrade', legLen: [0.28, 0.52], legThick: [0.3, 0.42], snout: [0.4, 0.6], tail: 0.9, ears: 0.7, earStyle: [0.7, 1], whiskers: 0.7, head: 0.7, eyeStyle: [0, 0.2], mouthStyle: [0.07, 0.12], covering: ['fur'], pattern: ['plain', 'mottle'], hue: [0.04, 0.1], sat: [0.4, 0.7] },
  // turtle/tortoise: a deep domed body, short stumpy sprawled legs, a small beaked head, plated net skin
  { id: 'chelonian', cluster: 'familiar', weight: 1.0, girth: [0.6, 0.8], repeat: [1, 2], height: [0.66, 0.82], elong: [0.95, 1.15], neck: [0.38, 0.46], neckLinks: [1, 2], neckLift: [-0.2, -0.05], headSize: [0.48, 0.58], legPairs: [2], posture: 'sprawling', legLen: [0.3, 0.44], legThick: [0.34, 0.5], legAz: [3.7, 4.0], legTerm: ['claw'], tail: 0.35, tailTerm: ['none'], carapace: 1, head: 1, eyeStyle: [0, 0.2], mouthStyle: [0.26, 0.37], covering: ['plates'], pattern: ['reticulate', 'mottle'], hue: [0.18, 0.35], sat: [0.35, 0.6] },
  // ostrich/emu: tall, heavy, two long stilt legs, a small beaked head, shaggy feathers (the neck is M24)
  { id: 'ratite', cluster: 'familiar', weight: 1.2, girth: [0.34, 0.5], repeat: [2, 3], height: [1.0, 1.3], elong: [1.0, 1.2], neck: [0.3, 0.38], neckLinks: [3, 4], neckLift: [-0.36, -0.26], headSize: [0.5, 0.62], legPairs: [1], posture: 'upright', legLen: [1.2, 1.7], legThick: [0.18, 0.28], legTerm: ['claw'], tail: 0.3, tailTerm: ['none'], tailSegs: [1, 2], tailLen: [0.3, 0.5], tailThick: [0.24, 0.34], tailDroop: [-1.55, -1.3], tailCurl: [-0.3, -0.15], head: 0.5, eyeStyle: [0, 0.2], mouthStyle: [0.26, 0.37], covering: ['feathers'], pattern: ['plain', 'mottle'], hue: [0.06, 0.12], sat: [0.3, 0.5] },
  // --- uncanny ---
  { id: 'dragon', cluster: 'uncanny', weight: 0.9, girth: [0.5, 0.72], repeat: [4, 6], elong: [1.2, 1.5], neck: [0.5, 0.6], neckLinks: [2, 2], neckLift: [-0.38, -0.26], headSize: [0.6, 0.75], legPairs: [2], posture: 'digitigrade', legLen: [0.5, 0.68], legTerm: ['claw'], wings: 0.85, tail: 0.95, tailTerm: ['none', 'barb', 'club'], headShape: ['broad', 'blocky'], horns: 0.9, spines: 0.8, crest: 0.3, eyeStyle: [0.4, 0.9], mouthStyle: [0.14, 0.24], covering: ['scales', 'plates'], pattern: ['reticulate', 'bands', 'mottle'], sheen: [0.35, 0.8], hue: [0.0, 0.95], sat: [0.5, 0.9] },
  { id: 'wyvern', cluster: 'uncanny', weight: 0.85, girth: [0.42, 0.58], repeat: [3, 5], elong: [1.2, 1.5], neck: [0.48, 0.58], neckLinks: [2, 2], neckLift: [-0.38, -0.26], headSize: [0.62, 0.78], legPairs: [1], posture: 'digitigrade', legLen: [0.55, 0.75], legTerm: ['claw'], wings: 1, tail: 0.95, tailTerm: ['barb'], horns: 0.8, spines: 0.6, eyeStyle: [0.4, 0.9], mouthStyle: [0.14, 0.24], covering: ['scales'], pattern: ['bands', 'reticulate'], sheen: [0.3, 0.7], hue: [0.0, 0.95], sat: [0.5, 0.9] },
  { id: 'cephalopod', cluster: 'uncanny', weight: 1.2, symmetry: 'radial', radialCount: [6, 10], girth: [0.5, 0.78], height: [0.7, 1.1], repeat: [1, 2], eyeStyle: [0.8, 1], mouthStyle: [0.26, 0.37], covering: ['slime'], pattern: ['spots', 'ocelli', 'gradient'], sheen: [0.7, 1.0], hue: [0.6, 0.95], sat: [0.4, 0.85] },
  { id: 'horror', cluster: 'uncanny', weight: 1.0, symmetry: 'radial', radialCount: [5, 9], girth: [0.45, 0.75], repeat: [1, 2], eyeStyle: [0.7, 1], mouthStyle: [0.5, 0.78], covering: ['skin', 'slime'], pattern: ['ocelli', 'mottle'], sheen: [0.4, 0.8], hue: [0.7, 1.0], sat: [0.3, 0.7] },
  { id: 'slime', cluster: 'uncanny', weight: 0.7, girth: [0.5, 0.72], repeat: [2, 2], height: [0.55, 0.72], elong: [0.9, 1.1], taper: [0.84, 0.94], legPairs: [0], stalkEyes: 0.85, eyeAz: [1.0, 1.3], mouthStyle: [0.07, 0.12], tail: 0.0, head: 0.0, eyeStyle: [0.7, 1], covering: ['slime'], pattern: ['gradient', 'mottle'], sheen: [0.8, 1.0], hue: [0.25, 0.7], sat: [0.5, 0.9], light: [0.45, 0.7] },
  { id: 'urchin', cluster: 'uncanny', weight: 0.6, symmetry: 'radial', radialCount: [8, 12], girth: [0.45, 0.7], repeat: [1, 1], height: [0.9, 1.1], covering: ['chitin'], pattern: ['mottle', 'bands'], hue: [0.6, 0.95], sat: [0.4, 0.8] },
  { id: 'starfish', cluster: 'uncanny', weight: 0.6, symmetry: 'radial', radialCount: [4, 6], girth: [0.4, 0.6], repeat: [1, 1], height: [0.4, 0.6], covering: ['plates', 'chitin'], pattern: ['reticulate', 'spots'], hue: [0.02, 0.15], sat: [0.5, 0.85] },
  // griffin/manticore mishmash: a winged horned tailed quadruped wearing spliced fins + a clashing skin
  { id: 'chimera', cluster: 'uncanny', weight: 0.9, girth: [0.45, 0.65], repeat: [3, 5], elong: [1.1, 1.4], legPairs: [2], posture: 'sprawling', legLen: [0.45, 0.7], legTerm: ['claw', 'foot', 'pincer'], wings: 1, dorsal: 0.85, pectoral: 0.6, tail: 1, tailTerm: ['fin', 'claw', 'none'], horns: 0.8, frill: 0.4, spines: 0.4, eyeStyle: [0, 1], eyeCount: [2, 3], mouthStyle: [0, 1], covering: ['skin', 'scales', 'fur', 'feathers', 'chitin', 'plates'], pattern: ['stripes', 'bands', 'spots', 'ocelli', 'reticulate', 'gradient'], sheen: [0.2, 0.9], hue: [0, 1], sat: [0.5, 0.9] },
  // wrong-arthropod: ten-plus sprawled legs, clustered compound/glowing eyes, multi-mandible, iridescent chitin
  { id: 'arthro-alien', cluster: 'uncanny', weight: 1.0, girth: [0.34, 0.5], repeat: [3, 5], height: [0.7, 0.95], elong: [1.1, 1.4], legPairs: [5], posture: 'sprawling', legLen: [0.55, 0.85], legAz: [3.6, 4.0], legTerm: ['claw'], spines: 0.7, antennae: 0.6, gills: 0.3, eyeStyle: [0.6, 0.85], eyeCount: [4, 6], mouthStyle: [0.38, 0.49], covering: ['chitin'], pattern: ['bands', 'reticulate'], sheen: [0.6, 0.95], hue: [0.15, 0.7], sat: [0.6, 0.9] },
  // crystalline: angular rigid limbs, a spike ridge, glowing facet "eyes" (the core), hard plated/metallic gradient skin
  { id: 'crystalline', cluster: 'uncanny', weight: 0.5, girth: [0.42, 0.6], repeat: [2, 3], height: [0.85, 1.1], elong: [1.0, 1.25], legPairs: [2], posture: 'upright', legLen: [0.5, 0.75], legThick: [0.3, 0.45], legTerm: ['claw'], spines: 1, horns: 0.6, eyeStyle: [0.85, 1], eyeCount: [2, 3], mouthStyle: [0.07, 0.12], covering: ['plates'], pattern: ['gradient'], sheen: [0.7, 1.0], hue: [0.55, 0.75], sat: [0.5, 0.85], light: [0.5, 0.7] },
];

const GENERIC_SIZE = GENE_BOUNDS.segment.size;
const FAMILIAR = MORPHOTYPES.filter((m) => m.cluster === 'familiar');
const UNCANNY = MORPHOTYPES.filter((m) => m.cluster === 'uncanny');

/** Morphotype ids (the attractor names) — used by the morphospace centroids (M11). */
export const MORPHOTYPE_IDS: readonly string[] = MORPHOTYPES.map((m) => m.id);

/** Compile a specific morphotype by id — for sampling its morphospace centroid. */
export function genomeOfMorphotype(seed: number, id: string): Genome {
  const m = MORPHOTYPES.find((x) => x.id === id) ?? MORPHOTYPES[0];
  return compile(mulberry32(seed >>> 0), seed >>> 0, m);
}

// =============================================================================
// Sampler
// =============================================================================

export function randomGenome(seed: number, mode: SymmetryMode = 'auto'): Genome {
  const s = seed >>> 0;
  const rng = mulberry32(s);

  if (mode === 'radial') {
    const radials = MORPHOTYPES.filter((m) => m.symmetry === 'radial');
    return rng() < 0.85 ? compile(rng, s, weightedMorpho(rng, radials)) : wild(rng, s, 'radial');
  }
  if (mode === 'bilateral') {
    const bils = MORPHOTYPES.filter((m) => (m.symmetry ?? 'bilateral') !== 'radial');
    return rng() < 0.85 ? compile(rng, s, weightedMorpho(rng, bils)) : wild(rng, s, 'bilateral');
  }
  // auto — bimodal: 45% familiar, 35% uncanny, 20% wild
  const roll = rng();
  if (roll < 0.45) return compile(rng, s, weightedMorpho(rng, FAMILIAR));
  if (roll < 0.8) return compile(rng, s, weightedMorpho(rng, UNCANNY));
  return wild(rng, s, rng() < 0.3 ? 'radial' : 'bilateral');
}

function weightedMorpho(rng: Rng, pool: readonly Morpho[]): Morpho {
  const total = pool.reduce((t, m) => t + m.weight, 0);
  let r = rng() * total;
  for (const m of pool) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return pool[pool.length - 1];
}

// =============================================================================
// Compiler: morphotype → genome
// =============================================================================

function compile(rng: Rng, seed: number, m: Morpho): Genome {
  const symmetry: Symmetry = m.symmetry ?? 'bilateral';
  const girth = rg(rng, m.girth);
  return symmetry === 'radial' ? compileRadial(rng, seed, m, girth) : compileBilateral(rng, seed, m, girth);
}

function compileBilateral(rng: Rng, seed: number, m: Morpho, girth: number): Genome {
  const height = rg(rng, m.height, [0.8, 1.05]);
  const elong = rg(rng, m.elong, [1.0, 1.3]);
  const wind = chance(rng, m.wind ?? 0);
  const apps: AppendageGene[] = [];

  // legs — placed on the canonical bauplan slots for this pair-count (M24), so generation and the
  // growth-time normalization agree (legs land where the attractor wants them).
  const lp = pick(rng, m.legPairs ?? ([2] as const));
  const legTerm = pick(rng, m.legTerm ?? (['foot'] as const));
  const slots = lp === 1 && m.rear && m.rear[1] < -0.26 ? [0.06] : legSlots(lp);
  for (let i = 0; i < lp; i++) {
    // a little slot jitter for individuality; the bauplan pass pulls it back toward the exact slot by
    // `coherence` (familiar ⇒ snapped, uncanny/wild ⇒ a touch looser — "coherent weird", M24)
    const t = clamp(slots[i] + range(rng, -0.06, 0.06), A.attachT);
    apps.push(leg(rng, t, girth, { term: legTerm, lenMul: m.legLen, thickMul: m.legThick, azimuth: m.legAz, posture: m.posture }));
  }
  // a forward-reaching grasping arm pair (primate) near the shoulders
  if (chance(rng, m.arms ?? 0)) apps.push(graspArm(rng, range(rng, 0.62, 0.78), girth, m));
  // wings, fins
  // wings root at the SHOULDERS — the front of the trunk (t → 1 is toward the head)
  if (chance(rng, m.wings ?? 0)) apps.push(wing(rng, range(rng, 0.68, 0.86), girth));
  if (chance(rng, m.dorsal ?? 0)) apps.push(dorsalFin(rng, range(rng, 0.3, 0.6), girth));
  if (chance(rng, m.pectoral ?? 0)) apps.push(pectoralFin(rng, range(rng, 0.25, 0.45), girth));
  // tail
  // a tail ends plain unless the morphotype says otherwise (a caudal FIN belongs to swimmers — the old
  // ['none','fin'] default gave bears, deer and apes a fish's tail fan)
  if (chance(rng, m.tail ?? 0.5)) apps.push(tail(rng, girth, pick(rng, m.tailTerm ?? (['none'] as const)), m));
  // dorsal spine ridge
  if (chance(rng, m.spines ?? 0)) for (let i = 0; i < 3; i++) apps.push(spine(rng, 0.2 + i * 0.25, girth));
  // a collar / fanned frill near the head
  if (chance(rng, m.frill ?? 0)) apps.push(frill(rng, range(rng, 0.7, 0.95), girth));
  // gill rakes on the front body (fish / shark); a domed carapace over the mid-body (turtle / crab)
  if (chance(rng, m.gills ?? 0)) apps.push(gill(rng, range(rng, 0.72, 0.95), girth));
  if (chance(rng, m.carapace ?? 0)) apps.push(carapace(rng, girth));

  const body: SegmentGene = {
    size: [girth, girth * height, girth * elong],
    repeat: randint(rng, m.repeat[0], m.repeat[1]),
    taper: clamp(rg(rng, m.taper, [0.86, 1.0]), GENE_BOUNDS.segment.taper),
    curve: [m.rear ? rg(rng, m.rear) : range(rng, -0.05, 0.03), wind ? range(rng, 0.06, 0.16) * (chance(rng, 0.5) ? -1 : 1) : range(rng, -0.02, 0.02)],
    appendages: apps,
  };

  // ONE eye style per creature — real animals have a single eye type, not a mix (a clear win).
  const eyeStyle = clamp(rg(rng, m.eyeStyle, [0, 0.95]), [0, 1]);
  if (chance(rng, m.head ?? 0.9)) {
    const head = headSeg(rng, girth, m, eyeStyle);
    if (m.neck) {
      // a neck sets the head apart from the shoulders: a narrower section, lifting the head a touch
      const nf = rg(rng, m.neck);
      const links = randint(rng, ...(m.neckLinks ?? ([1, 1] as const)));
      const sb = GENERIC_SIZE;
      body.child = {
        size: [clamp(girth * nf, sb), clamp(girth * nf * 1.08, sb), clamp(girth * nf * 1.25, sb)],
        repeat: links,
        taper: 0.96,
        curve: [clamp(rg(rng, m.neckLift, [-0.15, -0.05]), GENE_BOUNDS.segment.curvePitch), 0],
        appendages: [],
        child: head,
      };
    } else body.child = head;
  } else {
    faceOnBody(rng, apps, girth, m, eyeStyle);
  }
  return scaffold(rng, seed, 'bilateral', 4, body, m);
}

function compileRadial(rng: Rng, seed: number, m: Morpho, girth: number): Genome {
  const n = randint(rng, ...(m.radialCount ?? ([4, 8] as const)));
  const height = rg(rng, m.height, [0.7, 1.1]);
  const apps: AppendageGene[] = [arm(rng, girth, range(rng, 0.3, 0.6), m)];
  if (chance(rng, 0.4)) apps.push(arm(rng, girth * 0.6, range(rng, 0.45, 0.75), m, true)); // a second ring
  apps.push(eyes(rng, range(rng, 0.6, 0.95), false, girth, { style: m.eyeStyle, az: 1.5 })); // a crown of eyes (always — a face reads)
  // a central maw at the front: elevation ≈ +Z so grow's radial array collapses it onto the axis
  const mo = mouth(rng, girth, m.mouthStyle);
  mo.attachElevation = 1.35;
  apps.push(mo);

  const body: SegmentGene = {
    size: [girth, girth * height, girth * rg(rng, m.elong, [0.6, 0.95])],
    repeat: randint(rng, m.repeat[0], m.repeat[1]),
    taper: rg(rng, m.taper, [0.8, 0.95]),
    curve: [0, 0],
    appendages: apps,
  };
  return scaffold(rng, seed, 'radial', n, body, m);
}

// --- cranial silhouettes -------------------------------------------------------------------------
// A skull is not a ball. Real heads are wedges, high domes, broad slabs, swollen braincases, long
// tapered muzzles — and that silhouette is most of what makes a species recognizable. Each creature
// draws (or is pinned to) one archetype, so heads span radically different shapes instead of the
// uniform round lump. Values multiply head girth for width(x) / height(y) / length(z), plus the
// head segment's taper, pitch-curve, and link count. An explicit m.headWide/m.headDome still wins.
type HeadShape = 'round' | 'domed' | 'flat' | 'broad' | 'wedge' | 'bulbous' | 'tapered' | 'blocky';
interface HeadArch {
  wide: Rg;
  domed: Rg;
  long: Rg;
  taper: Rg;
  curve: Rg;
  repeat: readonly [number, number];
  weight: number; // relative frequency when not pinned (common skulls > exotic ones)
}
const HEAD_ARCHETYPES: Record<HeadShape, HeadArch> = {
  round: { wide: [0.92, 1.08], domed: [0.9, 1.12], long: [0.85, 1.05], taper: [0.86, 0.98], curve: [0.0, 0.12], repeat: [1, 2], weight: 0.45 },
  domed: { wide: [0.74, 0.96], domed: [1.3, 1.68], long: [0.78, 1.0], taper: [0.78, 0.94], curve: [0.0, 0.1], repeat: [2, 2], weight: 1.1 },
  flat: { wide: [1.06, 1.42], domed: [0.44, 0.66], long: [1.05, 1.45], taper: [0.78, 0.92], curve: [0.0, 0.18], repeat: [2, 2], weight: 1.1 },
  broad: { wide: [1.35, 1.8], domed: [0.8, 1.05], long: [0.72, 0.95], taper: [0.84, 0.99], curve: [0.0, 0.1], repeat: [1, 2], weight: 1.0 },
  wedge: { wide: [0.52, 0.76], domed: [0.95, 1.32], long: [1.15, 1.6], taper: [0.56, 0.72], curve: [0.0, 0.16], repeat: [2, 2], weight: 1.2 },
  bulbous: { wide: [1.1, 1.45], domed: [1.35, 1.8], long: [0.64, 0.9], taper: [0.58, 0.8], curve: [0.0, 0.1], repeat: [2, 2], weight: 0.9 },
  tapered: { wide: [0.54, 0.78], domed: [0.62, 0.92], long: [1.5, 2.05], taper: [0.56, 0.7], curve: [0.08, 0.28], repeat: [2, 2], weight: 1.1 },
  blocky: { wide: [1.12, 1.45], domed: [0.92, 1.24], long: [0.95, 1.25], taper: [0.88, 1.0], curve: [0.0, 0.1], repeat: [2, 2], weight: 1.0 },
};
const HEAD_SHAPE_IDS = Object.keys(HEAD_ARCHETYPES) as HeadShape[];
function weightedHeadShape(rng: Rng): HeadShape {
  const total = HEAD_SHAPE_IDS.reduce((t, k) => t + HEAD_ARCHETYPES[k].weight, 0);
  let r = rng() * total;
  for (const k of HEAD_SHAPE_IDS) {
    r -= HEAD_ARCHETYPES[k].weight;
    if (r <= 0) return k;
  }
  return HEAD_SHAPE_IDS[HEAD_SHAPE_IDS.length - 1];
}

function headSeg(rng: Rng, bodyGirth: number, m: Morpho, eyeStyle: number): SegmentGene {
  const g = bodyGirth * rg(rng, m.headSize, [0.7, 1.05]);
  if (m.muzzle) return muzzleHead(rng, g, m, eyeStyle);
  const apps: AppendageGene[] = [];
  const stalk = chance(rng, m.stalkEyes ?? 0);
  const eyeCount = pick(rng, m.eyeCount ?? ([2] as const));
  for (let p = 0; p < Math.max(1, Math.round(eyeCount / 2)); p++) {
    apps.push(eyes(rng, range(rng, 0.7, 0.98), false, g, { style: [eyeStyle, eyeStyle], az: m.eyeAz ? rg(rng, m.eyeAz) : range(rng, 0.18, 0.5) + p * 0.3, stalk }));
  }
  apps.push(mouth(rng, g, m.mouthStyle)); // every face has a mouth
  if (chance(rng, m.horns ?? 0)) apps.push(horns(rng, g));
  if (chance(rng, m.ears ?? 0)) apps.push(ear(rng, g, m.earStyle));
  if (chance(rng, m.whiskers ?? 0)) apps.push(whisker(rng, g));
  if (chance(rng, m.crest ?? 0)) apps.push(crest(rng, g));
  if (chance(rng, m.antennae ?? 0)) apps.push(antenna(rng, g));
  // a snout elongates the head into a muzzle/jaw that narrows toward the tip (where the mouth sits),
  // so dogs/horses/crocs read as themselves instead of round-faced blobs.
  const snout = rg(rng, m.snout, [0, 0]);
  // choose a cranial silhouette (pinned per-morphotype, else drawn weighted) so heads read as wildly
  // different skulls, not one round ball. An explicit m.headWide/m.headDome still wins (ursid, primate).
  const arch = HEAD_ARCHETYPES[m.headShape ? pick(rng, m.headShape) : weightedHeadShape(rng)];
  const wide = rg(rng, m.headWide, arch.wide);
  const domed = rg(rng, m.headDome, arch.domed);
  const sb = GENE_BOUNDS.segment.size;
  return {
    // a narrow (wedge/tapered) skull on a small-girth creature can dip below the size floor — clamp each
    // axis so the silhouette stays extreme but the gene stays in bounds (Pillar 1), like taper below.
    size: [clamp(g * wide, sb), clamp(g * domed, sb), clamp(g * (rg(rng, arch.long) + snout * 1.5), sb)],
    repeat: snout > 0.5 ? 2 : randint(rng, arch.repeat[0], arch.repeat[1]), // a snout adds a muzzle section
    taper: clamp(rg(rng, arch.taper) - snout * 0.3, GENE_BOUNDS.segment.taper), // narrows toward the face/snout
    curve: [rg(rng, arch.curve) - snout * 0.12, 0], // a long muzzle / tapered skull droops a touch
    appendages: apps,
  };
}

// A mammal skull is two volumes, not one: a round CRANIUM carrying the eyes and ears, and a narrower
// MUZZLE that juts forward and hangs below the brow, carrying the nose, whiskers and mouth. As one
// ball with a lip loop wrapped around its front, every mammal read as a frog in a fur suit; split
// into cranium + muzzle (a two-link head whose taper is the muzzle ratio and whose pitch drops the
// second link) a cat, a dog, a bear and a horse finally differ by the proportions of the same parts.
function muzzleHead(rng: Rng, g: number, m: Morpho, eyeStyle: number): SegmentGene {
  const apps: AppendageGene[] = [];
  const ratio = clamp(rg(rng, m.muzzle), GENE_BOUNDS.segment.taper);
  const snout = rg(rng, m.snout, [0, 0]);
  const mg = g * ratio; // the muzzle's girth — what its parts are sized against
  // eyes on the cranium's front, set high beside the muzzle bridge (attachT < 0.5 → the cranium link)
  const eyeCount = pick(rng, m.eyeCount ?? ([2] as const));
  for (let p = 0; p < Math.max(1, Math.round(eyeCount / 2)); p++) {
    apps.push(eyes(rng, range(rng, 0.05, 0.22), false, g * 0.85, { style: [eyeStyle, eyeStyle], az: (m.eyeAz ? rg(rng, m.eyeAz) : range(rng, 0.45, 0.7)) + p * 0.3 }));
  }
  const mouthGene = mouth(rng, mg * 1.05, m.mouthStyle);
  mouthGene.attachT = 1; // the muzzle carries the mouth
  apps.push(mouthGene);
  if (chance(rng, m.horns ?? 0)) apps.push({ ...horns(rng, g), attachT: range(rng, 0.0, 0.2) });
  if (chance(rng, m.ears ?? 0)) apps.push({ ...ear(rng, g * rg(rng, m.earSize, [1, 1]), m.earStyle), attachT: range(rng, 0.0, 0.2) });
  // whiskers fan out sideways from the muzzle's flanks (the generic whisker hangs off a snout's underside)
  if (chance(rng, m.whiskers ?? 0)) apps.push({ ...whisker(rng, mg), attachT: 1, attachAzimuth: range(rng, 5.75, 6.05), attachElevation: range(rng, 0.15, 0.4) });
  if (chance(rng, m.crest ?? 0)) apps.push({ ...crest(rng, g), attachT: range(rng, 0.0, 0.2) });
  const arch = HEAD_ARCHETYPES[m.headShape ? pick(rng, m.headShape) : 'round'];
  const wide = rg(rng, m.headWide, arch.wide);
  const domed = rg(rng, m.headDome, arch.domed);
  const sb = GENE_BOUNDS.segment.size;
  const drop = rg(rng, m.muzzleDrop, [0.3, 0.42]);
  // a LONG snout (dog, horse, weasel) is two muzzle links tapering to the nose — one stretched link
  // only swelled into a bulb on the front of the face
  const long = snout > 0.45;
  return {
    // z sets the cranium→muzzle stride: a flat face overlaps them (~0.85 radii), a snout reaches
    // further (grow turns any excess past 1.4 into a z-stretch of the node ellipsoids)
    size: [clamp(g * wide, sb), clamp(g * domed, sb), clamp(g * (long ? 1.0 + snout * 0.5 : 0.85 + snout * 1.3), sb)],
    repeat: long ? 3 : 2,
    taper: long ? clamp(Math.sqrt(ratio) * 0.98, GENE_BOUNDS.segment.taper) : ratio,
    curve: [clamp(long ? drop * 0.55 : drop - snout * 0.1, GENE_BOUNDS.segment.curvePitch), 0],
    appendages: apps,
  };
}

function faceOnBody(rng: Rng, apps: AppendageGene[], girth: number, m: Morpho, eyeStyle: number): void {
  const stalk = chance(rng, m.stalkEyes ?? 0);
  apps.push(eyes(rng, range(rng, 0.85, 0.98), false, girth, { style: [eyeStyle, eyeStyle], az: m.eyeAz ? rg(rng, m.eyeAz) : range(rng, 0.2, 0.5), stalk }));
  apps.push(mouth(rng, girth, m.mouthStyle)); // every face has a mouth
}

function scaffold(rng: Rng, seed: number, symmetry: Symmetry, radialCount: number, body: SegmentGene, m: Morpho): Genome {
  return {
    version: GENOME_VERSION,
    seed,
    symmetry,
    radialCount,
    // familiar ≈ fully canonical; uncanny a touch looser (still coherent — "coherent weird", M24)
    coherence: clamp(rg(rng, m.coherence, m.cluster === 'uncanny' ? [0.8, 0.95] : [0.95, 1.0]), [0, 1]),
    covering: covering(rng, m),
    palette: (() => {
      const exotic = rng() < 0.14; // a rare vivid morph
      const hueA = exotic ? rng() : rg(rng, m.hue, [0, 1]);
      const sat = exotic ? range(rng, 0.7, 0.95) : rg(rng, m.sat, [0.32, 0.9]);
      const light = rg(rng, m.light, [0.3, 0.7]);
      return { hueA, hueB: rng(), sat, light };
    })(),
    body,
  };
}

// Base sheen for a covering type — wet/glassy skins glisten, pelts are matte.
const SHEEN_BASE: Record<CoveringType, number> = {
  skin: 0.2,
  scales: 0.4,
  fur: 0.05,
  feathers: 0.15,
  chitin: 0.55,
  slime: 0.85,
  plates: 0.25,
};

function covering(rng: Rng, m: Morpho): Genome['covering'] {
  const type = pick(rng, m.covering ?? (['skin'] as const));
  const pattern = pick(rng, m.pattern ?? (['plain', 'mottle'] as const));
  // pattern scale rides on body girth so the markings read at any size
  const patternScale = clamp(range(rng, 1.4, 6.8), GENE_BOUNDS.covering.patternScale);
  const patternContrast = pattern === 'plain' ? range(rng, 0.0, 0.18) : range(rng, 0.4, 0.95);
  const sheen = clamp(rg(rng, m.sheen, [SHEEN_BASE[type] - 0.1, SHEEN_BASE[type] + 0.15]), GENE_BOUNDS.covering.sheen);
  return { type, pattern, patternScale, patternContrast, sheen };
}

// =============================================================================
// Part builders (parameterized)
// =============================================================================

// Leg posture (§5/§6.1) — the single biggest silhouette differentiator. Each gives the leg a
// distinct stance: how far out it splays (azimuth, 4.71 ≈ straight down), how hard it folds at the
// knee (curl), its articulation, and proportions. grow() folds the shin back at the knee, so these
// read as a sprawl, a digitigrade tip-toe, a flat plantigrade foot, a straight hoof column, etc.
type Posture = 'sprawling' | 'digitigrade' | 'plantigrade' | 'hooved' | 'upright';
// curl stays ≤ the curlPitch bound (0.6); grow's knee amplifies it ×1.5 at runtime for the fold.
const POSTURE: Record<Posture, { az: Rg; curl: Rg; segs: [number, number]; len: Rg; thick: Rg; term: Terminal }> = {
  // Big, strong, properly-angled limbs. `az` sets the stance width (lower = splayed out wider; 4.71 ≈
  // straight down/narrow), `thick`×girth the limb girth, `len`×girth the segment length, `term` the foot.
  sprawling: { az: [3.45, 3.85], curl: [0.48, 0.58], segs: [3, 4], len: [0.86, 1.18], thick: [0.36, 0.5], term: 'claw' },
  digitigrade: { az: [3.95, 4.35], curl: [0.46, 0.58], segs: [4, 4], len: [1.06, 1.46], thick: [0.28, 0.56], term: 'paw' },
  plantigrade: { az: [3.92, 4.32], curl: [0.32, 0.5], segs: [3, 4], len: [0.9, 1.26], thick: [0.36, 0.64], term: 'paw' },
  hooved: { az: [4.18, 4.5], curl: [0.12, 0.28], segs: [3, 4], len: [1.0, 1.42], thick: [0.34, 0.48], term: 'hoof' },
  upright: { az: [4.2, 4.5], curl: [0.22, 0.4], segs: [3, 4], len: [0.94, 1.36], thick: [0.4, 0.56], term: 'foot' },
};

interface LegOpts {
  term?: Terminal;
  lenMul?: Rg;
  thickMul?: Rg;
  azimuth?: Rg;
  posture?: Posture;
}
function leg(rng: Rng, attachT: number, girth: number, o: LegOpts = {}): AppendageGene {
  const p = POSTURE[o.posture ?? 'digitigrade'];
  return part('leg', o.term ?? p.term, true, range(rng, 0, 0.4), {
    attachT: clamp(attachT, A.attachT),
    attachAzimuth: rg(rng, o.azimuth ?? p.az),
    attachElevation: range(rng, -0.12, 0.12),
    segments: randint(rng, p.segs[0], p.segs[1]),
    length: clamp(girth * rg(rng, o.lenMul ?? p.len), A.length),
    thickness: clamp(girth * rg(rng, o.thickMul ?? p.thick), A.thickness),
    taper: range(rng, 0.7, 0.85),
    curl: [clamp(rg(rng, p.curl), A.curlPitch), range(rng, -0.06, 0.06)],
  });
}

// A forward-reaching grasping arm (primate): a jointed limb angled down-and-forward, clawed/grasping tip.
function graspArm(rng: Rng, attachT: number, girth: number, m?: Morpho): AppendageGene {
  return part('arm', 'hand', true, range(rng, 0, 0.3), {
    attachT,
    attachAzimuth: range(rng, 3.5, 3.95), // out to the side and down
    attachElevation: range(rng, 0.25, 0.55), // reaching forward
    segments: randint(rng, 3, 4),
    length: clamp(girth * rg(rng, m?.armLen, [0.5, 0.72]), A.length),
    thickness: clamp(girth * rg(rng, m?.armThick, [0.18, 0.28]), A.thickness),
    taper: rg(rng, m?.armTaper, [0.7, 0.85]),
    curl: [range(rng, 0.35, 0.55), 0], // an elbow bend
  });
}

function wing(rng: Rng, attachT: number, girth: number): AppendageGene {
  return part('wing', 'fin', true, range(rng, 0, 0.3), {
    attachT,
    attachAzimuth: range(rng, 1.6, 2.4), // up-and-side
    attachElevation: range(rng, -0.4, -0.1), // swept back
    roll: range(rng, -0.6, 0.6),
    // A wing is a MEMBRANE, not a limb. The membrane is drawn on the terminal node and scales with
    // its radius, so a long, tapering multi-segment arm spent the whole appendage on a bare stalk
    // and left a petal at the end. Keep the stalk to a short shoulder and let the wing be the part
    // you actually see: fewer/shorter segments, thicker, barely tapered → a big terminal node.
    segments: randint(rng, 1, 2),
    length: clamp(girth * range(rng, 0.32, 0.62), A.length),
    thickness: clamp(girth * range(rng, 0.36, 0.54), A.thickness),
    taper: range(rng, 0.88, 0.97),
    curl: [range(rng, -0.1, 0.2), 0],
  });
}

function tail(rng: Rng, girth: number, terminal: Terminal, m?: Morpho): AppendageGene {
  const segs = m?.tailSegs ?? [3, 6];
  return part('tail', terminal, false, range(rng, 0, 0.4), {
    attachT: range(rng, 0.0, 0.06),
    attachAzimuth: range(rng, 4.4, 5.0),
    attachElevation: rg(rng, m?.tailDroop, [-1.25, -0.75]),
    segments: randint(rng, segs[0], segs[1]),
    length: clamp(girth * rg(rng, m?.tailLen, [0.7, 1.4]), A.length),
    thickness: clamp(girth * rg(rng, m?.tailThick, [0.18, 0.34]), A.thickness),
    taper: range(rng, 0.62, 0.82),
    curl: [rg(rng, m?.tailCurl, [-0.1, 0.15]), range(rng, -0.05, 0.05)],
  });
}

function horns(rng: Rng, refGirth: number): AppendageGene {
  return part('horn', 'claw', true, range(rng, 0, 0.6), {
    attachAzimuth: range(rng, 1.0, 1.7),
    attachElevation: range(rng, 0.3, 0.7),
    segments: randint(rng, 1, 2),
    length: clamp(refGirth * range(rng, 0.5, 1.0), A.length),
    thickness: clamp(refGirth * range(rng, 0.18, 0.32), A.thickness),
    taper: range(rng, 0.5, 0.7),
    curl: [range(rng, -0.1, 0.25), 0],
  });
}

function spine(rng: Rng, attachT: number, girth: number): AppendageGene {
  return part('spine', 'claw', false, range(rng, 0, 0.4), {
    attachT,
    attachAzimuth: Math.PI / 2, // straight up
    attachElevation: range(rng, -0.1, 0.1),
    segments: 1,
    length: clamp(girth * range(rng, 0.4, 0.8), A.length),
    thickness: clamp(girth * range(rng, 0.12, 0.22), A.thickness),
    taper: range(rng, 0.5, 0.65),
    curl: [0, 0],
  });
}

function antenna(rng: Rng, refGirth: number): AppendageGene {
  return part('antenna', 'none', true, 0.5, {
    attachT: range(rng, 0.85, 1.0),
    attachAzimuth: range(rng, 1.1, 1.5),
    attachElevation: range(rng, 0.3, 0.6),
    segments: randint(rng, 2, 3),
    length: clamp(refGirth * range(rng, 0.6, 1.1), A.length),
    thickness: clamp(refGirth * range(rng, 0.06, 0.12), A.thickness),
    taper: range(rng, 0.7, 0.9),
    curl: [range(rng, -0.3, 0.3), 0],
  });
}

// A frill: a broad fanned collar (lizard ruff / dragon crest), aimed up-and-side, rolled flat.
function frill(rng: Rng, attachT: number, girth: number): AppendageGene {
  return part('frill', 'fin', true, range(rng, 0, 1), {
    attachT,
    attachAzimuth: range(rng, 1.2, 1.9),
    attachElevation: range(rng, -0.2, 0.15),
    roll: range(rng, -0.4, 0.4),
    segments: 1,
    length: clamp(girth * range(rng, 0.7, 1.3), A.length),
    thickness: clamp(girth * range(rng, 0.3, 0.5), A.thickness),
    taper: range(rng, 0.7, 0.9),
    curl: [0, 0],
  });
}

function dorsalFin(rng: Rng, attachT: number, girth: number): AppendageGene {
  return part('fin', 'fin', false, range(rng, 0, 0.3), {
    attachT,
    attachAzimuth: Math.PI / 2,
    attachElevation: range(rng, -0.15, 0.05),
    segments: 1,
    length: clamp(girth * range(rng, 0.18, 0.34), A.length),
    thickness: clamp(girth * range(rng, 0.42, 0.6), A.thickness),
    taper: range(rng, 0.9, 0.98),
    curl: [range(rng, -0.1, 0.2), 0],
  });
}

function pectoralFin(rng: Rng, attachT: number, girth: number): AppendageGene {
  return part('fin', 'fin', true, range(rng, 0, 0.3), {
    attachT,
    attachAzimuth: range(rng, 2.9, 3.5),
    attachElevation: range(rng, -0.2, 0.0),
    roll: range(rng, -0.4, 0.4),
    segments: 1,
    length: clamp(girth * range(rng, 0.2, 0.38), A.length),
    thickness: clamp(girth * range(rng, 0.4, 0.58), A.thickness),
    taper: range(rng, 0.9, 0.98),
    curl: [range(rng, -0.1, 0.1), range(rng, -0.1, 0.1)],
  });
}

interface EyeOpts {
  style?: Rg;
  az?: number;
  stalk?: boolean; // ride a multi-segment eyestalk (crab / snail) — M23
}
function eyes(rng: Rng, attachT: number, antennae: boolean, refGirth: number, o: EyeOpts = {}): AppendageGene {
  const stalk = o.stalk ?? false;
  return part('eyestalk', 'eye', true, rg(rng, o.style, [0, 1]), {
    attachT: clamp(attachT, A.attachT),
    attachAzimuth: o.az ?? range(rng, 0.7, 1.3),
    // eyes sit on the FRONT of the face and gaze forward (high elevation → the aim/normal points +Z),
    // not perched on top of the skull staring outward (the old "boob-head" + googly-derpy look).
    attachElevation: range(rng, stalk ? 0.4 : 0.85, stalk ? 0.8 : 1.2),
    segments: stalk || antennae ? randint(rng, 2, 3) : 1,
    length: clamp(refGirth * (stalk ? range(rng, 0.55, 0.9) : range(rng, 0.45, 0.7)), A.length),
    // eyes sized smaller relative to the head than before (they read as big cartoon eyes otherwise);
    // grow then pushes them proud of the body so they stay clearly visible even in capsule mode.
    thickness: clamp(Math.max(0.07, refGirth * (stalk ? range(rng, 0.14, 0.2) : range(rng, 0.18, 0.26))), A.thickness),
    taper: stalk ? range(rng, 0.92, 0.99) : range(rng, 0.85, 0.95),
    curl: [range(rng, -0.2, 0.1), 0],
  });
}

// --- M23 decorative parts (ears / whiskers / gills / crest / carapace) -------

// An ear: a short head stub; the feature renders pointed / leaf / round by style (§6.4).
function ear(rng: Rng, refGirth: number, style?: Rg): AppendageGene {
  return part('ear', 'ear', true, rg(rng, style, [0, 0.33]), {
    attachT: range(rng, 0.6, 0.95),
    attachAzimuth: range(rng, 1.05, 1.5), // up and to the side
    attachElevation: range(rng, -0.1, 0.25),
    segments: 1,
    length: clamp(refGirth * range(rng, 0.45, 0.8), A.length),
    thickness: clamp(refGirth * range(rng, 0.3, 0.5), A.thickness),
    taper: range(rng, 0.7, 0.9),
    curl: [0, 0],
  });
}

// Whiskers: a snout stub; the feature renders a fan of fine pale filaments (§6.4).
function whisker(rng: Rng, refGirth: number): AppendageGene {
  return part('whisker', 'whisker', true, 0.5, {
    attachT: range(rng, 0.9, 1.0),
    attachAzimuth: range(rng, 4.0, 4.6), // low on the snout
    attachElevation: range(rng, 0.3, 0.6), // forward
    segments: 1,
    length: clamp(refGirth * range(rng, 0.18, 0.32), A.length),
    thickness: clamp(refGirth * range(rng, 0.1, 0.18), A.thickness),
    taper: 0.7,
    curl: [0, 0],
  });
}

// Gills: a rake of slits on the side of the front body (§6.4).
function gill(rng: Rng, attachT: number, girth: number): AppendageGene {
  return part('gill', 'gill', true, 0.5, {
    attachT: clamp(attachT, A.attachT),
    attachAzimuth: range(rng, 3.0, 3.6), // side, slightly down
    attachElevation: range(rng, -0.1, 0.2),
    segments: 1,
    length: clamp(girth * range(rng, 0.12, 0.28), A.length),
    thickness: clamp(girth * range(rng, 0.32, 0.5), A.thickness),
    taper: 0.85,
    curl: [0, 0],
  });
}

// A crest: a midline head fan (songbird / basilisk), aimed up (§6.4).
function crest(rng: Rng, refGirth: number): AppendageGene {
  return part('crest', 'crest', false, range(rng, 0, 1), {
    attachT: range(rng, 0.7, 1.0),
    attachAzimuth: Math.PI / 2, // straight up
    attachElevation: range(rng, -0.1, 0.25),
    segments: 1,
    length: clamp(refGirth * range(rng, 0.4, 0.8), A.length),
    thickness: clamp(refGirth * range(rng, 0.45, 0.7), A.thickness),
    taper: 0.8,
    curl: [0, 0],
  });
}

// A carapace: a domed shell over the mid-body; the feature renders the big dome (§6.4).
function carapace(rng: Rng, girth: number): AppendageGene {
  return part('plate', 'carapace', false, 0.5, {
    attachT: range(rng, 0.4, 0.6),
    attachAzimuth: Math.PI / 2, // up
    attachElevation: range(rng, -0.1, 0.1),
    segments: 1,
    length: clamp(girth * range(rng, 0.1, 0.25), A.length), // short stub; the dome lives in the render
    thickness: clamp(girth * range(rng, 0.7, 1.0), A.thickness), // sets the dome's size
    taper: 0.9,
    curl: [0, 0],
  });
}

function mouth(rng: Rng, refGirth: number, style?: Rg): AppendageGene {
  return part('maw', 'mouth', false, rg(rng, style, [0, 1]), {
    attachT: range(rng, 0.85, 1.0),
    attachAzimuth: range(rng, 4.5, 4.95), // down…
    // …and well forward — on the face FRONT, not the underside (M24). This must stay above the
    // bauplan's mouth-elevation floor or every creature's mouth pins to that one constant and the
    // gene stops varying at all; sampling across it keeps the snout angle evolvable.
    attachElevation: range(rng, 0.95, 1.35),
    segments: 1,
    length: clamp(refGirth * range(rng, 0.5, 0.72), A.length),
    thickness: clamp(refGirth * range(rng, 0.52, 0.74), A.thickness), // big enough to read clearly as an organ
    taper: 0.9,
    curl: [0, 0],
  });
}

// A radial arm; grow arrays it `radialCount` times around the body axis.
function arm(rng: Rng, girth: number, attachT: number, m: Morpho, spiky = false): AppendageGene {
  if (m.id === 'starfish' && !spiky) {
    // a sea star's arms: thick at the disc, tapering, laid flat on the ground
    return part('spine', 'none', false, range(rng, 0, 1), {
      attachT: clamp(attachT, A.attachT),
      attachAzimuth: range(rng, 0, 0.4),
      attachElevation: range(rng, -0.14, 0.02),
      segments: randint(rng, 3, 4),
      length: clamp(girth * range(rng, 0.62, 0.95), A.length),
      thickness: clamp(girth * range(rng, 0.34, 0.46), A.thickness),
      taper: range(rng, 0.68, 0.8),
      curl: [range(rng, -0.04, 0.06), range(rng, -0.05, 0.05)],
    });
  }
  const term: Terminal =
    m.id === 'urchin' ? 'claw' : m.id === 'cephalopod' ? pick(rng, ['none', 'fin'] as const) : spiky ? pick(rng, ['claw', 'fin'] as const) : pick(rng, ['claw', 'fin', 'none'] as const);
  const long = m.id === 'cephalopod' || m.id === 'horror';
  return part(long ? 'tentacle' : 'spine', term, false, range(rng, 0, 1), {
    attachT: clamp(attachT, A.attachT),
    attachAzimuth: range(rng, 0, 0.4),
    attachElevation: long ? range(rng, -0.6, -0.1) : range(rng, -0.3, 0.3),
    segments: spiky ? randint(rng, 1, 2) : long ? randint(rng, 3, 5) : randint(rng, 2, 4),
    length: clamp(girth * range(rng, spiky ? 0.4 : long ? 0.9 : 0.6, spiky ? 0.8 : long ? 1.8 : 1.4), A.length),
    thickness: clamp(girth * range(rng, 0.12, 0.3), A.thickness),
    taper: range(rng, 0.6, 0.88),
    curl: [range(rng, -0.3, 0.4), range(rng, -0.1, 0.1)],
  });
}

// =============================================================================
// Wild fallback — free composition (the ~20% in-between tail)
// =============================================================================

function wild(rng: Rng, seed: number, symmetry: 'bilateral' | 'radial'): Genome {
  // pick a morphotype but shatter it: random legs/wings/fins/tail/horns regardless of prior
  const base: Morpho = pick(rng, MORPHOTYPES);
  const m: Morpho = {
    ...base,
    symmetry,
    legPairs: [Math.floor(rng() * 4)], // 0..3
    wings: rng() < 0.35 ? 1 : 0,
    dorsal: rng() < 0.4 ? 1 : 0,
    pectoral: rng() < 0.3 ? 1 : 0,
    tail: rng() < 0.5 ? 1 : 0,
    tailTerm: ['none', 'fin', 'barb', 'club'],
    horns: rng() < 0.4 ? 1 : 0,
    spines: rng() < 0.3 ? 1 : 0,
    ears: rng() < 0.3 ? 1 : 0,
    whiskers: rng() < 0.25 ? 1 : 0,
    gills: rng() < 0.2 ? 1 : 0,
    crest: rng() < 0.25 ? 1 : 0,
    carapace: rng() < 0.15 ? 1 : 0,
    stalkEyes: rng() < 0.2 ? 1 : 0,
    eyeStyle: [0, 1],
    mouthStyle: [0, 1],
    covering: ['skin', 'scales', 'fur', 'feathers', 'chitin', 'slime', 'plates'],
    pattern: ['plain', 'stripes', 'bands', 'spots', 'ocelli', 'reticulate', 'mottle', 'gradient'],
    coherence: [0.4, 0.7], // the wild tail is loose — but the bauplan pass still keeps legs down + a face
    sheen: [0, 1],
    hue: [0, 1],
  };
  return compile(rng, seed, m);
}

// =============================================================================
// Helpers
// =============================================================================

/** Build an AppendageGene with v2 defaults; `o` supplies the required shape fields. */
function part(
  kind: PartKind,
  terminal: Terminal,
  pair: boolean,
  style: number,
  o: Pick<AppendageGene, 'attachAzimuth' | 'segments' | 'length' | 'thickness' | 'taper' | 'curl'> & Partial<AppendageGene>,
): AppendageGene {
  return { kind, style, attachT: 0.5, attachElevation: 0, roll: 0, terminal, pair, ...o };
}

function rg(rng: Rng, r: Rg | undefined, dflt: Rg = [0, 1]): number {
  return range(rng, ...(r ?? dflt));
}
function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
function randint(rng: Rng, min: number, max: number): number {
  return Math.round(range(rng, min, max));
}
