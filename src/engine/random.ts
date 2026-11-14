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
import { bipedSlot, legSlots, QUILL_STYLE, ringSlots } from './grow';
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
  //            (a few hundredths POSITIVE sets a runner's deep chest below its croup: the back runs level
  //            instead of falling from the withers to narrower hips, a hyena's slope)
  legPairs?: readonly number[]; // bilateral only
  legLen?: Rg; // ×girth
  legThick?: Rg; // ×girth
  /** fixed length/thickness multipliers on the HIND and FORE pairs of a quadruped (a frog's springing
   *  haunches and short arms) — constants, so they cost no random draw */
  hindLeg?: readonly [number, number];
  foreLeg?: readonly [number, number];
  legAz?: Rg; // sprawl azimuth (4.7 ≈ straight down) — overrides the posture's default
  legCurl?: Rg; // how hard the leg folds at knee and hock — overrides the posture's default (a standing
  //               dog's hind leg is near a post: on a cat's deep fold its paws sat under its belly, a crouch)
  legTaper?: Rg; // per-link thinning down the leg — default [0.7, 0.85]; nearer 0.9 the shank keeps
  //                its girth and the paw at its end is a real foot, not a knob on a dowel (a strider's
  //                shank and ankle stay stout)
  posture?: Posture; // leg stance (§6.1): sprawling / digitigrade / plantigrade / hooved / upright
  legTerm?: readonly Terminal[];
  /** the cut of a feathered leg's clawed foot (viewer/feet TALONED): under 0.6 the thin perching toes
   *  every bird had; over it a bird of prey's — stout spread toes ending in long hooked talons */
  legStyle?: Rg;
  wings?: number;
  arms?: number; // prob of a forward-reaching grasping arm pair (primate)
  claws?: number; // prob of a pair of CHELIPEDS — a crab's big claws, held out in front (see cheliped)
  dorsal?: number;
  pectoral?: number;
  /** false: the pectoral pair is drawn and then left off (so no other gene of the plan moves). On a body
   *  that stands on four legs under a pair of wings, a fin on each flank was a pale shard stuck to the
   *  ribs, its rays a row of needles out of the side. */
  flankFins?: false;
  anal?: number; // prob of an anal fin: a keel under the rear of a fish's body, opposite the dorsal
  pelvic?: number; // prob of a pair of pelvic fins under the belly (a bony fish's)
  dorsal2?: number; // prob of a small second dorsal fin toward the tail (a shark's)
  dorsalT?: Rg; // where along the back the dorsal fin stands — default [0.3, 0.6]
  pectoralAz?: Rg; // pectoral-fin azimuth — default [3.25, 3.6] (out from low on the flank, a shark's planes);
  //                  nearer 3.9 they point down-and-out
  pectoralEl?: Rg; // …and how far they sweep back (rad) — default [-0.38, -0.2]; a resting fish lays them back (≈ -0.9)
  /** the cut of the fins (viewer/wings finCutOf): under 0.3 the plain fin every finned body had;
   *  0.3–0.6 a bony fish's (a long low sail down the back, a forked tail, round paddles);
   *  over 0.6 a shark's (a tall raked blade, a tail with a long upper lobe, long swept planes) */
  finStyle?: Rg;
  gillStyle?: number; // 0 a bony fish's gill cover (one curved edge) … 0.5 a rake of bars … 1 a shark's row of slits
  headLinks?: number; // a plain head's link count (else the cranial archetype's): 3 runs out a long pointed snout
  mouthT?: Rg; // where along the head the mouth sits — default the tip; a shark's is set back under its snout
  mouthEl?: Rg; // …and how far it turns down there (rad: 1.2 looks ahead, 0.5 at the floor)
  mouthSize?: Rg; // × the mouth's usual size (a bird of prey's bill is a big part of its face)
  wingSize?: Rg; // × the wing's usual size (a dragon's are sails, not the fins on a flying fish)
  /** the cut of a folded feathered wing (viewer/wings LONG_WING): under 0.6 the short leaf every bird
   *  had, laid level along the flank; over it a bird of prey's long wing, from the top of the
   *  shoulders down the line of the back to the tail */
  wingStyle?: Rg;
  wingSegs?: number; // the wing arm's link count (else 1–2): a long wing's upper arm, forearm and hand
  stalkLen?: Rg; // × an eye stalk's usual length (a slug's are short feelers, not a pair of antlers)
  stalkSegs?: number; // an eye stalk's link count (a constant: no draw) — a slug's feeler bends once on its way up
  headLong?: Rg; // a plain head's length ×its girth (else the cranial archetype's)
  headTaper?: Rg; // a plain head's link-to-link taper (else the archetype's, less its snout's): near 0.85
  headCurve?: Rg; // a plain head's pitch per link (else the archetype's, lifted by its snout): positive noses down, near 0 a fish's level snout
  pectoralT?: Rg; // where along the trunk the pectoral fins root (else 0.66–0.8): near 1, just behind the gills
  //                 runs long near-parallel jaws (a crocodile's) instead of a cone
  tail?: number;
  tailTerm?: readonly Terminal[];
  tailLen?: Rg; // tail segment length ×girth — default [0.7, 1.4]; birds keep a short stub under a feather fan
  tailSegs?: readonly [number, number]; // default [3, 6]
  tailThick?: Rg; // tail root radius ×girth — default [0.18, 0.34]; a fish's peduncle is thick
  tailDroop?: Rg; // tail exit elevation (rad; -π/2 = straight back, -0.75 ≈ hanging) — default [-1.25, -0.75]
  tailCurl?: Rg; // tail per-link pitch (negative curls it up) — default [-0.1, 0.15]
  tailTaper?: Rg; // per-link radius ratio — default [0.62, 0.82]; a reptile's heavy tail tapers slowly
  /** a plain tail's cut (else [0, 0.4]: round, tapering to a point). From grow's BRUSH_STYLE up to its
   *  SCULL_STYLE it is a BRUSH (a fox's: slim at the root, bushy down its middle, drawn to a point —
   *  see brushProfile); from SCULL_STYLE a crocodile's sculling tail — deep, flattened side to side
   *  toward its tip, and crested with scutes that run on up the back (viewer/scutes) */
  tailStyle?: Rg;
  tailAz?: Rg; // tail exit azimuth around the rump (4.71 = underside, 1.57 = the back) — default [4.4, 5.0];
  //              an upright trunk's rump points at the ground, so a monkey's tail leaves from its back
  neck?: Rg; // a neck between trunk and head: its girth ×body girth (absent ⇒ the head sits on the shoulders)
  neckLinks?: readonly [number, number]; // neck length in links (default [1, 1])
  neckLift?: Rg; // per-link upward bend of the neck (rad, negative = up) — default [-0.15, -0.05]
  neckLong?: number; // a neck link's length ×its girth — default 1.25; an ape's is a short thick nape, the head close
  //                    on the shoulders; shorter links let a fox's neck of three turn up steeply and carry
  //                    the head high without reaching far forward
  headSize?: Rg; // head girth ×body girth — default [0.7, 1.05]; a mammal's skull is far narrower than its chest
  muzzle?: Rg; // a mammal skull: a round cranium + a narrower, dropped muzzle (muzzle girth ×cranium, ≥ 0.6)
  muzzleDrop?: Rg; // how far the muzzle hangs below the brow (pitch, rad) — default [0.3, 0.42]
  /** a long muzzle's length × its usual (a constant: no draw) — a bear's runs shorter from its stop than a dog's */
  muzzleLong?: number;
  stop?: Rg; // a long muzzle's link-to-link taper, set past 0.9: the skull then has a STOP — a forehead
  //            step down to a muzzle that holds its girth (a dog's), not one cone from ears to nose
  earSize?: Rg; // ear size ×the skull's (a bear's small round ears vs a fennec's) — default [1, 1]
  earAz?: Rg; // ear azimuth on the skull (≈1.3 up-and-side, a cat's; ≈0.35 on the side, an ape's)
  armAz?: Rg; // grasping-arm azimuth — default [3.5, 3.95] (out to the side and down)
  armEl?: Rg; // grasping-arm elevation — default [0.25, 0.55] (reaching forward). On a trunk pitched up
  //            by θ the cross-section's "down" points down-and-FORWARD, so a hanging arm needs ≈ −θ
  armT?: Rg; // where along the trunk the arms root — default [0.62, 0.78]; ≈0.9 is the shoulders
  armLen?: Rg; // grasping-arm segment length ×girth — default [0.5, 0.72] (an ape's arms are long)
  armThick?: Rg; // grasping-arm root radius ×girth — default [0.18, 0.28]
  armTaper?: Rg; // default [0.7, 0.85]
  armCurl?: Rg; // the elbow's bend (rad per joint) — default [0.35, 0.55]; an ape's long arms hang near straight
  armSegs?: number; // the arm's link count (else 3 or 4 by the draw): an ape's is a shoulder, an elbow and a fist (on
  //                   four the forearm broke again above the wrist); a theropod's small arm is upper arm, forearm, hand
  horns?: number;
  /** where along a plain head the horns root (0 = the cranium) — default mid-head, which on a head of
   *  two links is its SNOUT: a pair of horns stood on the tip of the nose like a stalk. A constant: no draw. */
  hornT?: number;
  /** the horns' azimuth round the skull (π/2 = straight up) — default [1.0, 1.7], which reaches the
   *  midline and past it: on a narrow skull the pair merged into one forked stub. Nearer 1.0 they stand
   *  apart on the upper corners of the head. */
  hornAz?: Rg;
  /** the horns' tilt along the skull (+ forward, − back) — default [0.3, 0.7], forward: on a dragon they
   *  stood up off the crown like a pair of ears. Swept back they run on from the skull's line. */
  hornEl?: Rg;
  spines?: number;
  frill?: number;
  /** 'head': the frill fans out from the back of the SKULL (a frilled lizard's ruff, a lion's mane)
   *  instead of round the trunk, where on a long four-legged body it stood across the middle of the
   *  back like a tutu and cut the animal in two. The part is moved once the head exists: no draw. */
  frillAt?: 'head';
  /** 'head': the gill cover is the back of the SKULL, the pectoral pair hung just behind it (a bony fish's
   *  shoulder girdle is braced on its skull). Both parts are moved once the head exists: no draw. */
  gillAt?: 'head';
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
  /** an ARTHROPOD body of tagmata: the trunk is a legless ABDOMEN, the legs ride a thorax ahead of it
   *  (an insect then grows a head on the thorax; a spider's cephalothorax IS its head) — see compileArthropod */
  tagmata?: 'insect' | 'spider';
  thorax?: Rg; // thorax / cephalothorax girth ×the abdomen's — default [0.6, 0.72]
  thoraxLong?: Rg; // its length ×its girth — default [1.1, 1.3]
  eyeStyle?: Rg; // 0 round … 1 glowing
  eyeCount?: readonly number[];
  eyeAz?: Rg; // placement (1.0 up-fwd, ~0.3 side, ~1.6 top — but a PAIR near 1.57 merges on the midline)
  eyeEl?: Rg; // forward tilt of the eyes: ~1.1 forward (cat, ape) … ~0.6 lateral (deer, mouse) … ~0.25 a fish's
  eyeT?: Rg; // where along a plain head the eyes sit — default [0.7, 0.98] (front); a croc's ride far back
  eyeSize?: number; // × the eye's usual size (a frog's bulge from the top of its head; an ape's are small under its brow)
  eyeTilt?: number; // rolls each eye about its gaze (rad), so its lids slant down toward the bill: a hawk's scowl
  hindSegs?: number; // the hind pair's link count (a frog's thigh, shin and long foot fold in a Z)
  legSegs?: number; // every leg's link count (a crab's merus, carpus and pointed dactyl: on two links its legs were table legs)
  spineCount?: number; // how many spines stand along the back (a crystal beast's row of shards)
  spineSize?: Rg; // × a back spine's usual length and girth
  legYaw?: number; // every leg's sideways bend per joint (rad; else a small draw either way): 0 keeps a strider's
  //                   legs in the fore-aft plane, its feet under its hips
  /** a MYRIAPOD: the trunk has one link — one ring — to each leg pair, the pairs running its whole
   *  length (see grow isRinged). Its `repeat` then stands unused. */
  ringLegs?: boolean;
  /** leg length × at the rearmost pair … at the foremost, graded evenly between (a centipede's legs
   *  lengthen toward its trailing pair) — constants, so they cost no random draw */
  legGrade?: readonly [number, number];
  antennaAz?: Rg; // antenna azimuth on the head — default [1.1, 1.5] (near the crown, where a pair all but meets)
  antennaEl?: Rg; // …how far they reach forward (rad) — default [0.3, 0.6]
  antennaLen?: Rg; // …a link's length ×the head's girth — default [0.6, 1.1]
  antennaSegs?: number; // …their link count — default 2 or 3
  antennaCurl?: Rg; // …and their bend per link (positive droops the tip) — default [-0.3, 0.3]
  mouthStyle?: Rg; // bands (viewer/partStyles mouthVariant): <0.06 herbivore · <0.125 maw · <0.25 fanged · <0.375 beak ·
  //                   <0.5 mandibles · <0.625 sucker · <0.75 lamprey · <0.85 baleen · <0.93 proboscis · else trunk
  covering?: readonly CoveringType[]; // skin material (MORPHOLOGY §7); default ['skin']
  pattern?: readonly PatternType[]; // color field; default ['plain', 'mottle']
  patternScale?: Rg; // how fine the markings are (cells per body unit) — default [1.4, 6.8]
  coherence?: Rg; // structural-coherence dial (M24); default familiar≈1 / uncanny≈0.85
  sheen?: Rg; // matte ↔ wet/iridescent; default derives from the covering type
  hue?: Rg;
  sat?: Rg;
  light?: Rg;
  /** markings keep to the body's own hue or a dark umber, like a pelt's, whatever the covering (a
   *  hawk's barring is its own brown, darker: let loose like a songbird's flash of colour, every
   *  other hawk wore a violet hood or green bars and read as a parrot; an olive crocodile wore
   *  violet blotches) */
  soberMarks?: boolean;
}

// Terse priors. Unspecified fields fall back to sensible defaults in `compile`.
const MORPHOTYPES: readonly Morpho[] = [
  // --- familiar ---
  // (a cat's eye is a slit: amber, gold or green round an upright pupil. Round and brown, it was a dog's)
  // (its coat tawny, ginger or sandy: on the reddest hues, lit pale, it was a salmon-pink cat, a hairless one)
  { id: 'felid', cluster: 'familiar', weight: 0.8, earSize: [0.95, 1.2], legThick: [0.48, 0.6], taper: [1.07, 1.12], eyeEl: [1.0, 1.12], girth: [0.45, 0.6], repeat: [3, 4], height: [1.0, 1.1], elong: [1.4, 1.6], neck: [0.8, 0.92], neckLinks: [2, 2], neckLift: [-0.4, -0.28], headWide: [1.12, 1.28], headDome: [0.8, 0.92], headSize: [0.9, 1.04], muzzle: [0.6, 0.66], legPairs: [2], posture: 'digitigrade', legAz: [4.42, 4.58], legLen: [1.05, 1.25], legTerm: ['paw'], snout: [0, 0.2], tail: 0.97, tailSegs: [5, 6], tailLen: [0.8, 1.05], tailThick: [0.22, 0.3], tailDroop: [-1.25, -1.05], tailCurl: [0.12, 0.22], horns: 0.03, ears: 0.9, earAz: [0.62, 0.88], earStyle: [0, 0.3], whiskers: 0.9, eyeStyle: [0.44, 0.56], mouthStyle: [0.15, 0.23], covering: ['fur'], pattern: ['spots', 'stripes', 'plain'], patternScale: [8.5, 11], hue: [0.065, 0.12], sat: [0.4, 0.7], light: [0.3, 0.6] },
  // a dog / fox / wolf: a braincase with a stop and a muzzle, the head carried up on a short neck, a level
  // back over near-straight legs that keep their girth down to real paws, a brush hanging to the hocks.
  // (as a long-snouted cat it stood crouched on dowels with a sloping back, one cone for a head and a
  // sausage for a tail: a fawn-legged bull terrier)
  // (its brush carried out behind, falling only at its end: hung plumb from the rump, from the front it showed
  // between the forelegs as a pale lobe under the chest — an udder)
  { id: 'canid', cluster: 'familiar', weight: 0.8, legThick: [0.38, 0.46], legTaper: [0.9, 0.96], legCurl: [0.28, 0.36], height: [1.04, 1.14], taper: [1.07, 1.12], eyeEl: [0.85, 1.0], girth: [0.42, 0.56], repeat: [3, 3], rear: [0.025, 0.045], elong: [1.28, 1.4], neck: [0.74, 0.82], neckLinks: [3, 3], neckLong: 0.95, neckLift: [-0.5, -0.45], headWide: [1.14, 1.26], headDome: [0.86, 0.96], headSize: [0.84, 0.94], muzzle: [0.6, 0.68], stop: [0.92, 0.96], muzzleDrop: [0.1, 0.2], legPairs: [2], posture: 'digitigrade', legAz: [4.42, 4.58], legLen: [1.1, 1.25], legTerm: ['paw'], snout: [0.5, 0.7], tail: 0.95, tailSegs: [5, 5], tailLen: [0.9, 1.02], tailThick: [0.34, 0.42], tailTaper: [0.96, 1.0], tailStyle: [0.62, 0.78], tailDroop: [-0.58, -0.51], tailCurl: [0.11, 0.14], ears: 1, earAz: [0.8, 1.02], earStyle: [0, 0.3], earSize: [1.3, 1.6], whiskers: 0.25, eyeStyle: [0, 0.15], mouthStyle: [0.15, 0.23], covering: ['fur'], pattern: ['plain', 'mottle'], hue: [0.05, 0.1], sat: [0.35, 0.8], light: [0.3, 0.56] }, // fox red to wolf brown (a pale coat on these hues was a salmon-pink dog)
  { id: 'rodent', cluster: 'familiar', weight: 1.3, taper: [0.9, 0.96], eyeEl: [0.55, 0.7], girth: [0.3, 0.45], repeat: [3, 3], height: [0.9, 1.1], headSize: [0.68, 0.82], muzzle: [0.6, 0.68], legPairs: [2], posture: 'plantigrade', legLen: [0.76, 0.92], legThick: [0.28, 0.34], legSegs: 3, hindLeg: [1.1, 1.15], foreLeg: [0.86, 0.88], legTerm: ['paw'], snout: [0.3, 0.5], tail: 1, tailSegs: [4, 6], tailLen: [0.6, 0.95], tailThick: [0.12, 0.2], tailDroop: [-1.3, -1.05], tailCurl: [0.0, 0.12], ears: 0.9, earStyle: [0.7, 1], earSize: [1.5, 1.9], whiskers: 0.95, eyeStyle: [0, 0.15], eyeCount: [2], mouthStyle: [0, 0.055], covering: ['fur'], pattern: ['plain', 'mottle'], hue: [0.04, 0.1] },
  { id: 'ungulate', cluster: 'familiar', weight: 1.3, legThick: [0.32, 0.42], height: [1.0, 1.1], taper: [1.05, 1.1], eyeEl: [0.5, 0.65], girth: [0.45, 0.62], repeat: [4, 4], elong: [1.05, 1.15], neck: [0.44, 0.54], neckLinks: [4, 5], neckLift: [-0.32, -0.25], headSize: [0.55, 0.66], muzzle: [0.62, 0.72], muzzleDrop: [0.12, 0.22], legPairs: [2], posture: 'hooved', legAz: [4.66, 4.71], legYaw: 0, legLen: [1.45, 1.8], legTerm: ['hoof'], headShape: ['tapered', 'wedge'], headDome: [0.78, 0.92], snout: [0.55, 0.85], tail: 0.7, tailSegs: [2, 3], tailLen: [0.38, 0.6], tailThick: [0.14, 0.2], tailDroop: [-1.1, -0.95], tailAz: [1.85, 2.05], tailCurl: [-0.6, -0.5], horns: 0.55, hornAz: [1.3, 1.45], hornEl: [0.45, 0.6], ears: 0.97, earStyle: [0.33, 0.66], earAz: [0.5, 0.7], eyeStyle: [0, 0.1], eyeAz: [0.3, 0.6], mouthStyle: [0, 0.055], covering: ['fur'], pattern: ['plain', 'spots'], soberMarks: true, hue: [0.06, 0.11] },
  // a bear: the highest point the hump over its shoulders, the back falling away to a lower rump; a
  // broad skull and a muzzle held out level from it. (Level from rump to shoulders, with the muzzle
  // hung from the brow at a hound's droop, it was a tapir — a hippo, in a pink coat.)
  // (its muzzle tapers to the nose, and runs no longer than a dog's: an even tube ending in a round bulb was a hippo's)
  // (a barrel to a rump near the chest's girth, on four-link legs as thick at the wrist as a dog's at the elbow, the head
  // at the shoulders on a neck as thick as it, the muzzle short of a dog's: as a wedge sloping off steep withers to a
  // small rump, on long thin legs, the head held up on a waist of a neck with a dog's muzzle, it was a hyena, a capybara)
  { id: 'ursid', cluster: 'familiar', weight: 0.6, taper: [1.06, 1.09], rear: [-0.055, -0.04], eyeEl: [0.85, 0.98], girth: [0.54, 0.68], repeat: [4, 4], height: [1.0, 1.12], neck: [0.74, 0.82], neckLift: [-0.1, -0.04], neckLong: 0.9, headSize: [0.7, 0.82], muzzle: [0.62, 0.7], muzzleDrop: [0.12, 0.2], muzzleLong: 0.8, legPairs: [2], posture: 'plantigrade', legAz: [4.36, 4.5], legLen: [0.74, 0.86], legThick: [0.68, 0.82], legTaper: [0.88, 0.94], legCurl: [0.2, 0.28], legSegs: 4, legTerm: ['paw'], snout: [0.46, 0.53], stop: [0.9, 0.915], tail: 0.25, tailSegs: [1, 2], tailLen: [0.25, 0.4], tailThick: [0.26, 0.34], ears: 1, earStyle: [0.7, 1], earSize: [0.65, 0.85], whiskers: 0, headShape: ['broad'], headWide: [1.22, 1.32], headDome: [0.9, 0.98], eyeStyle: [0.22, 0.36], eyeSize: 0.75, mouthStyle: [0.07, 0.12], covering: ['fur'], pattern: ['plain', 'mottle'], hue: [0.06, 0.09], sat: [0.3, 0.55], light: [0.2, 0.38] }, // brown to near-black (a light coat on a redder hue was salmon pink)
  // (its head broader than its slim neck at the hinge of the jaws, wedging to the snout, the eye a third of the way
  // back: no wider than its neck, the eye at its tip, the front of a lizard was a newt's round end)
  { id: 'lizard', cluster: 'familiar', weight: 0.6, tailTaper: [0.76, 0.82], tailAz: [4.6, 4.8], tailCurl: [0.04, 0.08], tailDroop: [-1.52, -1.4], tailLen: [0.92, 1.12], tailSegs: [6, 6], tailThick: [0.5, 0.62], eyeT: [0.38, 0.5], head: 1, girth: [0.32, 0.46], repeat: [4, 6], height: [0.6, 0.8], elong: [1.2, 1.5], neck: [0.5, 0.58], taper: [0.97, 1.0], neckLift: [-0.24, -0.14], headSize: [0.8, 0.94], headWide: [1.08, 1.22], headDome: [0.66, 0.8], headLong: [1.3, 1.55], legPairs: [2], posture: 'sprawling', legLen: [0.58, 0.88], legAz: [3.66, 3.86], legTerm: ['claw'], headShape: ['flat', 'wedge'], snout: [0.4, 0.65], tail: 0.95, frill: 0.25, eyeStyle: [0.4, 0.6], mouthStyle: [0.07, 0.18], covering: ['scales'], pattern: ['bands', 'reticulate', 'mottle'], hue: [0.22, 0.42], sat: [0.5, 0.85] },
  { id: 'crocodilian', cluster: 'familiar', weight: 0.5, tailTaper: [0.78, 0.81], tailAz: [4.6, 4.8], tailCurl: [-0.05, -0.02], tailDroop: [-1.52, -1.4], tailLen: [1.6, 1.9], tailSegs: [6, 6], tailThick: [0.68, 0.8], tailStyle: [0.82, 0.97], eyeT: [0.02, 0.14], eyeEl: [0.45, 0.65], head: 1, girth: [0.4, 0.55], repeat: [5, 7], height: [0.66, 0.8], elong: [1.3, 1.6], taper: [0.95, 1.0], rear: [-0.012, 0.008], neck: [0.64, 0.72], neckLift: [0, 0.03], legPairs: [2], posture: 'sprawling', legLen: [0.5, 0.72], legThick: [0.44, 0.58], legAz: [3.55, 3.78], legTerm: ['claw'], headShape: ['flat'], headLinks: 4, headTaper: [0.75, 0.8], headSize: [0.6, 0.68], headWide: [1.15, 1.3], headDome: [0.58, 0.7], headCurve: [0.0, 0.04], mouthT: [0.3, 0.42], mouthEl: [1.2, 1.28], snout: [0.8, 1.0], tail: 1, eyeStyle: [0.4, 0.6], eyeAz: [0.62, 0.76], eyeSize: 1.35, mouthStyle: [0.14, 0.24], covering: ['scales'], pattern: ['mottle', 'mottle', 'plain'], patternScale: [3.5, 6], soberMarks: true, hue: [0.14, 0.28], sat: [0.24, 0.48], light: [0.3, 0.5] },
  // (its head a spade well wider than its neck, with an eye that reads: barely wider, with pinhead eyes, the front
  // of a snake was the blunt end of a worm)
  // (…and its head's own girth near the body's: headWide multiplies a girth drawn at the default 0.7–1.05 of the
  // body's, so a draw near 0.7 left a spade 0.9 the body's width and 1.1–1.25 its neck's — a hose's end)
  { id: 'serpent', cluster: 'familiar', weight: 0.6, tailTaper: [0.79, 0.84], tailAz: [4.71, 4.71], tailCurl: [0, 0.02], tailDroop: [-1.57, -1.53], tailThick: [0.86, 0.95], tailLen: [1.45, 1.8], tailSegs: [6, 6], rear: [-0.004, 0.004], taper: [0.985, 1.0], head: 1, girth: [0.22, 0.32], repeat: [17, 24], elong: [1.3, 1.5], headShape: ['wedge'], eyeSize: 1.35, headSize: [0.95, 1.05], headWide: [1.32, 1.5], headDome: [0.62, 0.74], headLong: [1.25, 1.5], headTaper: [0.74, 0.82], eyeT: [0.32, 0.46], eyeAz: [0.3, 0.45], eyeEl: [0.55, 0.75], wind: 0.9, legPairs: [0], tail: 1, eyeStyle: [0.4, 0.6], mouthStyle: [0.14, 0.24], covering: ['scales'], pattern: ['bands', 'stripes', 'reticulate'], hue: [0.1, 0.4], sat: [0.5, 0.85] },
  { id: 'anuran', cluster: 'familiar', weight: 0.6, head: 1, eyeEl: [0.2, 0.35], snout: [0, 0.05], headSize: [0.9, 1.05], headDome: [0.5, 0.68], headWide: [1.1, 1.35], headShape: ['broad', 'flat'], headLinks: 1, headLong: [0.62, 0.78], eyeT: [0.35, 0.5], girth: [0.5, 0.7], repeat: [2, 2], height: [0.62, 0.78], rear: [-0.22, -0.16], legPairs: [2], posture: 'sprawling', legLen: [0.5, 0.7], hindLeg: [1.5, 1.05], hindSegs: 4, foreLeg: [0.7, 0.78], legTerm: ['claw'], tail: 0.0, eyeStyle: [0, 0.2], eyeAz: [0.8, 1.05], eyeSize: 1.7, mouthStyle: [0.07, 0.12], covering: ['skin'], pattern: ['spots', 'mottle'], sheen: [0.55, 0.85], hue: [0.25, 0.45], sat: [0.5, 0.85] },
  { id: 'fish', cluster: 'familiar', weight: 0.7, eyeEl: [0.15, 0.35], tailAz: [4.71, 4.71], tailCurl: [-0.03, 0.02], tailDroop: [-1.57, -1.5], headShape: ['wedge'], headCurve: [-0.02, 0.02], headTaper: [0.58, 0.7], mouthEl: [1.38, 1.5], mouthSize: [0.55, 0.7], eyeSize: 1.5, pectoralT: [0.88, 0.98], headSize: [1.2, 1.4], headWide: [0.78, 0.92], headDome: [1.35, 1.7], girth: [0.36, 0.5], repeat: [8, 10], height: [1.6, 2.1], elong: [0.8, 0.95], taper: [1.12, 1.15], rear: [-0.012, 0.012], legPairs: [0], finStyle: [0.34, 0.56], dorsalT: [0.5, 0.64], dorsal: 1, pectoral: 1, anal: 0.85, pelvic: 0.9, pectoralAz: [3.55, 3.9], pectoralEl: [-1.0, -0.75], tail: 1, tailTerm: ['fin'], tailLen: [0.8, 1.0], tailThick: [0.44, 0.52], tailTaper: [0.72, 0.8], tailSegs: [2, 2], gills: 0.9, gillStyle: 0.1, gillAt: 'head', head: 1, headLinks: 3, eyeT: [0.32, 0.48], headLong: [0.75, 0.95], eyeStyle: [0, 0.2], eyeAz: [0.2, 0.4], mouthStyle: [0.07, 0.12], covering: ['scales'], pattern: ['plain', 'spots', 'stripes'], sheen: [0.35, 0.6], hue: [0.45, 0.65], sat: [0.4, 0.8] }, // deep and flattened side to side, the head running on from the body's depth, a slim stalk before the tail fin (a round tube read as an eel)
  // (its tail leaves the rump at the rump's own girth and narrows to the stock: at half of it, the body ended in a
  // blunt round butt with the tail fin pinned on behind by a thin rod)
  { id: 'shark', cluster: 'familiar', weight: 0.6, eyeEl: [0.15, 0.35], tailAz: [4.71, 4.71], tailCurl: [-0.03, 0.02], tailDroop: [-1.57, -1.5], headShape: ['tapered'], headCurve: [-0.02, 0.03], rear: [-0.012, 0.012], headWide: [0.82, 0.9], headDome: [0.7, 0.78], headTaper: [0.6, 0.64], headLong: [1.15, 1.45], eyeSize: 0.6, pectoralT: [0.86, 0.96], headSize: [1.35, 1.5], girth: [0.45, 0.62], repeat: [5, 7], height: [0.95, 1.2], elong: [1.4, 1.7], taper: [1.06, 1.13], legPairs: [0], finStyle: [0.64, 0.9], dorsalT: [0.66, 0.76], dorsal: 1, pectoral: 1, dorsal2: 0.85, pelvic: 0.6, tail: 1, tailTerm: ['fin'], tailLen: [0.44, 0.6], tailThick: [0.54, 0.62], tailSegs: [3, 4], gills: 0.95, gillStyle: 0.9, head: 1, headLinks: 4, mouthT: [0.3, 0.42], eyeT: [0.3, 0.45], mouthEl: [0.55, 0.75], eyeStyle: [0.1, 0.3], eyeAz: [0.2, 0.4], mouthStyle: [0.13, 0.24], covering: ['skin'], pattern: ['plain', 'gradient'], hue: [0.55, 0.62], sat: [0.2, 0.45] },
  // (a songbird's neck is lost in its feathers, near its head's girth, and its head is a big round one:
  // at half the head's girth the neck held it up like a ball on a stalk, and a third of its skulls were
  // drawn broad — a third wider than round and two-thirds as deep, a helmet on a stalk)
  { id: 'bird', cluster: 'familiar', weight: 1.3, elong: [1.25, 1.45], taper: [1.12, 1.2], legAz: [4.62, 4.71], legYaw: 0, girth: [0.32, 0.44], repeat: [2, 3], height: [1.0, 1.3], neck: [0.46, 0.54], neckLinks: [2, 2], neckLift: [-0.48, -0.38], headSize: [0.56, 0.66], headShape: ['round'], legPairs: [1], posture: 'digitigrade', legLen: [0.7, 1.0], legThick: [0.15, 0.21], legTerm: ['claw'], wings: 0.95, tail: 0.85, tailTerm: ['fin'], tailLen: [0.34, 0.48], tailDroop: [-1.5, -1.4], tailAz: [1.57, 1.57], tailSegs: [2, 2], rear: [-0.25, -0.17], crest: 0.45, eyeStyle: [0, 0.2], eyeEl: [0.3, 0.45], mouthStyle: [0.31, 0.372], covering: ['feathers'], pattern: ['bands', 'plain', 'spots'], hue: [0.05, 0.65], sat: [0.5, 0.9] },
  { id: 'raptor', cluster: 'familiar', weight: 1.2, elong: [0.78, 0.9], taper: [1.12, 1.15], legAz: [4.62, 4.71], legYaw: 0, girth: [0.44, 0.58], repeat: [4, 4], height: [0.92, 1.02], neck: [0.48, 0.55], neckLinks: [1, 1], neckLift: [-0.3, -0.2], headSize: [0.6, 0.68], legPairs: [1], posture: 'digitigrade', legLen: [0.66, 0.82], legThick: [0.42, 0.52], legTerm: ['claw'], legStyle: [0.7, 0.9], wings: 1, wingStyle: [0.7, 0.9], wingSegs: 3, tail: 1, tailTerm: ['fin'], tailLen: [0.3, 0.44], tailDroop: [-1.5, -1.4], tailAz: [1.57, 1.57], tailSegs: [2, 2], rear: [-0.3, -0.285], headShape: ['flat'], headWide: [1.0, 1.12], headDome: [0.8, 0.88], headLong: [0.75, 0.8], headTaper: [0.78, 0.84], mouthSize: [1.32, 1.46], eyeStyle: [0, 0.15], mouthStyle: [0.252, 0.285], eyeAz: [0.4, 0.52], eyeEl: [0.45, 0.6], eyeTilt: 0.5, covering: ['feathers'], pattern: ['bands', 'mottle'], sheen: [0.03, 0.1], hue: [0.05, 0.11], sat: [0.3, 0.6], light: [0.28, 0.5], soberMarks: true }, // stands tall on a short curved trunk, chest out, the head carried over the feet: a flat crown sloping to a deep hooked bill, a scowl, long wings down the back, stout taloned feet (leaning forward on a level body, round-headed, it was the songbird in brown)
  { id: 'crab', cluster: 'familiar', weight: 1.2, girth: [0.5, 0.62], repeat: [1, 1], height: [0.33, 0.4], elong: [0.78, 0.92], legPairs: [4], legSegs: 4, posture: 'sprawling', legLen: [0.56, 0.68], legThick: [0.34, 0.42], legTerm: ['claw'], claws: 1, head: 0, tail: 0.0, carapace: 0.95, stalkEyes: 1, stalkLen: [0.32, 0.42], eyeStyle: [0, 0.3], eyeAz: [0.42, 0.58], eyeEl: [1.05, 1.15], mouthStyle: [0.38, 0.49], mouthSize: [0.5, 0.6], covering: ['chitin'], pattern: ['mottle', 'reticulate', 'plain'], sheen: [0.3, 0.55], hue: [0.0, 0.1], sat: [0.5, 0.85], light: [0.26, 0.42] },
  { id: 'insectoid', cluster: 'familiar', weight: 1.2, tagmata: 'insect', carapace: 0.4, girth: [0.32, 0.44], repeat: [3, 3], height: [0.8, 0.92], elong: [0.75, 0.92], taper: [1.08, 1.15], thorax: [0.62, 0.74], thoraxLong: [1.15, 1.4], legPairs: [3], posture: 'sprawling', legLen: [0.85, 1.05], legThick: [0.26, 0.34], hindLeg: [1.25, 1.1], foreLeg: [0.85, 1.0], legTerm: ['claw'], headSize: [0.82, 0.98], headShape: ['round', 'broad'], antennae: 0.95, eyeStyle: [0.6, 0.8], eyeCount: [2], eyeAz: [0.2, 0.45], eyeEl: [0.5, 0.75], mouthStyle: [0.38, 0.49], covering: ['chitin'], pattern: ['bands', 'spots', 'plain', 'reticulate'], sheen: [0.6, 0.95], hue: [0.0, 0.6], sat: [0.5, 0.9] },
  { id: 'arachnid', cluster: 'familiar', weight: 0.9, tagmata: 'spider', girth: [0.42, 0.56], repeat: [1, 1], height: [0.85, 1.0], elong: [1.3, 1.7], thorax: [0.6, 0.7], thoraxLong: [1.1, 1.25], legPairs: [4], posture: 'sprawling', legLen: [1.4, 1.75], legThick: [0.22, 0.3], foreLeg: [1.1, 1.0], legTerm: ['claw'], eyeStyle: [0.2, 0.4], eyeCount: [6, 8], mouthStyle: [0.38, 0.49], covering: ['fur', 'chitin'], pattern: ['mottle', 'bands'], hue: [0.02, 0.09], sat: [0.3, 0.6] },
  // ape: a knuckle-walker. A broad chest reared up off narrow hips; long arms hung from the shoulders
  // (the widest part of it) to fists on the ground; short flexed hind legs; a head well under the
  // chest's width close on a short thick nape, with a brow, forward eyes and a muzzle set below them.
  // (With a skull as wide as the trunk, the arms rooted under the chest like forelegs and long hind
  // legs it was a hooded thumb on four posts — and the four in ten that drew a tail were not apes.)
  { id: 'primate', cluster: 'familiar', weight: 1.0, eyeAz: [0.7, 0.82], eyeEl: [1.08, 1.15], girth: [0.52, 0.6], repeat: [3, 3], height: [0.76, 0.84], taper: [1.14, 1.15], elong: [0.88, 0.96], rear: [-0.37, -0.34], headSize: [0.56, 0.62], muzzle: [0.6, 0.66], muzzleDrop: [0.46, 0.5], legPairs: [1], posture: 'upright', legLen: [0.78, 0.94], legThick: [0.38, 0.46], legTerm: ['foot'], arms: 1, armLen: [1.2, 1.3], armCurl: [-0.26, -0.22], armThick: [0.3, 0.36], armTaper: [0.8, 0.86], armAz: [4.66, 4.76], armEl: [-0.36, -0.32], armT: [0.84, 0.94], tail: 0, tailSegs: [3, 5], tailLen: [0.5, 0.8], tailThick: [0.14, 0.22], tailAz: [1.45, 1.7], tailDroop: [-1.0, -0.8], tailCurl: [-0.32, -0.18], ears: 1, earStyle: [0.7, 1], earAz: [0.08, 0.24], earSize: [0.5, 0.62], head: 1.0, headShape: ['domed'], headWide: [0.98, 1.08], headDome: [1.02, 1.14], snout: [0.0, 0.08], eyeStyle: [0, 0.15], mouthStyle: [0.07, 0.12], armSegs: 3, neck: [0.6, 0.68], neckLift: [0.42, 0.5], neckLong: 0.8, light: [0.2, 0.36], legSegs: 3, eyeSize: 0.8, covering: ['fur'], pattern: ['plain', 'mottle'], hue: [0.04, 0.1], sat: [0.3, 0.6] },
  // biped: an upright two-legged walker (theropod / kangaroo / humanoid). Long strong striding legs,
  // grasping arms, a heavy balancing tail, a proper head. Wide covering/mouth range so it spans a
  // furred kangaroo, a scaled raptor-thing, a feathered strider — a whole basin of two-legged forms.
  // a THEROPOD: a horizontal body balanced over two strong legs, a long tail held out behind to
  // counterweigh a big-jawed head on an S-curved neck, small arms (as an upright walker it read as a
  // blob — a cartoon dinosaur, a penguin)
  // The trunk is four links, deeper than it is wide and near twice as long as deep, running into a
  // tail as thick as the hips (on three round links it was a ball with a carrot stuck in it). The
  // skull is three links tapering gently to a blunt snout — a long flat-topped wedge half as deep as
  // it is long, the eyes high on its sides mid-way back, the mouth set back so its line runs along the
  // jaws — on a neck of three links (a stretched two-link head was a dome as big as the chest, its
  // back end swallowing the neck: a tadpole's head on a chick). The arms root on the front of the
  // chest under the neck and reach forward, three links ending in a clawed hand (aimed down from the
  // belly on four links they hung to the knees, a second shrivelled pair of legs); the legs keep
  // their girth to the ankle and drop straight under the hips (thin stilts planted in an A).
  { id: 'biped', cluster: 'familiar', weight: 1.0, legAz: [4.6, 4.71], girth: [0.34, 0.42], repeat: [4, 4], height: [1.3, 1.45], elong: [1.15, 1.3], taper: [0.96, 1.0], rear: [-0.08, -0.03], neck: [0.5, 0.58], neckLinks: [3, 3], neckLift: [-0.3, -0.22], legPairs: [1], posture: 'digitigrade', legLen: [1.75, 2.05], legThick: [0.62, 0.74], legTaper: [0.8, 0.87], legYaw: 0, legTerm: ['claw'], arms: 1, armLen: [0.32, 0.45], armThick: [0.2, 0.26], armT: [0.9, 0.98], armAz: [3.85, 4.1], armEl: [0.75, 0.95], armCurl: [0.15, 0.3], armSegs: 3, tail: 1.0, tailSegs: [6, 6], tailLen: [1.08, 1.22], tailThick: [0.86, 1.0], tailTaper: [0.76, 0.82], tailDroop: [-1.5, -1.38], tailCurl: [-0.06, 0.02], tailTerm: ['none'], head: 1.0, headSize: [0.74, 0.86], headShape: ['wedge'], headWide: [0.8, 0.92], headDome: [1.0, 1.12], headLong: [1.35, 1.6], headLinks: 3, headTaper: [0.76, 0.82], eyeT: [0.3, 0.45], eyeAz: [0.6, 0.8], eyeStyle: [0, 0.3], eyeEl: [0.2, 0.4], mouthT: [0.45, 0.6], mouthEl: [1.15, 1.25], mouthSize: [1.2, 1.4], mouthStyle: [0.13, 0.24], covering: ['scales', 'skin', 'feathers'], pattern: ['stripes', 'mottle', 'plain', 'bands'], soberMarks: true, hue: [0.04, 0.4], sat: [0.35, 0.65] },
  // weasel/otter: a long low body with an arched back (`rear` above zero bends the trunk down toward
  // the head; grow stands the hump mid-back), deeper at the chest than the loin, on four short stout
  // legs tucked under it; a small flat wedge of a head on a neck as thick as the skull, small round ears
  // low on its sides, dark bead eyes; a long thick tail tapering to a point. (It was a straight salami
  // on four thin posts, a hamster's block of a head on its front with no neck, a spike of a tail; then a
  // rat's whip of a tail, thinning ×0.8 a link, and a head narrower than its neck, framed by its chest.)
  { id: 'mustelid', cluster: 'familiar', weight: 0.5, girth: [0.28, 0.36], repeat: [7, 9], height: [0.88, 1.0], elong: [1.0, 1.15], taper: [1.03, 1.05], rear: [0.08, 0.105], neck: [0.94, 1.04], neckLinks: [3, 3], neckLift: [-0.42, -0.34], headSize: [0.94, 1.02], headWide: [0.9, 0.98], headDome: [0.64, 0.72], muzzle: [0.6, 0.64], muzzleDrop: [0.12, 0.2], snout: [0.47, 0.53], legPairs: [2], posture: 'plantigrade', legAz: [4.45, 4.62], legLen: [0.8, 0.95], legThick: [0.5, 0.62], legSegs: 3, legTerm: ['paw'], tail: 1, tailSegs: [5, 6], tailLen: [0.7, 0.85], tailThick: [0.44, 0.52], tailTaper: [0.91, 0.925], tailDroop: [-1.45, -1.25], tailCurl: [0.02, 0.07], ears: 1, earStyle: [0.7, 1], earSize: [0.4, 0.5], earAz: [0.4, 0.56], whiskers: 0.9, eyeStyle: [0.22, 0.36], eyeAz: [0.66, 0.84], eyeEl: [0.95, 1.08], mouthStyle: [0.07, 0.12], covering: ['fur'], pattern: ['plain', 'mottle'], hue: [0.05, 0.09], sat: [0.4, 0.65], light: [0.24, 0.42] },
  // turtle/tortoise: a high horn shell over a flat body, coming down to just above its underside; stout
  // column legs out from under the rim onto round stumps of feet; a small head, longer than it is wide,
  // tapering to a blunt beak; a short pointed tail. (A cap on a round animal: shoulder balls and a
  // belly hanging out under the rim, long legs on frog's toes, a leg-thick tail, a ball for a head.)
  { id: 'chelonian', cluster: 'familiar', weight: 1.0, tailSegs: [2, 2], tailThick: [0.14, 0.2], tailLen: [0.35, 0.5], tailTaper: [0.55, 0.65], girth: [0.6, 0.8], repeat: [1, 2], height: [0.5, 0.6], elong: [0.95, 1.15], neck: [0.26, 0.3], neckLinks: [2, 2], neckLift: [-0.2, -0.05], headSize: [0.38, 0.46], headShape: ['round'], headLinks: 2, headWide: [0.82, 0.92], headDome: [0.8, 0.9], headLong: [1.2, 1.4], headTaper: [0.74, 0.8], headCurve: [0.02, 0.06], eyeT: [0.38, 0.5], eyeAz: [0.36, 0.5], mouthEl: [1.28, 1.4], legPairs: [2], posture: 'sprawling', legLen: [0.26, 0.36], legThick: [0.4, 0.5], legTaper: [0.9, 0.96], legAz: [3.55, 3.8], legTerm: ['claw'], tail: 0.35, tailTerm: ['none'], carapace: 1, head: 1, eyeStyle: [0, 0.2], mouthStyle: [0.26, 0.37], covering: ['scales'], sheen: [0.1, 0.3], pattern: ['reticulate', 'mottle'], soberMarks: true, hue: [0.18, 0.35], sat: [0.35, 0.6] },
  // ostrich/emu: tall, heavy, two long stilt legs, a small beaked head, shaggy feathers (the neck is M24)
  // (its legs, and a bird's and a hawk's, stay in the fore-aft plane — legYaw 0 — feet under the hips:
  // bent toward each other at every joint, an emu stood knock-kneed on one crossed foot. Its eyes, and
  // a songbird's, are on the sides of its head, and an emu's on its crown behind the bill: looking
  // straight ahead from beside the bill, as wide as the skull there, they made an owl's face)
  { id: 'ratite', cluster: 'familiar', weight: 1.2, legAz: [4.62, 4.71], legYaw: 0, girth: [0.34, 0.5], repeat: [2, 3], height: [0.92, 1.08], elong: [1.15, 1.35], neck: [0.3, 0.38], neckLinks: [7, 8], neckLift: [-0.24, -0.2], headSize: [0.42, 0.5], headShape: ['tapered', 'wedge', 'round'], headDome: [0.8, 0.95], legPairs: [1], posture: 'upright', legLen: [2.05, 2.4], legThick: [0.3, 0.4], legTerm: ['claw'], tail: 0.9, tailTerm: ['none'], tailSegs: [1, 2], tailLen: [0.3, 0.5], tailThick: [0.24, 0.34], tailDroop: [-1.55, -1.3], tailCurl: [-0.3, -0.15], head: 0.5, eyeStyle: [0, 0.2], eyeEl: [0.25, 0.4], eyeT: [0.3, 0.45], mouthStyle: [0.34, 0.37], covering: ['feathers'], pattern: ['plain', 'mottle'], soberMarks: true, hue: [0.06, 0.12], sat: [0.3, 0.5] },
  // --- uncanny ---
  // a dragon: four legs and a pair of great wings (one in seven was wingless — a horned, banded horse)
  // (a dragon's and a wyvern's horns sweep back along the skull, and their hide is banded or mottled: in a
  // net of dark cells on tan, with two short horns standing up off the crown and its neck held upright,
  // the wyvern was a giraffe)
  { id: 'dragon', cluster: 'uncanny', weight: 0.9, eyeEl: [0.7, 0.85], muzzleDrop: [0.02, 0.1], snout: [0.5, 0.75], muzzle: [0.6, 0.68], headWide: [0.95, 1.1], headDome: [0.68, 0.8], hornAz: [1.0, 1.3], hornEl: [-1.4, -1.15], eyeTilt: 0.4, tailTaper: [0.78, 0.84], tailCurl: [-0.03, 0.03], tailSegs: [5, 6], tailThick: [0.5, 0.62], tailDroop: [-1.5, -1.3], taper: [1.05, 1.1], girth: [0.5, 0.66], repeat: [3, 4], elong: [1.15, 1.35], neck: [0.46, 0.54], neckLinks: [3, 3], neckLift: [-0.42, -0.34], headSize: [0.6, 0.75], legPairs: [2], posture: 'digitigrade', legLen: [0.9, 1.15], legThick: [0.5, 0.62], legTerm: ['claw'], wings: 1, wingSize: [1.5, 1.8], tail: 1, tailTerm: ['none', 'barb', 'club'], headShape: ['flat', 'wedge'], horns: 0.9, spines: 0.8, crest: 0.3, eyeStyle: [0.42, 0.58], mouthStyle: [0.14, 0.24], covering: ['scales', 'plates'], pattern: ['bands', 'mottle', 'gradient'], soberMarks: true, sheen: [0.35, 0.8], hue: [0.0, 0.95], sat: [0.5, 0.9] },
  { id: 'wyvern', cluster: 'uncanny', weight: 0.85, headShape: ['flat', 'wedge'], headWide: [0.86, 1.0], headDome: [0.72, 0.84], eyeEl: [0.7, 0.85], muzzleDrop: [0.02, 0.1], snout: [0.5, 0.75], muzzle: [0.6, 0.68], hornAz: [1.0, 1.3], hornEl: [-1.4, -1.15], eyeTilt: 0.4, tailTaper: [0.78, 0.84], tailSegs: [5, 6], tailThick: [0.5, 0.6], tailDroop: [-1.5, -1.3], rear: [-0.22, -0.15], girth: [0.42, 0.56], repeat: [3, 4], elong: [1.2, 1.5], neck: [0.44, 0.52], neckLinks: [3, 4], neckLift: [-0.2, -0.12], headSize: [0.62, 0.78], legPairs: [1], posture: 'digitigrade', legLen: [1.1, 1.4], legThick: [0.5, 0.64], legTerm: ['claw'], wings: 1, wingSize: [1.7, 2.0], tail: 0.95, tailTerm: ['barb'], horns: 0.8, spines: 0.6, eyeStyle: [0.42, 0.58], mouthStyle: [0.14, 0.24], covering: ['scales'], pattern: ['bands', 'mottle'], soberMarks: true, sheen: [0.3, 0.7], hue: [0.0, 0.95], sat: [0.5, 0.9] },
  // an octopus: a tall mantle over a crown of arms, thick where they leave it and drawn out to fine
  // tips; TWO eyes, low on the head just above the arms, with a bar of a pupil (one eye per arm — a
  // ring of eight glowing discs round the mantle — read as a googly-eyed egg on a spider's legs)
  { id: 'cephalopod', cluster: 'uncanny', weight: 1.2, symmetry: 'radial', radialCount: [8, 8], girth: [0.5, 0.78], height: [1.3, 1.65], repeat: [1, 1], eyeEl: [-0.22, -0.1], eyeSize: 2.1, eyeStyle: [0.42, 0.58], mouthStyle: [0.26, 0.37], covering: ['slime'], pattern: ['spots', 'ocelli', 'gradient'], sheen: [0.7, 1.0], hue: [0.6, 0.95], sat: [0.4, 0.85] },
  { id: 'horror', cluster: 'uncanny', weight: 1.0, symmetry: 'radial', radialCount: [5, 8], girth: [0.45, 0.75], repeat: [1, 1], height: [1.25, 1.6], eyeEl: [0.3, 0.55], eyeSize: 0.8, mouthSize: [1.3, 1.6], eyeStyle: [0.82, 1], mouthStyle: [0.63, 0.74], covering: ['skin', 'slime'], pattern: ['ocelli', 'mottle'], sheen: [0.4, 0.8], hue: [0.7, 1.0], sat: [0.3, 0.7], light: [0.24, 0.42] },
  // a slug: six links falling away from a round front to a pointed tail, its eyes on feelers as tall as it
  // is (on four or five links it was a pickle, round at both ends, its eyes on stubs)
  { id: 'slime', cluster: 'uncanny', weight: 0.7, girth: [0.42, 0.6], repeat: [6, 6], height: [0.5, 0.62], elong: [1.15, 1.3], rear: [-0.012, 0.004], taper: [1.17, 1.21], legPairs: [0], stalkEyes: 1, stalkLen: [0.62, 0.74], stalkSegs: 3, eyeEl: [0.6, 0.75], eyeAz: [1.22, 1.38], mouthStyle: [0.01, 0.05], mouthSize: [0.45, 0.55], tail: 0.0, head: 0.0, eyeStyle: [0.05, 0.25], covering: ['slime'], pattern: ['gradient', 'mottle'], sheen: [0.8, 1.0], hue: [0.25, 0.7], sat: [0.5, 0.9], light: [0.45, 0.7] },
  // (a single-node body shows its depth only as the z-stretch past the stride clamp's 1.4: elong 1.4 is
  // as deep as it is wide — at 1 an urchin's test was a fifth narrower front to back than across)
  // (one colour, mottled in its own hue: banded across it in a second, clashing one, a small round test was a
  // Christmas bauble, a billiard ball, steel-blue on one side and orange on the other)
  { id: 'urchin', cluster: 'uncanny', weight: 0.6, symmetry: 'radial', radialCount: [8, 12], girth: [0.45, 0.7], repeat: [1, 1], height: [0.6, 0.7], elong: [1.38, 1.42], eyeSize: 0.45, eyeEl: [-1.3, -1.15], eyeStyle: [0.22, 0.36], mouthStyle: [0.07, 0.12], covering: ['chitin'], pattern: ['mottle', 'plain'], soberMarks: true, hue: [0.6, 0.95], sat: [0.4, 0.8] },
  // a sea star: a flat disc and five plump arms tapering to round tips; no face on top — its small
  // eyes look down from the rim of the disc and its mouth is underneath (on four arms it was a throwing
  // star; a crown of eyes on the disc, with a maw and a feeding tube among them, a face pasted on it)
  { id: 'starfish', cluster: 'uncanny', weight: 0.6, symmetry: 'radial', radialCount: [5, 5], eyeEl: [-1.5, -1.42], eyeSize: 0.55, eyeStyle: [0.22, 0.36], mouthStyle: [0.07, 0.12], girth: [0.4, 0.6], repeat: [1, 1], height: [0.4, 0.6], covering: ['plates'], pattern: ['plain', 'mottle', 'spots'], soberMarks: true, hue: [0.0, 0.1], sat: [0.5, 0.85] },
  // griffin/manticore mishmash: a winged horned tailed quadruped wearing a spliced back sail + a clashing skin.
  // It stands on stout legs under its body (splayed like a lizard's, on thin shanks, it was a heavy trunk
  // on an A-frame of sticks), carries its tail clear of the ground, and wears its ruff round its head.
  // (a chimera's mouth is a jaw, fangs or a beak: an insect's mandibles on its soft head hung from the corners of
  // a dark box like two tusks — a muppet's mouth)
  { id: 'chimera', cluster: 'uncanny', weight: 0.9, girth: [0.45, 0.65], repeat: [3, 4], elong: [1.1, 1.4], taper: [1.04, 1.1], legThick: [0.5, 0.62], neck: [0.5, 0.6], neckLinks: [2, 3], neckLift: [-0.36, -0.26], headSize: [0.56, 0.7], headShape: ['wedge', 'tapered', 'blocky', 'round'], legPairs: [2], posture: 'digitigrade', legAz: [4.38, 4.56], legLen: [0.8, 1.1], legTerm: ['claw', 'foot', 'pincer'], wings: 1, dorsal: 0.85, pectoral: 0.6, flankFins: false, tail: 1, tailTerm: ['fin', 'claw', 'none'], wingSize: [1.3, 1.6], tailThick: [0.4, 0.54], tailTaper: [0.78, 0.86], tailDroop: [-1.57, -1.42], tailCurl: [0.02, 0.1], horns: 0.8, hornT: 0, hornAz: [0.85, 1.25], frill: 0.4, frillAt: 'head', spines: 0.4, eyeStyle: [0, 1], eyeCount: [2, 3], mouthStyle: [0.07, 0.37], covering: ['skin', 'scales', 'fur', 'feathers', 'chitin', 'plates'], pattern: ['stripes', 'bands', 'spots', 'ocelli', 'reticulate', 'gradient'], sheen: [0.2, 0.9], hue: [0, 1], sat: [0.5, 0.9] },
  // wrong-arthropod: a myriapod — a low flat chain of armoured rings, a pair of jointed legs to each,
  // a shield of a head with compound eyes, mandibles and long feelers, iridescent chitin. (A smooth
  // bottle with ten pegs under its middle, a rod of a tail and rivets down its back was a grub.)
  { id: 'arthro-alien', cluster: 'uncanny', weight: 1.0, girth: [0.27, 0.36], repeat: [6, 8], ringLegs: true, legPairs: [6, 7, 8], height: [0.56, 0.72], elong: [1.0, 1.25], taper: [0.99, 1.0], rear: [-0.012, 0.004], posture: 'sprawling', legLen: [0.78, 0.96], legThick: [0.3, 0.37], legTaper: [0.8, 0.9], legSegs: 4, legGrade: [1.3, 0.85], legAz: [3.6, 4.0], legTerm: ['claw'], head: 1, headSize: [0.84, 0.94], headShape: ['round'], headLinks: 1, headWide: [1.12, 1.26], headDome: [0.7, 0.82], tail: 0, antennae: 1, antennaAz: [0.45, 0.7], antennaEl: [0.9, 1.05], antennaLen: [0.8, 1.05], antennaSegs: 4, antennaCurl: [-0.08, -0.02], eyeStyle: [0.6, 0.85], eyeCount: [2], eyeAz: [0.25, 0.45], eyeEl: [0.4, 0.6], mouthStyle: [0.38, 0.49], covering: ['chitin'], pattern: ['plain', 'gradient', 'reticulate'], sheen: [0.6, 0.95], hue: [0.15, 0.7], sat: [0.6, 0.9] },
  // crystalline: angular rigid limbs, a spike ridge, glowing facet "eyes" (the core), hard plated/metallic gradient skin
  { id: 'crystalline', cluster: 'uncanny', weight: 0.5, girth: [0.46, 0.62], repeat: [3, 4], height: [0.85, 1.05], elong: [0.95, 1.15], taper: [1.0, 1.06], head: 1, headSize: [0.6, 0.72], headShape: ['blocky', 'wedge'], legPairs: [2], posture: 'upright', legLen: [0.62, 0.84], legThick: [0.5, 0.62], legTerm: ['claw'], spines: 1, spineCount: 5, spineSize: [1.25, 1.75], horns: 0.7, tail: 0.0, eyeStyle: [0.85, 1], eyeCount: [2], mouthStyle: [0.07, 0.12], covering: ['crystal'], pattern: ['gradient', 'plain'], sheen: [0.75, 1.0], hue: [0.5, 0.82], sat: [0.5, 0.85], light: [0.5, 0.68] }, // a beast of cut stone: faceted hide, a row of crystal shards down its back, lit from within
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
  if (symmetry === 'radial') return compileRadial(rng, seed, m, girth);
  return m.tagmata ? compileArthropod(rng, seed, m, girth) : compileBilateral(rng, seed, m, girth);
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
  // (a myriapod needs its five pairs: shattered to fewer in the wild tail, the plan is any other body)
  const ringed = !!m.ringLegs && lp >= 5;
  const slots = lp === 1 && m.rear ? [bipedSlot(m.rear[1])] : ringed ? ringSlots(lp) : legSlots(lp);
  for (let i = 0; i < lp; i++) {
    // a little slot jitter for individuality; the bauplan pass pulls it back toward the exact slot by
    // `coherence` (familiar ⇒ snapped, uncanny/wild ⇒ a touch looser — "coherent weird", M24)
    // (a myriapod's pairs stand a ring apart: the full jitter would walk a pair half-way to its neighbour)
    const t = clamp(slots[i] + range(rng, -0.06, 0.06) * (ringed ? 0.3 : 1), A.attachT);
    const scale = lp >= 2 ? (i === 0 ? m.hindLeg : i === lp - 1 ? m.foreLeg : undefined) : undefined;
    const g = leg(rng, t, girth, { term: legTerm, lenMul: m.legLen, thickMul: m.legThick, azimuth: m.legAz, posture: m.posture, curl: m.legCurl, taper: m.legTaper });
    if (scale) {
      g.length = clamp(g.length * scale[0], A.length);
      g.thickness = clamp(g.thickness * scale[1], A.thickness);
    }
    if (m.hindSegs && lp >= 2 && i === 0) g.segments = m.hindSegs;
    if (m.legSegs) g.segments = m.legSegs;
    if (m.legStyle) g.style = rg(rng, m.legStyle); // (no draw unless the morph sets it)
    if (m.legYaw !== undefined) g.curl = [g.curl[0], m.legYaw];
    if (m.legGrade && lp >= 2) g.length = clamp(g.length * (m.legGrade[0] + ((m.legGrade[1] - m.legGrade[0]) * i) / (lp - 1)), A.length);
    apps.push(g);
  }
  // a forward-reaching grasping arm pair (primate) near the shoulders
  if (chance(rng, m.arms ?? 0)) {
    apps.push(graspArm(rng, rg(rng, m.armT, [0.62, 0.78]), girth, m));
  }
  // (no draw unless the morph has claws: every other morphotype's genome stream stays as it was)
  if (m.claws && chance(rng, m.claws)) apps.push(cheliped(rng, girth));
  // wings, fins
  // wings root at the SHOULDERS — the front of the trunk (t → 1 is toward the head)
  if (chance(rng, m.wings ?? 0)) apps.push(wing(rng, range(rng, 0.68, 0.86), girth, m));
  if (chance(rng, m.dorsal ?? 0)) apps.push(dorsalFin(rng, rg(rng, m.dorsalT, [0.3, 0.6]), girth, m));
  // pectorals just behind the gill slits (the trunk runs rump 0 → head 1: at 0.25–0.45 they stuck
  // out beside the tail)
  if (chance(rng, m.pectoral ?? 0)) {
    const fin = pectoralFin(rng, rg(rng, m.pectoralT, [0.66, 0.8]), girth, m);
    if (m.flankFins !== false) apps.push(fin);
  }
  // (no draw unless the morph has one: every other morphotype's genome stream stays as it was)
  if (m.anal && chance(rng, m.anal)) apps.push(analFin(rng, range(rng, 0.14, 0.3), girth, m));
  if (m.pelvic && chance(rng, m.pelvic)) apps.push(pelvicFin(rng, range(rng, 0.42, 0.56), girth, m));
  if (m.dorsal2 && chance(rng, m.dorsal2)) apps.push({ ...dorsalFin(rng, range(rng, 0.12, 0.22), girth * 0.5, m) });
  // tail
  // a tail ends plain unless the morphotype says otherwise (a caudal FIN belongs to swimmers — the old
  // ['none','fin'] default gave bears, deer and apes a fish's tail fan)
  if (chance(rng, m.tail ?? 0.5)) apps.push(tail(rng, girth, pick(rng, m.tailTerm ?? (['none'] as const)), m));
  // dorsal spine ridge
  if (chance(rng, m.spines ?? 0)) {
    // (three along the back, as ever, unless the plan asks for its own row: no draw is added for the rest)
    const n = m.spineCount ?? 3;
    for (let i = 0; i < n; i++) {
      const s = spine(rng, m.spineCount ? 0.14 + (0.74 * i) / Math.max(1, n - 1) : 0.2 + i * 0.25, girth);
      if (m.spineSize) {
        const k = rg(rng, m.spineSize);
        s.length = clamp(s.length * k, A.length);
        s.thickness = clamp(s.thickness * k, A.thickness);
      }
      apps.push(s);
    }
  }
  // a collar / fanned frill near the head
  if (chance(rng, m.frill ?? 0)) apps.push(frill(rng, range(rng, 0.7, 0.95), girth));
  // gill rakes on the front body (fish / shark); a domed carapace over the mid-body (turtle / crab)
  if (chance(rng, m.gills ?? 0)) apps.push(gill(rng, range(rng, 0.82, 0.95), girth, m.gillStyle));
  if (chance(rng, m.carapace ?? 0)) apps.push(carapace(rng, girth));

  const body: SegmentGene = {
    size: [girth, girth * height, girth * elong],
    repeat: ringed ? lp : randint(rng, m.repeat[0], m.repeat[1]),
    taper: clamp(rg(rng, m.taper, [0.86, 1.0]), GENE_BOUNDS.segment.taper),
    curve: [m.rear ? rg(rng, m.rear) : range(rng, -0.05, 0.03), wind ? range(rng, 0.06, 0.16) * (chance(rng, 0.5) ? -1 : 1) : range(rng, -0.02, 0.02)],
    appendages: apps,
  };

  // ONE eye style per creature — real animals have a single eye type, not a mix (a clear win).
  const eyeStyle = clamp(rg(rng, m.eyeStyle, [0, 0.95]), [0, 1]);
  // a necked / muzzled body plan (the mammals, birds, reptiles) always grows its head — only the
  // generic plans may wear their face on the trunk
  if (chance(rng, m.neck || m.muzzle ? 1 : m.head ?? 0.9)) {
    const head = headSeg(rng, girth, m, eyeStyle);
    // (no draw: the frill already generated moves from the trunk to the back of the skull)
    if (m.frillAt === 'head') {
      const i = apps.findIndex((a) => a.kind === 'frill');
      if (i >= 0) head.appendages.push({ ...apps.splice(i, 1)[0], attachT: 0 });
    }
    // (no draw: on the trunk at 0.82–0.95 a fish's gill cover was drawn on its deepest link, half way down
    // the body — the 'head' two-thirds of the fish — with its pectorals beside it)
    if (m.gillAt === 'head') {
      for (const isPart of [(a: AppendageGene) => a.kind === 'gill', (a: AppendageGene) => a.kind === 'fin' && a.pair && a.attachAzimuth < 4.1]) {
        const i = apps.findIndex(isPart);
        if (i >= 0) head.appendages.push({ ...apps.splice(i, 1)[0], attachT: 0 });
      }
    }
    if (m.neck) {
      // a neck sets the head apart from the shoulders: a narrower section, lifting the head a touch
      const nf = rg(rng, m.neck);
      const links = randint(rng, ...(m.neckLinks ?? ([1, 1] as const)));
      const sb = GENERIC_SIZE;
      body.child = {
        size: [clamp(girth * nf, sb), clamp(girth * nf * 1.08, sb), clamp(girth * nf * (m.neckLong ?? 1.25), sb)],
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

// An ARTHROPOD is built of tagmata, not one trunk: an insect is a head, a thorax carrying all six legs,
// and a legless, segmented abdomen behind; a spider a cephalothorax carrying its eight legs, eyes and
// fangs, with a big round abdomen behind it on a narrow waist. Drawn as one trunk with the legs spread
// evenly down it, every insect read as a caterpillar and every spider as a tick. The ABDOMEN is the
// trunk here (segment 0) and the leg-bearing thorax its child: grow pinches a waist at each joint
// of a leg-bearing section past the trunk, and fans the legs out from it.
function compileArthropod(rng: Rng, seed: number, m: Morpho, girth: number): Genome {
  const spider = m.tagmata === 'spider';
  const sb = GENE_BOUNDS.segment.size;
  const height = rg(rng, m.height, [0.85, 1.0]);
  const elong = rg(rng, m.elong, [1.0, 1.2]);
  const eyeStyle = clamp(rg(rng, m.eyeStyle, [0, 0.95]), [0, 1]);
  const abdomen: SegmentGene = {
    size: [clamp(girth, sb), clamp(girth * height, sb), clamp(girth * elong, sb)],
    repeat: randint(rng, m.repeat[0], m.repeat[1]),
    taper: clamp(rg(rng, m.taper, [0.95, 1.05]), GENE_BOUNDS.segment.taper),
    curve: [clamp(rg(rng, m.rear, [-0.06, 0.02]), GENE_BOUNDS.segment.curvePitch), 0],
    appendages: [],
  };
  if (chance(rng, m.tail ?? 0)) abdomen.appendages.push(tail(rng, girth, pick(rng, m.tailTerm ?? (['none'] as const)), m));
  // a BEETLE: hard wing-cases (elytra) closed over the abdomen — the conforming shell, on this trunk
  if (chance(rng, m.carapace ?? 0)) abdomen.appendages.push(carapace(rng, girth));

  const tg = girth * rg(rng, m.thorax, [0.6, 0.72]);
  const apps: AppendageGene[] = [];
  const lp = pick(rng, m.legPairs ?? ([3] as const));
  const legTerm = pick(rng, m.legTerm ?? (['claw'] as const));
  const slots = legSlots(lp);
  for (let i = 0; i < lp; i++) {
    const g = leg(rng, clamp(slots[i] + range(rng, -0.04, 0.04), A.attachT), girth, { term: legTerm, lenMul: m.legLen, thickMul: m.legThick, azimuth: m.legAz, posture: m.posture });
    g.segments = 4; // a jointed arch: femur up to the knee, tibia and metatarsus down, the tarsus on the ground
    const scale = i === 0 ? m.hindLeg : i === lp - 1 ? m.foreLeg : undefined;
    if (scale) {
      g.length = clamp(g.length * scale[0], A.length);
      g.thickness = clamp(g.thickness * scale[1], A.thickness);
    }
    apps.push(g);
  }
  if (chance(rng, m.wings ?? 0)) apps.push(wing(rng, range(rng, 0.55, 0.75), tg));
  const thorax: SegmentGene = {
    size: [clamp(tg, sb), clamp(tg * range(rng, 0.8, 0.95), sb), clamp(tg * rg(rng, m.thoraxLong, [1.1, 1.3]), sb)],
    repeat: 1,
    taper: 1,
    curve: [0, 0],
    appendages: apps,
  };
  abdomen.child = thorax;
  if (spider) {
    // the cephalothorax is the head too: its eyes crowd the brow in rows, the fangs hang below the front
    const eyeCount = pick(rng, m.eyeCount ?? ([8] as const));
    for (let p = 0; p < Math.max(1, Math.round(eyeCount / 2)); p++) {
      const e = eyes(rng, 0.95, false, tg * (p === 0 ? 1.15 : 0.85), { style: [eyeStyle, eyeStyle], az: range(rng, 1.0, 1.1) - p * 0.12, el: [1.2 - p * 0.22, 1.3 - p * 0.22] });
      apps.push(e);
    }
    apps.push(mouth(rng, tg, m.mouthStyle));
  } else thorax.child = headSeg(rng, tg, m, eyeStyle);
  return scaffold(rng, seed, 'bilateral', 4, abdomen, m);
}

/** how far round from the front an octopus's eyes sit, each side (rad): on the sides of its head,
 *  looking out and a little forward */
const OCTOPUS_EYE_AZ = 0.85;
/** how far out along an octopus's arms their web reaches (a share of their length) */
const OCTOPUS_WEB = 0.3;

function compileRadial(rng: Rng, seed: number, m: Morpho, girth: number): Genome {
  const n = randint(rng, ...(m.radialCount ?? ([4, 8] as const)));
  const height = rg(rng, m.height, [0.7, 1.1]);
  // (an urchin wears a coat of spines instead of a ring of arms, a horror its own two rings of
  // tentacles; no other body's draws change)
  const own = m.id === 'urchin' ? urchinCoat(rng, girth, n) : m.id === 'horror' ? horrorArms(rng, girth, n) : null;
  const apps: AppendageGene[] = own ?? [arm(rng, girth, range(rng, 0.3, 0.6), m)];
  // a second ring (not a sea star's: its five arms are all of it — a ring of spines between them was
  // a pile of sticks on its disc)
  if (!own && m.id !== 'starfish' && chance(rng, 0.4)) apps.push(arm(rng, girth * 0.6, range(rng, 0.45, 0.75), m, true));
  // a crown of eyes (always — a face reads); an octopus's ring the mantle lower down, looking out; a
  // sea star's or an urchin's small and underneath, round the rim of its disc or its test (neither
  // has a face on top: a crown of eyes there, with a maw among them, was a face pasted on a star; on
  // an urchin, a fleshy ring of a mouth with teeth standing out of it made its top an open bowl)
  // (an octopus's are a pair, either side of the front of its head: see radialPair)
  const ring = eyes(rng, range(rng, 0.6, 0.95), false, girth, { style: m.eyeStyle, az: m.id === 'cephalopod' ? OCTOPUS_EYE_AZ : 1.5, el: m.eyeEl, size: m.eyeSize });
  if (m.id === 'cephalopod') ring.radialPair = true;
  apps.push(ring);
  // a central maw: elevation ≈ ±90° so grow's radial array collapses it onto the axis — on the crown,
  // or (an octopus's beak, a sea star's mouth) underneath, in the middle of its arms
  const mo = mouth(rng, girth, m.mouthStyle);
  // (an urchin's and a sea star's straight down, in the middle of the underside: tilted off it like the
  // octopus's beak, the urchin's round mouth showed from the side as a red band round its base)
  // (a crown maw straight up, in the middle: at 1.35 its drawn copy sat back on the crown, tilted 13° down
  // the egg's back — a hoop slipping off a hole cut in the shell)
  mo.attachElevation = m.id === 'starfish' || m.id === 'urchin' ? -1.52 : m.id === 'cephalopod' ? -1.35 : 1.52;
  if (m.mouthSize) mo.thickness = clamp(mo.thickness * rg(rng, m.mouthSize), A.thickness); // (no draw unless set)
  apps.push(mo);
  // A horror's eyes are a band right round it: the ring again, half a step round (copied, no draw). One to
  // an arm, five to eight small eyes a fifth of a turn apart, every camera saw two of them either side of
  // whatever stood between: a face, with a feeler hung between its eyes for a trunk.
  if (m.id === 'horror') apps.push({ ...ring, attachAzimuth: ring.attachAzimuth + Math.PI / n, curl: [ring.curl[0], ring.curl[1]] });

  const body: SegmentGene = {
    size: [girth, girth * height, girth * rg(rng, m.elong, [0.6, 0.95])],
    repeat: randint(rng, m.repeat[0], m.repeat[1]),
    // (clamped like the bilateral trunk: a wild draw can hand a radial body a morph's front-heavy taper)
    taper: clamp(rg(rng, m.taper, [0.8, 0.95]), GENE_BOUNDS.segment.taper),
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
    apps.push(eyes(rng, rg(rng, m.eyeT, [0.7, 0.98]), false, g, { style: [eyeStyle, eyeStyle], az: m.eyeAz ? rg(rng, m.eyeAz) : range(rng, 0.18, 0.5) + p * 0.3, stalk, el: m.eyeEl, size: m.eyeSize }));
    if (m.eyeTilt) apps[apps.length - 1].roll = m.eyeTilt; // (a constant: no draw)
  }
  const mouthGene = mouth(rng, g, m.mouthStyle); // every face has a mouth
  if (m.mouthT) mouthGene.attachT = rg(rng, m.mouthT); // (no draw unless the morph sets it)
  if (m.mouthEl) mouthGene.attachElevation = rg(rng, m.mouthEl);
  if (m.mouthSize) mouthGene.thickness = clamp(mouthGene.thickness * rg(rng, m.mouthSize), A.thickness);
  apps.push(mouthGene);
  if (chance(rng, m.horns ?? 0)) apps.push({ ...horns(rng, g, m), ...(m.hornT !== undefined ? { attachT: m.hornT } : {}) });
  if (chance(rng, m.ears ?? 0)) apps.push(ear(rng, g, m.earStyle));
  if (chance(rng, m.whiskers ?? 0)) apps.push(whisker(rng, g));
  if (chance(rng, m.crest ?? 0)) apps.push(crest(rng, g));
  if (chance(rng, m.antennae ?? 0)) apps.push(antenna(rng, g, m));
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
    size: [clamp(g * wide, sb), clamp(g * domed, sb), clamp(g * (rg(rng, m.headLong ?? arch.long) + snout * 1.5), sb)],
    // a snout adds a muzzle section (the draw is made whatever the morph pins, so no other gene moves)
    repeat: ((links: number) => m.headLinks ?? links)(snout > 0.5 ? 2 : randint(rng, arch.repeat[0], arch.repeat[1])),
    taper: clamp(rg(rng, m.headTaper ?? arch.taper) - (m.headTaper ? 0 : snout * 0.3), GENE_BOUNDS.segment.taper), // narrows toward the face/snout
    curve: [rg(rng, m.headCurve ?? arch.curve) - (m.headCurve ? 0 : snout * 0.12), 0], // a long muzzle / tapered skull droops a touch
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
    // (sized against more than the skull's girth: at true scale a mammal's eye, half sunk into the
    // skull, all but vanished — a lively face needs a readable eye)
    apps.push(eyes(rng, range(rng, 0.05, 0.22), false, g * 1.12, { style: [eyeStyle, eyeStyle], az: (m.eyeAz ? rg(rng, m.eyeAz) : range(rng, 0.45, 0.7)) + p * 0.3, el: m.eyeEl, size: m.eyeSize }));
    if (m.eyeTilt) apps[apps.length - 1].roll = m.eyeTilt; // (a constant: no draw)
  }
  const mouthGene = mouth(rng, mg * 1.05, m.mouthStyle);
  mouthGene.attachT = 1; // the muzzle carries the mouth
  apps.push(mouthGene);
  if (chance(rng, m.horns ?? 0)) apps.push({ ...horns(rng, g, m), attachT: range(rng, 0.0, 0.2) });
  if (chance(rng, m.ears ?? 0)) apps.push({ ...ear(rng, g * rg(rng, m.earSize, [1, 1]), m.earStyle, m.earAz), attachT: range(rng, 0.0, 0.2) });
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
    size: [clamp(g * wide, sb), clamp(g * domed, sb), clamp(g * (long ? (1.0 + snout * 0.5) * (m.muzzleLong ?? 1) : 0.85 + snout * 1.3), sb)],
    repeat: long ? 3 : 2,
    // a long muzzle narrows over its two links to well under half the skull at the nose (at √ratio
    // per link it stayed a blunt seal's snout)
    // …unless the skull has a STOP: its links then barely taper, and grow hangs them on the braincase's
    // front as a muzzle (see grow's headStop). (no draw unless the morph sets it)
    taper: long ? (m.stop ? rg(rng, m.stop) : clamp(ratio * 1.04, GENE_BOUNDS.segment.taper)) : ratio,
    curve: [clamp(long ? drop * 0.55 : drop - snout * 0.1, GENE_BOUNDS.segment.curvePitch), 0],
    appendages: apps,
  };
}

function faceOnBody(rng: Rng, apps: AppendageGene[], girth: number, m: Morpho, eyeStyle: number): void {
  const stalk = chance(rng, m.stalkEyes ?? 0);
  const e = eyes(rng, range(rng, 0.85, 0.98), false, girth, { style: [eyeStyle, eyeStyle], az: m.eyeAz ? rg(rng, m.eyeAz) : range(rng, 0.2, 0.5), stalk, el: m.eyeEl });
  if (stalk && m.stalkLen) e.length = clamp(e.length * rg(rng, m.stalkLen), A.length); // (no draw unless set)
  if (stalk && m.stalkSegs) e.segments = m.stalkSegs; // (the drawn count set aside: on two links a slug's feelers were stubs)
  apps.push(e);
  const mo = mouth(rng, girth, m.mouthStyle); // every face has a mouth
  if (m.mouthSize) mo.thickness = clamp(mo.thickness * rg(rng, m.mouthSize), A.thickness); // (no draw unless set)
  apps.push(mo);
}

function scaffold(rng: Rng, seed: number, symmetry: Symmetry, radialCount: number, body: SegmentGene, m: Morpho): Genome {
  // familiar ≈ fully canonical; uncanny a touch looser (still coherent — "coherent weird", M24)
  const coherence = clamp(rg(rng, m.coherence, m.cluster === 'uncanny' ? [0.8, 0.95] : [0.95, 1.0]), [0, 1]);
  const cov = covering(rng, m);
  // a rare vivid morph: rarer on a familiar animal (a magenta crocodile read as a toy), rarest on a pelt
  const exotic = rng() < (m.cluster !== 'familiar' ? 0.14 : cov.type === 'fur' ? 0.04 : 0.07);
  // …but a familiar pelt's rare morph is one a mammal has: melanistic (a black panther's) or
  // leucistic (a white bear's), in its own hue. (Any vivid hue, it was a hot-pink bear: a plush toy.)
  // The draws are as they were, only what they set is changed.
  const morph = exotic && m.cluster === 'familiar' && cov.type === 'fur';
  const pick = exotic ? rng() : rg(rng, m.hue, [0, 1]);
  const hueA = morph ? (m.hue ? (m.hue[0] + m.hue[1]) / 2 : 0.08) : pick;
  const satDraw = exotic ? range(rng, 0.7, 0.95) : rg(rng, m.sat, [0.32, 0.9]);
  const lightDraw = rg(rng, m.light, [0.3, 0.7]);
  // (at the gene's own bounds: a dark charcoal, a pale cream)
  const sat = morph ? (pick < 0.5 ? 0.12 : 0.14) : satDraw;
  const light = morph ? (pick < 0.5 ? 0.2 : 0.8) : lightDraw;
  // (a plan that asks for sober markings gets them, uncanny or not: a sea star's navy polka dots on
  // orange were paint drops, a dragon's purple bands on green bandages — and its rare vivid morph keeps
  // them too: an urchin of electric blue mottled in red was a toy)
  const hueB = markingHue(hueA, rng(), m.soberMarks ? 'fur' : cov.type, !m.soberMarks && ((exotic && !morph) || m.cluster === 'uncanny'));
  return { version: GENOME_VERSION, seed, symmetry, radialCount, coherence, covering: cov, palette: { hueA, hueB, sat, light }, body };
}

/**
 * The hue of a creature's markings, harmonised with its body colour. Real coats are a tabby's
 * darker-same-hue stripes or a leopard's near-black rosettes, almost never a beige cat with green
 * spots — so a pelt's markings stay KIN to the body hue (or a neutral umber), and only scales,
 * feathers and the alien coverings are let loose (a bird's flash of colour, a frog's warning
 * spots). `u` is the one draw a free hue would have cost, so the genome stream is unchanged.
 */
function markingHue(hueA: number, u: number, cover: CoveringType, wild: boolean): number {
  const wrap = (h: number) => ((h % 1) + 1) % 1;
  // A familiar animal's markings are mostly its own hue, darker or paler, or umber to near-black; a
  // contrasting colour is the exception — a warning (a poison frog's, a coral snake's) or a bird's
  // plumage. (Any hue a third to half of the time, and a complementary flash on top, made a green frog
  // with purple spots, a yellow snake banded in violet: toys.) Birds keep the most colour.
  // (an insect's or a spider's markings are mostly black, brown or its own hue too, a warning colour now and
  // then: free to be any hue every time, orange spiders wore teal blotches, green beetles mauve — mould)
  const free = wild ? 1 : cover === 'fur' ? 0 : cover === 'feathers' ? 0.4 : cover === 'scales' || cover === 'chitin' ? 0.2 : cover === 'skin' || cover === 'plates' ? 0.12 : 1;
  if (u < free) return wrap(u / free + hueA); // any hue
  const k = (u - free) / (1 - free); // 0..1
  const kin = cover === 'fur' ? 0.55 : 0.6;
  const flash = cover === 'fur' ? 0.55 : cover === 'feathers' ? 0.8 : 0.7; // pelts never wear a complementary flash
  if (k < kin) return wrap(hueA + (k / kin - 0.5) * 0.12); // kin: within ±0.06 of the body hue
  if (k < flash) return wrap(hueA + 0.5 + ((k - kin) / (flash - kin) - 0.5) * 0.08); // a complementary flash
  return 0.06 + ((k - flash) / (1 - flash)) * 0.045; // umber / near-black markings
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
  crystal: 0.8,
};

function covering(rng: Rng, m: Morpho): Genome['covering'] {
  const type = pick(rng, m.covering ?? (['skin'] as const));
  const pattern = pick(rng, m.pattern ?? (['plain', 'mottle'] as const));
  // pattern scale rides on body girth so the markings read at any size
  const patternScale = clamp(rg(rng, m.patternScale, [1.4, 6.8]), GENE_BOUNDS.covering.patternScale);
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
  // (a hooved leg always has its four links — thigh, shank, cannon, pastern: on three a deer sat low as a pig)
  hooved: { az: [4.18, 4.5], curl: [0.12, 0.28], segs: [4, 4], len: [1.0, 1.42], thick: [0.34, 0.48], term: 'hoof' },
  upright: { az: [4.2, 4.5], curl: [0.22, 0.4], segs: [3, 4], len: [0.94, 1.36], thick: [0.4, 0.56], term: 'foot' },
};

interface LegOpts {
  term?: Terminal;
  lenMul?: Rg;
  thickMul?: Rg;
  azimuth?: Rg;
  posture?: Posture;
  curl?: Rg;
  taper?: Rg;
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
    taper: rg(rng, o.taper, [0.7, 0.85]),
    curl: [clamp(rg(rng, o.curl ?? p.curl), A.curlPitch), range(rng, -0.06, 0.06)],
  });
}

// A forward-reaching grasping arm (primate): a jointed limb angled down-and-forward, clawed/grasping tip.
function graspArm(rng: Rng, attachT: number, girth: number, m?: Morpho): AppendageGene {
  return part('arm', 'hand', true, range(rng, 0, 0.3), {
    attachT,
    attachAzimuth: rg(rng, m?.armAz, [3.5, 3.95]), // out to the side and down
    attachElevation: rg(rng, m?.armEl, [0.25, 0.55]), // reaching forward
    // (the draw is made whatever the morph pins, so no other gene moves)
    segments: ((links: number) => m?.armSegs ?? links)(randint(rng, 3, 4)),
    length: clamp(girth * rg(rng, m?.armLen, [0.5, 0.72]), A.length),
    thickness: clamp(girth * rg(rng, m?.armThick, [0.18, 0.28]), A.thickness),
    taper: rg(rng, m?.armTaper, [0.7, 0.85]),
    curl: [rg(rng, m?.armCurl, [0.35, 0.55]), 0], // an elbow bend
  });
}

// A CHELIPED (a crab's claw arm): from the front corner of the shell it reaches out and forward, then
// bends in at each joint so the two big claws meet in front of the face; stout and barely tapering, so
// the claw at its tip — a swollen palm with a fixed and a hinged finger — is the biggest thing on it.
function cheliped(rng: Rng, girth: number): AppendageGene {
  return part('arm', 'pincer', true, range(rng, 0, 0.3), {
    attachT: range(rng, 0.9, 0.98),
    attachAzimuth: range(rng, 3.0, 3.15), // out to the side, held up a touch
    attachElevation: range(rng, 0.5, 0.7), // and forward
    segments: 4, // (a joint more to fold at: at the curl gene's bound, three left the claws splayed ahead)
    length: clamp(girth * range(rng, 0.26, 0.31), A.length),
    thickness: clamp(girth * range(rng, 0.44, 0.5), A.thickness), // (the claw's girth: the links are slimmer, see grow)
    taper: range(rng, 0.95, 1.0),
    // carried level; each joint folds it inward, bringing the claws in before the face, and the wrist
    // sets each one's fingers pointing in at the other's (viewer/claw wristQuat). (At the curl gene's
    // bound the claws came in so close that their fingers crossed in an X; folded less and longer, they
    // ran straight out ahead side by side: a lobster's, a scorpion's.)
    curl: [range(rng, -0.08, 0.02), range(rng, 0.52, 0.56)],
  });
}

function wing(rng: Rng, attachT: number, girth: number, m?: Morpho): AppendageGene {
  const g = part('wing', 'fin', true, range(rng, 0, 0.3), {
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
  // (the wing is drawn to the size of its tip node: no draw unless the morph sets it)
  if (m?.wingSize) g.thickness = clamp(g.thickness * rg(rng, m.wingSize), A.thickness);
  if (m?.wingStyle) g.style = rg(rng, m.wingStyle);
  if (m?.wingSegs) g.segments = m.wingSegs; // (a constant: no draw)
  return g;
}

function tail(rng: Rng, girth: number, terminal: Terminal, m?: Morpho): AppendageGene {
  const segs = m?.tailSegs ?? [3, 6];
  // (a tail FIN takes the morph's cut of fin: a fish's fork, a shark's long upper lobe)
  return part('tail', terminal, false, rg(rng, terminal === 'fin' ? m?.finStyle : m?.tailStyle, [0, 0.4]), {
    attachT: range(rng, 0.0, 0.06),
    attachAzimuth: rg(rng, m?.tailAz, [4.4, 5.0]),
    attachElevation: rg(rng, m?.tailDroop, [-1.25, -0.75]),
    segments: randint(rng, segs[0], segs[1]),
    length: clamp(girth * rg(rng, m?.tailLen, [0.7, 1.4]), A.length),
    thickness: clamp(girth * rg(rng, m?.tailThick, [0.18, 0.34]), A.thickness),
    taper: rg(rng, m?.tailTaper, [0.62, 0.82]),
    curl: [rg(rng, m?.tailCurl, [-0.1, 0.15]), range(rng, -0.05, 0.05)],
  });
}

function horns(rng: Rng, refGirth: number, m?: Morpho): AppendageGene {
  return part('horn', 'claw', true, range(rng, 0, 0.6), {
    attachAzimuth: rg(rng, m?.hornAz, [1.0, 1.7]),
    attachElevation: rg(rng, m?.hornEl, [0.3, 0.7]),
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

function antenna(rng: Rng, refGirth: number, m?: Morpho): AppendageGene {
  // (each draw is made whatever the morph pins, so no other gene moves)
  return part('antenna', 'none', true, 0.5, {
    attachT: range(rng, 0.85, 1.0),
    attachAzimuth: rg(rng, m?.antennaAz, [1.1, 1.5]),
    attachElevation: rg(rng, m?.antennaEl, [0.3, 0.6]),
    segments: ((links: number) => m?.antennaSegs ?? links)(randint(rng, 2, 3)),
    length: clamp(refGirth * rg(rng, m?.antennaLen, [0.6, 1.1]), A.length),
    thickness: clamp(refGirth * range(rng, 0.06, 0.12), A.thickness),
    taper: range(rng, 0.7, 0.9),
    curl: [rg(rng, m?.antennaCurl, [-0.3, 0.3]), 0],
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

function dorsalFin(rng: Rng, attachT: number, girth: number, m?: Morpho): AppendageGene {
  return part('fin', 'fin', false, rg(rng, m?.finStyle, [0, 0.3]), {
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

/** A fish's anal fin: one blade on the belly's midline toward the tail, the dorsal's counterpart. */
function analFin(rng: Rng, attachT: number, girth: number, m?: Morpho): AppendageGene {
  return part('fin', 'fin', false, rg(rng, m?.finStyle, [0, 0.3]), {
    attachT,
    attachAzimuth: Math.PI * 1.5,
    attachElevation: range(rng, -0.35, -0.15), // raked back toward the tail
    segments: 1,
    length: clamp(girth * range(rng, 0.14, 0.24), A.length),
    thickness: clamp(girth * range(rng, 0.34, 0.48), A.thickness),
    taper: range(rng, 0.9, 0.98),
    curl: [range(rng, -0.1, 0.1), 0],
  });
}

/** A pair of pelvic fins: small paddles under the belly, pointing down and a little out and back. */
function pelvicFin(rng: Rng, attachT: number, girth: number, m?: Morpho): AppendageGene {
  return part('fin', 'fin', true, rg(rng, m?.finStyle, [0, 0.3]), {
    attachT,
    attachAzimuth: range(rng, 4.3, 4.5),
    attachElevation: range(rng, -0.6, -0.4),
    segments: 1,
    length: clamp(girth * range(rng, 0.14, 0.24), A.length),
    thickness: clamp(girth * range(rng, 0.3, 0.42), A.thickness),
    taper: range(rng, 0.9, 0.98),
    curl: [0, 0],
  });
}

function pectoralFin(rng: Rng, attachT: number, girth: number, m?: Morpho): AppendageGene {
  return part('fin', 'fin', true, rg(rng, m?.finStyle, [0, 0.3]), {
    attachT,
    attachAzimuth: rg(rng, m?.pectoralAz, [3.25, 3.6]), // low on the flank
    attachElevation: rg(rng, m?.pectoralEl, [-0.38, -0.2]), // swept back
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
  el?: Rg; // forward tilt (rad): ~1.1 a cat's or an ape's forward gaze, ~0.6 a deer's lateral one
  stalk?: boolean; // ride a multi-segment eyestalk (crab / snail) — M23
  size?: number; // × the usual eye size
}
function eyes(rng: Rng, attachT: number, antennae: boolean, refGirth: number, o: EyeOpts = {}): AppendageGene {
  const stalk = o.stalk ?? false;
  return part('eyestalk', 'eye', true, rg(rng, o.style, [0, 1]), {
    attachT: clamp(attachT, A.attachT),
    attachAzimuth: o.az ?? range(rng, 0.7, 1.3),
    // eyes sit on the FRONT of the face and gaze forward (high elevation → the aim/normal points +Z),
    // not perched on top of the skull staring outward (the old "boob-head" + googly-derpy look).
    attachElevation: o.el ? rg(rng, o.el) : range(rng, stalk ? 0.4 : 0.85, stalk ? 0.8 : 1.2),
    segments: stalk || antennae ? randint(rng, 2, 3) : 1,
    length: clamp(refGirth * (stalk ? range(rng, 0.55, 0.9) : range(rng, 0.45, 0.7)), A.length),
    // eyes sized smaller relative to the head than before (they read as big cartoon eyes otherwise);
    // grow then pushes them proud of the body so they stay clearly visible even in capsule mode.
    thickness: clamp(Math.max(0.07, refGirth * (stalk ? range(rng, 0.14, 0.2) : range(rng, 0.18, 0.26)) * (o.size ?? 1)), A.thickness),
    taper: stalk ? range(rng, 0.92, 0.99) : range(rng, 0.85, 0.95),
    curl: [range(rng, -0.2, 0.1), 0],
  });
}

// --- M23 decorative parts (ears / whiskers / gills / crest / carapace) -------

// An ear: a short head stub; the feature renders pointed / leaf / round by style (§6.4).
function ear(rng: Rng, refGirth: number, style?: Rg, az?: Rg): AppendageGene {
  return part('ear', 'ear', true, rg(rng, style, [0, 0.33]), {
    attachT: range(rng, 0.6, 0.95),
    // on the upper corners of the skull, set apart (nearer the crown than this the pair met in the
    // middle, a tuft of two horns on a bald egg; an ape's sit on the sides of its head)
    attachAzimuth: rg(rng, az, [0.8, 1.15]),
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
function gill(rng: Rng, attachT: number, girth: number, style = 0.5): AppendageGene {
  return part('gill', 'gill', true, style, {
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
    // a sea star's arms: thick at the disc, tapering to blunt round tips, laid flat on the ground
    // (tapered harder, on four links they were drawn out to needle points: a throwing star)
    // (style kept out of the quill band: an urchin's spines are quills — see grow's QUILL_STYLE)
    return part('spine', 'none', false, range(rng, 0, 0.4), {
      attachT: clamp(attachT, A.attachT),
      attachAzimuth: range(rng, 0, 0.4),
      attachElevation: range(rng, -0.14, 0.02),
      segments: randint(rng, 3, 4),
      length: clamp(girth * range(rng, 0.62, 0.9), A.length),
      thickness: clamp(girth * range(rng, 0.38, 0.48), A.thickness),
      taper: range(rng, 0.76, 0.84),
      curl: [range(rng, -0.04, 0.06), range(rng, -0.05, 0.05)],
    });
  }
  const term: Terminal =
    // (an octopus's arms taper to bare tips — fin-tipped, they flew flat purple flags; the pick still
    // draws, so the stream is unchanged)
    m.id === 'urchin' ? 'claw' : m.id === 'cephalopod' ? pick(rng, ['none', 'none'] as const) : spiky ? pick(rng, ['claw', 'fin'] as const) : pick(rng, ['claw', 'fin', 'none'] as const);
  const long = m.id === 'cephalopod' || m.id === 'horror';
  const octo = m.id === 'cephalopod';
  // An octopus's arm is broad where it leaves the head — its neighbours' roots meet its own — and drawn
  // out to a fine tip, in more, shorter links that bend smoothly. (Four or five links tapering only to
  // half their root, a fifth of the mantle across, its arms were the even sticks of a spider's legs.)
  // (every draw below is made in the same order as before, octopus or not)
  const a = part(long ? 'tentacle' : 'spine', term, false, range(rng, 0, long ? 1 : QUILL_STYLE - 0.01), {
    attachT: clamp(attachT, A.attachT),
    attachAzimuth: range(rng, 0, 0.4),
    // (an octopus sprawls its arms out along the ground rather than standing on them like stilts:
    // they leave the mantle angled down, level off along the floor and lift a little at the tips)
    attachElevation: octo ? range(rng, -0.36, -0.24) : long ? range(rng, -0.6, -0.1) : range(rng, -0.3, 0.3),
    segments: spiky ? randint(rng, 1, 2) : long ? randint(rng, octo ? 5 : 3, octo ? 6 : 5) : randint(rng, 2, 4),
    // (the same reach over its more links)
    length: clamp(girth * range(rng, spiky ? 0.4 : long ? 0.9 : 0.6, spiky ? 0.8 : long ? 1.8 : 1.4) * (octo ? 0.78 : 1), A.length),
    thickness: clamp(girth * (octo ? range(rng, 0.42, 0.5) : range(rng, 0.12, 0.3)), A.thickness),
    taper: octo ? range(rng, 0.64, 0.7) : range(rng, 0.6, 0.88),
    // (curled up hard at every joint, the arms rose over the body like an umbrella blown inside out;
    // an octopus's arms also all sweep round the same way — a slow pinwheel; on more links, each bends
    // less, so the whole arm bends as much)
    curl: octo ? [range(rng, -0.14, -0.08) * 0.75, swirl(range(rng, -0.1, 0.1)) * 0.75] : [range(rng, -0.3, 0.4), range(rng, -0.1, 0.1)],
  });
  // an octopus's arms are joined by a web of skin near their roots (not its second ring of spines)
  if (octo && !spiky) a.web = OCTOPUS_WEB;
  return a;
}

/**
 * A horror's limbs: a ring of thick tentacles that leave the body low, sprawl outward and coil up
 * and round at their tips, and a second ring of thin feelers reaching up about its maw, curling out
 * over it — turned half a step from the ring below. (It had one ring of straight thin rods: a ball
 * on a camera stand, told from an octopus or an urchin only by its label.)
 */
function horrorArms(rng: Rng, girth: number, n: number): AppendageGene[] {
  const side = chance(rng, 0.5) ? 1 : -1; // they all coil round the same way
  return [
    part('tentacle', 'none', false, range(rng, 0, 1), {
      attachT: 0.3,
      attachAzimuth: range(rng, 0, 0.4),
      attachElevation: range(rng, -0.55, -0.35),
      segments: randint(rng, 5, 6),
      length: clamp(girth * range(rng, 0.7, 0.95), A.length),
      thickness: clamp(girth * range(rng, 0.3, 0.4), A.thickness),
      taper: range(rng, 0.66, 0.72), // (drawn out to lashes: tapering 0.74–0.8 a link they stayed thick to the tip, an octopus's arms)
      curl: [range(rng, -0.34, -0.24), side * range(rng, 0.14, 0.26)],
    }),
    // the upper ring: thin feelers round the crown, about the mouth (rooted halfway up the body, the
    // front one hung down across the face between the eyes, a pencil stuck in an egg)
    part('tentacle', 'none', false, range(rng, 0, 1), {
      attachT: 0.7,
      attachAzimuth: Math.PI / n + range(rng, 0, 0.1),
      attachElevation: range(rng, 0.74, 0.86),
      segments: randint(rng, 4, 5),
      length: clamp(girth * range(rng, 0.36, 0.5), A.length),
      thickness: clamp(girth * range(rng, 0.11, 0.15), A.thickness),
      taper: range(rng, 0.78, 0.86),
      // (rising, each link a little steeper: drooping 0.16–0.26 a link they reached out level over the face,
      // and seen from above the front one hung down it between the eyes — a trunk)
      curl: [range(rng, -0.2, -0.12), -side * range(rng, 0.02, 0.05)],
    }),
  ];
}

/**
 * An urchin's coat: rings of long straight spines standing out all over the test — the lowest
 * leaning down to the ground, the highest up round the crown — each ring turned half a step from the
 * one below, so its spines stand between the others'; and under it all a ring of short tube feet.
 * (It had one ring of jointed arms, curled under it as legs: a ball on a spider's legs, no urchin.)
 * Each gene is one spine; the body's radial count arrays it round the test.
 */
function urchinCoat(rng: Rng, girth: number, n: number): AppendageGene[] {
  const apps: AppendageGene[] = [];
  // the quills: long primaries in five rings, and shorter secondaries of the same shape in the rings
  // between them, turned half a step — so the ball bristles all over (sparse primaries alone left bare
  // ball showing between them, studded rather than spiny). Each is one smooth cone (QUILL_STYLE and up:
  // see viewer/quills); grown as skinned rods capped with claws they were nails in a pincushion.
  const rings = [-0.62, -0.22, 0.2, 0.62, 1.02];
  rings.forEach((el, i) => {
    apps.push(
      part('spine', 'claw', false, range(rng, QUILL_STYLE, 1), {
        attachT: 0.5,
        attachAzimuth: (i % 2) * (Math.PI / n) + range(rng, 0, 0.08),
        attachElevation: el + range(rng, -0.06, 0.06),
        segments: 2,
        // (the ones round the middle are the longest: the outline is a ball of spines, not a star)
        length: clamp(girth * range(rng, 1.5, 1.9) * (1 - 0.18 * Math.abs(el - 0.2)), A.length),
        thickness: clamp(girth * range(rng, 0.075, 0.1), A.thickness),
        taper: range(rng, 0.5, 0.6),
        curl: [0, 0],
      }),
    );
  });
  // (no tube feet: two links of the shortest limb a gene can grow, under the ball, they stood it on
  // stilts. Their draws are still made, so nothing after them moves.)
  range(rng, 0, 1);
  range(rng, 0, 0.3);
  range(rng, -1.25, -1.1);
  range(rng, 0.14, 0.2);
  range(rng, 0.06, 0.08);
  range(rng, 0.7, 0.8);
  [-0.42, 0, 0.41, 0.82].forEach((el, i) => {
    apps.push(
      part('spine', 'claw', false, range(rng, QUILL_STYLE, 1), {
        attachT: 0.5,
        attachAzimuth: ((i + 1) % 2) * (Math.PI / n) + range(rng, 0, 0.08),
        attachElevation: el + range(rng, -0.05, 0.05),
        segments: 2,
        length: clamp(girth * range(rng, 0.7, 0.95), A.length),
        thickness: clamp(girth * range(rng, 0.05, 0.065), A.thickness),
        taper: 0.55,
        curl: [0, 0],
      }),
    );
  });
  return apps;
}

/** a sideways curl of 0.1–0.24 rad per joint, to the side the draw fell on */
function swirl(d: number): number {
  return (d < 0 ? -1 : 1) * (0.1 + 1.4 * Math.abs(d));
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
