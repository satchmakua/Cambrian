/**
 * Development: grow(genome) → Phenotype (DESIGN §4.4).
 *
 * An L-system-flavored interpreter that walks the segment chain (honoring repeat,
 * taper, curve), spawns appendages (honoring symmetry + their own recursion), and
 * emits an explicit skeleton of nodes + edges. It is a *pure, deterministic*
 * function of the genome (Pillar 3) and guarantees the §4.4 invariants so any
 * skeleton always meshes without exploding (Pillar 2).
 *
 * The engine stays dependency-free — these few lines of vec/quat math keep three.js
 * out of the headless core so it runs in a plain Node test.
 */
import { mulberry32, unitHash } from './rng';
import { R_MIN, NODE_MAX, DEPTH_MAX, GENE_BOUNDS, clamp } from './bounds';
import type { Genome, SegmentGene, AppendageGene, Terminal, PartKind, Vec3 } from './genome';

export type Quat = [number, number, number, number]; // [x, y, z, w]

/** Fusiform bulge: how much fatter the middle of a body chain is than its ends. */
const BODY_BULGE = 0.35;
/** A SLITHERER's neck (a long trunk with no legs, fins, wings or arms anywhere, its head on its front): the
 *  trunk draws in over its last NECK_LINKS links to NECK_PINCH less than its girth there, so the head it
 *  carries stands out of it. (Running on at its own girth to the skull, a snake was a hose with its end
 *  pinched flat: its head 1.1–1.25 its neck's width.) */
const NECK_PINCH = 0.18;
const NECK_LINKS = 3;
const LIMBS = new Set(['leg', 'fin', 'wing', 'arm']);
function slithers(seg: SegmentGene): boolean {
  const limbless = (s: SegmentGene | undefined): boolean => !s || (!s.appendages.some((a) => LIMBS.has(a.kind)) && limbless(s.child));
  return !!seg.child && !seg.child.child && seg.repeat > 2 * NECK_LINKS && limbless(seg);
}
/** …and how fast a four-legged runner's deepening chest takes that swell away (per unit of taper
 *  above 1: at a taper of 1.1 a third of it is left). */
const RUNNER_TUCK = 6.5;

/** An arthropod's tagma joint (pedicel / petiole / neck): the waist's radius ×the thinner section's. */
const TAGMA_WAIST = 0.36;

/** A MYRIAPOD's trunk (see isRinged) is a chain of rings, one to each leg pair. How much fatter its
 *  middle rings are than its ends (a tenth: the fusiform swell of a mammal's barrel made it a grub)… */
const RING_SWELL = 0.1;
/** …the last ring's radius ×the rest's (the rump draws in over the rings before it)… */
const RING_RUMP = 0.7;
/** …a ring's length, rim to rim, ×its radius, and its hind and fore rims' radii ×its own (one round
 *  node to a ring, the body was a string of pearls)… */
const RING_PLATE = 0.6;
const RING_RIM: readonly [number, number] = [0.97, 0.88];
/** …the gap from one ring's fore rim to the next ring's hind rim ×a ring's radius, at a body's
 *  shortest and longest (set as close as any trunk's links, the rings ran together into one tube)… */
const RING_GAP: readonly [number, number] = [1.15, 1.35];
/** …the joint between two rings: its radius ×the smaller ring's, and how much wider than that it is
 *  across (a groove over the back and under the belly, a notch at the sides: pinched as deep from side to
 *  side, seen from above every ring was a round bead on a string)… */
const RING_JOINT = 0.56;
const RING_JOINT_WIDE = 1.6;
/** …how far its legs hold the belly off the ground (×the rings' mean radius)… */
const RING_CLEARANCE = 0.7;
/** …and how long a point each leg ends in, past its last node (×the same): the legs' own skin stops
 *  that far above the ground and the point — a hard spike the viewer draws — stands on it. */
const RING_POINT = 0.5;

/** An eye stalk's links, ×the radius the eye's gene gives them. */
const STALK_SLIM = 0.5;
/** A claw-bearing arm's links (a crab's cheliped), ×the radius its gene gives them: the claw at its end
 *  keeps the full girth, so the palm is the bulk of the limb. (All of one girth, arm and claw were one
 *  bloated sausage with fingers on its end.) */
export const CHELIPED_SLIM = 0.62;
/** An eye stalk rises at least this steeply (the Y of its unit direction: about 51° above level). */
const STALK_RISE = 0.78;

/** How far up the chest a fully raised neck roots (×the chest's half-depth above its axis). */
const NECK_ROOT = 0.4;

/** Trunk pitch per link (bending DOWN toward the head) at which a body's back begins to arch, and at
 *  which the arch is whole (no plan but the long-bodied weasels bends its trunk this way). */
const ARCH_FROM = 0.03;
const ARCH_FULL = 0.06;
/** …and the most an arched trunk tilts up off its hips (rad): past this a body is a hoop either way. */
const ARCH_TILT_MAX = 1.2;

/** A leg's root link (haunch, shoulder) is at most this ×the radius of the body it roots on. */
const HIP_MAX = 0.68;

/** A knuckle-walker's shoulder joint: how far out along the chest's flank it sits (×the chest's
 *  half-width), how far above the chest's axis (×its half-depth), and the deltoid's swell over the
 *  arm's own root radius. */
const SHOULDER_OUT = 0.8;
const SHOULDER_UP = 0.28;
const DELTOID = 1.22;
/** The most a knuckle-walker's arm is stretched or shortened to rest its hand on the ground. */
const ARM_REACH: [number, number] = [0.72, 1.4];
/** How far behind the middle of a reared trunk's pelvis its hip joints sit (×the pelvis's radius). */
const REARED_HIP_BACK = 0.34;

/** How far on toward the trunk's end a hooved leg roots (×the trunk's radius there): see hoofSet. */
const HOOF_SET = 0.55;
/** A GRAZER (a body on hooves: a deer, an antelope, a goat) carries its neck as one straight column from
 *  the top of its shoulders, lifted at its root by this many links' worth of the neck's bend, and grown
 *  straight from there (bent a little at every link, a neck of four or five rose from level out of the
 *  chest to plumb at the throat — a llama's J — and the head sat level on top of it)… */
const NECK_CARRY = 2.5;
/** …and hangs its head from the poll, the face down-and-forward (rad; held level on that neck, a deer
 *  looked over a wall like a llama, the round end of its muzzle facing the camera) */
const HEAD_BOW = 0.5;
/** …and a hooved foreleg's cannon drops plumb from its knee: the wrist's forward fold (−0.32) is a paw's
 *  pastern, and on a leg whose third link is the cannon it slanted the whole lower leg 25° forward */
const HOOF_KNEE = 0.12;

/** Minimum grown radius for an eye bulb (bu) — the face must always read (M19/M24). */
const EYE_R_MIN = 0.06;
/** A SPIDER's eyes — a face on its CEPHALOTHORAX, a body section that carries legs too (see ensureFace). Each
 *  pair's place on the front of the carapace, [x, y] on the unit sphere seen down +Z (x out to the side, y up),
 *  and its radius ×the head's girth: the anterior median pair big and forward either side of the midline (at
 *  least EYE_R_MIN), the anterior laterals out and up from them, the posterior medians and laterals a row above
 *  — beads, all clear of the first pair of legs, which root on the carapace's front corners. (Every pair at one
 *  height, a twelfth of a radian round from the last and each as big as a mammal's eye, each side's three or
 *  four eyes ran together into one black blot.) */
export const OCELLI: readonly (readonly [number, number, number])[] = [
  [0.27, 0.32, 0.24], // anterior median: the big front pair, a clypeus' height over the chelicerae
  [0.53, 0.53, 0.14], // anterior lateral: out and up from them, clear of the first legs' roots
  [0.2, 0.7, 0.14], // posterior median: a row above
  [0.44, 0.81, 0.14], // posterior lateral: up on the brow
];
/** Seen from above, each link of a spider's leg past the femur sweeps on round toward its own end of the
 *  body by this much (rad): the front pairs' feet reach forward, the hind pairs' back. (Run straight out
 *  in one vertical plane, evenly fanned, its eight legs from above were the spokes of a compass rose.) */
const SPIDER_SWEEP = 0.16;
/** A plain tail whose style gene is at or over this is a SCULLING tail (a crocodile's): deep, and
 *  flattened side to side toward its tip — the blade it swims with. Every other tail is round.
 *  (The bands of a plain tail's style gene: under BRUSH_STYLE a tapering rod, from there up to here a
 *  brush, from here a sculling blade — one cut each, as an eye's or a fin's style has.) */
export const SCULL_STYLE = 0.8;
/** …how much narrower than its link's radius the blade is at the tip, and how much deeper at its
 *  deepest (three-fifths of the way down) */
const SCULL_PINCH = 0.4;
const SCULL_DEPTH = 0.35;

/** whether an appendage gene (or a grown node's part) is a sculling tail */
export function isScullingTail(part: { kind: string; style: number } | undefined, terminal: Terminal | undefined): boolean {
  return part?.kind === 'tail' && (terminal ?? 'none') === 'none' && part.style >= SCULL_STYLE;
}

/**
 * A STOP — the step down from a mammal's forehead to its muzzle. A head chain tapers by one ratio
 * from link to link, so however its genes were set a long-muzzled skull was a single cone from the
 * ears to the nose (a bull terrier's, or a rat's). A head of three or more links that barely tapers
 * (a ratio past STOP_FROM, wholly by STOP_FULL) is instead a braincase with a muzzle hung on its
 * front: the links past the first are a muzzle of STOP_MUZZLE the chain's girth, narrowing to the nose
 * (by STOP_TAPER more of the chain's ratio at each link), set close against the braincase (STOP_STRIDE
 * of the usual stride) and low on it, toward the line of the jaw (STOP_LOW of the difference in their
 * depths) — so the brow stands up behind the bridge of the nose. Only a domed skull carried on a neck
 * has one: a crocodile's long flat head barely tapers either, and is all jaw — there is no brow on
 * it to step down from (see headStop).
 */
const STOP_FROM = 0.86;
const STOP_FULL = 0.9;
/** …and the skull's depth against its width below which there is none, and from which it is whole
 *  (a dog's skull is 0.7 and more as deep as wide; a crocodile's 0.6 and less) */
const STOP_FLAT = 0.6;
const STOP_DOMED = 0.68;
const STOP_MUZZLE = 0.66;
/** …narrowing to this share of its girth at the nose (whatever the chain's own ratio: by two more of
 *  that ratio a link, a dog's muzzle — its chain tapering 0.94 — barely narrowed, a hose half the skull's
 *  width ending in the bulb of its nose, a sock puppet's) */
const STOP_NOSE = 0.72;
/** …and the bridge of its nose held straight as it narrows: each link ahead raised by this share of
 *  what it gives up in girth */
const NOSE_RISE = 0.85;

/** The share of a head chain's girth its link `i` carries, of `links` past the braincase, with `stop`
 *  of a stop: the braincase whole; the muzzle STOP_MUZZLE of it at the stop, narrowing to STOP_NOSE of
 *  that at the nose. */
export function muzzleShare(i: number, links: number, stop: number): number {
  if (i <= 0 || stop <= 0) return 1;
  const t = links > 1 ? Math.min(1, (i - 1) / (links - 1)) : 0;
  return 1 - stop * (1 - STOP_MUZZLE * (1 - (1 - STOP_NOSE) * t));
}
const STOP_STRIDE = 0.62;
const STOP_LOW = 0.55;

/** How much of a stop a head section has, `depth` sections out from the trunk: 0 a plain tapering
 *  chain … 1 a braincase and a muzzle. */
export function headStop(seg: SegmentGene, depth: number): number {
  if (depth < 2 || seg.repeat < 3) return 0;
  const t = clamp((seg.taper - STOP_FROM) / (STOP_FULL - STOP_FROM), [0, 1]);
  // …and only on a skull deep enough to have a brow to step down from: a crocodile's — half as deep
  // as it is wide, and carried on a neck of its own — is all jaw however little it tapers
  const d = clamp((seg.size[1] / seg.size[0] - STOP_FLAT) / (STOP_DOMED - STOP_FLAT), [0, 1]);
  return t * t * (3 - 2 * t) * d * d * (3 - 2 * d);
}

/**
 * How far a node reaches along each world axis: its radius, or — for a SHAPED node (an ellipsoid:
 * a flat disc, a sole, a shell, a deep fish) — the extent of that ellipsoid as it is turned. (Taken
 * as a ball of the node's radius, a sea star's flat disc, a slug's sole and a crab's shell reached
 * below what is drawn: the ground was set under nothing, and they floated.)
 */
export function nodeReach(n: { radius: number; scale?: Vec3; quat: readonly number[] }): Vec3 {
  if (!n.scale) return [n.radius, n.radius, n.radius];
  const [x, y, z, w] = n.quat;
  // rotation matrix rows (unit quaternion)
  const R = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  const s = n.scale;
  return [0, 1, 2].map((a) => n.radius * Math.hypot(R[a][0] * s[0], R[a][1] * s[1], R[a][2] * s[2])) as Vec3;
}

/** A spine part whose style gene is at or past this is a QUILL (an urchin's): one smooth cone from root
 *  to point, kept out of the skin and drawn whole (viewer/quills). Every other spine is drawn in 0..0.4. */
export const QUILL_STYLE = 0.9;
/** whether a part (a gene or a grown node's) is a quill */
export function isQuill(part: { kind: string; style: number } | undefined): boolean {
  return part?.kind === 'spine' && part.style >= QUILL_STYLE;
}

/** A plain tail whose style gene is at or over this — and under SCULL_STYLE — is a BRUSH (a fox's, a wolf's). */
export const BRUSH_STYLE = 0.6;

/** whether an appendage gene (or a grown node's part) is a brush */
export function isBrushTail(part: { kind: string; style: number } | undefined, terminal: Terminal | undefined): boolean {
  return part?.kind === 'tail' && (terminal ?? 'none') === 'none' && part.style >= BRUSH_STYLE && part.style < SCULL_STYLE;
}
/** How far toward the top of the croup a brush is set (added to the upward part of its aim). */
const BRUSH_SEAT = 1.1;
/** how far back (the aim's −z) a horn's root is seated, however far back the horn is swept */
export const HORN_SEAT_BACK = 0.4;

/**
 * A brush's girth along its length (0 the root … 1 the tip), × the tail's own tapering radius: slim
 * where it leaves the croup, fullest just past half way, drawn to a point. (A fox's tail grown as a
 * plain rod — the same girth from root to a round end — was a sausage pinned to its rump.)
 */
export function brushProfile(t: number): number {
  const u = clamp(t, [0, 1]);
  return (0.55 + 0.8 * Math.sin(Math.PI * Math.pow(u, 1.15))) * (1 - 0.6 * Math.pow(u, 6));
}

export interface BodyNode {
  pos: Vec3;
  quat: Quat; // orientation; the node's local forward is +Z
  radius: number; // always ≥ R_MIN
  scale?: Vec3; // local-frame ellipsoid multipliers on `radius` (width/height/length); round if absent
  kind: 'spine' | 'limb' | 'terminal';
  terminal?: Terminal;
  part?: { kind: PartKind; style: number; web?: number }; // which genome part grew this node (for render variants; `web`: see AppendageGene)
  segment?: number; // spine nodes: which body section (0 = the trunk, 1 = the next child, …)
}

export interface Phenotype {
  nodes: BodyNode[];
  edges: [number, number][]; // a single connected tree: edges.length === nodes.length - 1
  bounds: { min: Vec3; max: Vec3 };
  genomeRef: Genome;
}

export function grow(genome: Genome): Phenotype {
  // M24: the bauplan pass pulls limbs onto a canonical layout + guarantees the face before building,
  // so every grown creature reads as a real body plan. The raw genome is kept as genomeRef (share/seed).
  const dev = developBauplan(genome);
  const rng = mulberry32(dev.seed);
  const nodes: BodyNode[] = [];
  const edges: [number, number][] = [];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  function addNode(pos: Vec3, quat: Quat, radius: number, kind: BodyNode['kind'], terminal?: Terminal): number {
    const r = Math.max(R_MIN, radius);
    nodes.push({ pos, quat, radius: r, kind, terminal });
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], pos[a] - r);
      max[a] = Math.max(max[a], pos[a] + r);
    }
    return nodes.length - 1;
  }
  const atCap = () => nodes.length >= NODE_MAX;
  let legPairsHere = 0; // leg pairs on the segment currently growing (hexapods+ get arthropod legs)
  let legGenesHere: AppendageGene[] = []; // …and their genes (a jumper's hind legs outreach its fore)
  let tagmaHere = false; // …and whether that segment is an arthropod's thorax (see isTagma)
  let ocelliHere = false; // …and whether its eyes are a spider's: a section past the trunk that carries legs (OCELLI)
  let sprawlHere = false; // …and whether its legs sprawl (decided once for them all — see below)
  let ringedHere = false; // …and whether it is a myriapod's trunk of rings (see isRinged)
  let ringFloorHere = 0; // …and the ground its legs then reach down to
  let ringPoint = 0; // …and the length of the points they stand on (see RING_POINT)
  /** a body under a horn SHELL (a tortoise's: a carapace over a trunk not wearing an arthropod's chitin) */
  const shelled = dev.symmetry === 'bilateral' && genome.covering.type !== 'chitin' && dev.body.appendages.some((a) => a.terminal === 'carapace');
  /** a body that walks on its arms as well as its legs (an ape): its trunk carries a pair of hand-tipped arms */
  const armWalker = dev.symmetry === 'bilateral' && dev.body.appendages.some((a) => a.kind === 'arm' && a.terminal === 'hand' && a.pair);
  /** a body that stands on hooves (a deer): its neck is a straight column and its head bows (NECK_CARRY) */
  const grazer = dev.symmetry === 'bilateral' && dev.body.appendages.some((a) => a.kind === 'leg' && a.terminal === 'hoof');

  growSegment(dev.body, [0, 0, 0], [0, 0, 0, 1], 0, -1, null);

  if (nodes.length === 0) addNode([0, 0, 0], [0, 0, 0, 1], R_MIN, 'spine'); // never empty

  const groundY = levelFeet(); // drop every foot to a common ground level (the creature stands)
  if (groundY !== null) groundTails(groundY); // …and no tail reaches below it
  else if (lyingDown()) {
    // (a legless body — a snake — lies on its belly, and its tail on the same ground: see groundTails)
    let belly = Infinity;
    for (const n of nodes) if (n.kind === 'spine') belly = Math.min(belly, n.pos[1] - nodeReach(n)[1]);
    if (Number.isFinite(belly)) groundTails(belly);
  }
  recomputeBounds();
  if (ringPoint > 0 && groundY !== null) min[1] = Math.min(min[1], groundY - ringPoint); // the ground is under the legs' points

  return { nodes, edges, bounds: { min, max }, genomeRef: genome };

  // --- recursive growth -------------------------------------------------------

  function growSegment(seg: SegmentGene, startPos: Vec3, startQuat: Quat, depth: number, parentIdx: number, parentSeg: SegmentGene | null): void {
    // Body thickness is the cross-section (size x,y); size z stretches the segment
    // forward. The stride is kept near the radius so consecutive capsules overlap into
    // a continuous mass, and a fusiform profile makes the torso bulge in the middle —
    // so it reads as a body, not beads on a stick.
    const girth = (seg.size[0] + seg.size[1]) / 2;
    const rawElong = seg.size[2] / Math.max(girth, 0.001);
    const elong = Math.min(1.4, Math.max(0.75, rawElong));
    // The girth above averages width (x) and height (y) into one radius, so a broad or a domed skull
    // would render as the same round ball. Keep that anisotropy as a per-node ellipsoid SCALE (about
    // the mean, so volume/union are preserved and the scalar radius is untouched): a wide flat slab, a
    // tall narrow dome, a long wedge now read as different heads in capsule mode. z stays 1 — segment
    // length is already carried by `elong` (the chain stride), so scaling z too would double-count.
    const csx = Math.min(1.7, Math.max(0.6, seg.size[0] / Math.max(girth, 1e-3)));
    const csy = Math.min(1.7, Math.max(0.6, seg.size[1] / Math.max(girth, 1e-3)));
    // The stride clamp above caps how much length the chain can express (it protects body continuity —
    // spheres must keep overlapping). A long snout (croc, ungulate, tapered) asks for far more than
    // 1.4, and that excess was simply discarded, so every muzzle came out stubby. Recover it as a
    // z-stretch on the node ellipsoid: the stride — and so continuity — is untouched, but the segment
    // finally reads as long as the genome asked. Unclamped segments get 1 (no change).
    const csz = Math.min(1.9, Math.max(0.7, rawElong / elong));
    const segScale: Vec3 | undefined =
      Math.abs(csx - 1) > 0.02 || Math.abs(csy - 1) > 0.02 || Math.abs(csz - 1) > 0.02
        ? [csx, csy, csz]
        : undefined;
    const spine: number[] = [];
    let pos = startPos;
    let quat = startQuat;
    let prev = parentIdx;
    // A NECK leaves the body from the top of the shoulders, not out of the middle of the chest's
    // front: begun on the trunk's axis it had the whole depth of the chest to climb before the head
    // it carries could clear the back, and a raised neck still held its head level with the withers
    // (every necked animal looked as if it were stretching forward to sniff something). The more a
    // neck lifts, the higher on the chest it roots.
    if (depth > 0 && seg.child && parentIdx >= 0 && seg.curve[0] < 0 && dev.symmetry === 'bilateral' && seg.appendages.length === 0) {
      const P = nodes[parentIdx];
      const up = qRotate([0, 1, 0], startQuat);
      const rise = NECK_ROOT * P.radius * (P.scale?.[1] ?? 1) * clamp(-seg.curve[0] / 0.3, [0, 1]);
      pos = [pos[0] + up[0] * rise, pos[1] + up[1] * rise, pos[2] + up[2] * rise];
    }
    // (a grazer's neck: lifted once at its root, then straight — see NECK_CARRY)
    let linkPitch = seg.curve[0];
    if (grazer && depth > 0 && seg.child && parentIdx >= 0 && seg.curve[0] < 0 && seg.appendages.length === 0) {
      quat = qMul(quat, qFromEuler(seg.curve[0] * NECK_CARRY, 0));
      linkPitch = 0;
    }
    // An ARCHED back: a trunk whose links bend DOWN toward the head (a weasel's, a ferret's) starts
    // tilted up off its hips by half its whole bend, so the hump stands mid-back with hips and
    // shoulders level under it. (Begun level, all the bend ran one way — the rump was the highest
    // point and the chest ploughed into the ground.) By degrees over a band of pitch, so a bend
    // that drifts across the line never snaps the body from one carriage to the other.
    if (depth === 0 && dev.symmetry === 'bilateral' && seg.curve[0] > ARCH_FROM) {
      const u = clamp((seg.curve[0] - ARCH_FROM) / (ARCH_FULL - ARCH_FROM), [0, 1]);
      quat = qMul(quat, qFromAxisAngle([1, 0, 0], -Math.min(ARCH_TILT_MAX, u * u * (3 - 2 * u) * seg.curve[0] * seg.repeat * 0.5)));
    }
    // Head carriage: the last segment of the chain (the head) is held near level whatever the neck
    // does — a raised neck lifts the head, it doesn't aim the face at the sky. In bilateral mode the
    // chain only ever pitches (yaw is dropped), so the frame is a pure X rotation and its pitch
    // can be taken back directly (most of it — a trace of the neck's rise keeps the brow alert).
    if (depth > 0 && !seg.child && dev.symmetry === 'bilateral') {
      const f = qRotate([0, 0, 1], quat);
      quat = qMul(quat, qFromAxisAngle([1, 0, 0], -0.9 * Math.atan2(-f[1], f[2]) + (grazer ? HEAD_BOW : 0)));
    }

    // the fusiform swell is a TORSO's: a head (the chain's last segment) or a bare connector (a neck
    // carries no limbs) tapers straight, or a long muzzle and an ostrich's neck bulge like sausages
    // …and a REARED trunk (pitched up off its hips: an ape's) is a torso — chest over a narrower waist
    // and hips — not a belly swelling mid-way between them (a fusiform upright trunk was a pear)
    // (by degrees: see `rearedness`)
    const reared = depth === 0 ? rearedness(seg.curve[0]) : 0;
    // …and a four-legged RUNNER's trunk (it deepens toward the chest — taper above 1) is a wedge: deep
    // at the brisket, drawn up to the waist, the back near level. With the full swell on top of that
    // its middle was the deepest and highest part — a bean with a hump, a head hung off the front of
    // it — and every cat and dog stood hunched like a grazing fawn. The swell fades as the taper grows.
    // (a trunk of one link has no chest behind its hips to deepen: its taper shapes nothing, and must
    // not shrink it — a crab's shell slimmed as that idle gene drifted up)
    const runner = depth === 0 && seg.repeat >= 2 && seg.taper > 1 && seg.appendages.filter((a) => a.kind === 'leg').length >= 2;
    const swell = runner ? BODY_BULGE * clamp(1 - RUNNER_TUCK * (seg.taper - 1), [0.3, 1]) : BODY_BULGE;
    // A MYRIAPOD's trunk is a chain of RINGS: each link a hard ring with its own leg pair, a narrow
    // joint between it and the next, the rings near equal down the body and drawing in to the rump.
    // (Grown as any trunk — links overlapping, swollen in the middle — a ten-legged body was a
    // smooth bottle with a comb of legs under its middle: a grub, not a thing in armour.)
    const ringed = dev.symmetry === 'bilateral' && isRinged(seg, depth);
    const ringAt = (i: number) => (ringed ? RING_RUMP + (1 - RING_RUMP) * smooth01(i / Math.max(seg.repeat - 1, 1) / 0.4) : 1);
    const bulge = ringed ? RING_SWELL : depth > 0 && (!seg.child || seg.appendages.length === 0) ? 0 : swell * (1 - reared);
    const profileAt = (i: number) => 1 + bulge * Math.sin(Math.PI * (seg.repeat > 1 ? i / (seg.repeat - 1) : 0.5));
    // A taper above 1 grows the chain toward its front (a chest deeper than the hips, a fish deepest
    // behind its head) — it moves the bulk forward, it doesn't add any: the peak link is held to the
    // size an untapered chain's would be, or every front-heavy body ballooned
    let norm = 1;
    if (seg.taper > 1) {
      let flat = 0;
      let grown = 0;
      for (let i = 0; i < seg.repeat; i++) {
        flat = Math.max(flat, profileAt(i));
        grown = Math.max(grown, Math.pow(seg.taper, i) * profileAt(i));
      }
      norm = flat / grown;
    }

    // A TAGMA JOINT (either side is an arthropod's leg-bearing thorax): the sections are hard capsules
    // hinged on a narrow waist — a spider's pedicel, an ant's petiole, an insect's neck — not one body
    // flowing into the next. A slim waist node sits just off the parent's front and this section
    // starts a radius past it, so abdomen, thorax and head read as separate parts.
    if (parentSeg && parentIdx >= 0 && dev.symmetry === 'bilateral' && (isTagma(parentSeg, depth - 1) || isTagma(seg, depth)) && !atCap()) {
      const P = nodes[parentIdx];
      const fwd = qRotate([0, 0, 1], startQuat);
      const r0 = girth * profileAt(0) * norm;
      const rw = Math.max(R_MIN, TAGMA_WAIST * Math.min(P.radius, r0));
      const wAt = surfaceExtent(P, fwd) + rw * 0.2;
      const wPos: Vec3 = [P.pos[0] + fwd[0] * wAt, P.pos[1] + fwd[1] * wAt, P.pos[2] + fwd[2] * wAt];
      const w = addNode(wPos, startQuat, rw, 'spine');
      nodes[w].segment = depth;
      edges.push([parentIdx, w]);
      prev = w;
      const cAt = rw * 0.2 + r0 * (segScale?.[2] ?? 1);
      pos = [wPos[0] + fwd[0] * cAt, wPos[1] + fwd[1] * cAt, wPos[2] + fwd[2] * cAt];
    }

    // (a head — the chain's last section — may have a stop: see headStop)
    const stop = !seg.child && dev.symmetry === 'bilateral' ? headStop(seg, depth) : 0;
    // (…its muzzle broad at the stop and narrowing to the nose: see muzzleShare; a myriapod's rings draw
    // in to its rump: see isRinged)
    // (…and a slitherer's trunk draws in to its neck: see NECK_PINCH)
    const neck = depth === 0 && dev.symmetry === 'bilateral' && slithers(seg);
    const neckAt = (i: number) => (neck ? 1 - NECK_PINCH * smooth01((i - (seg.repeat - 1 - NECK_LINKS)) / NECK_LINKS) : 1);
    const radiusAt = (i: number) =>
      girth * Math.pow(seg.taper, i) * profileAt(i) * norm * muzzleShare(i, seg.repeat - 1, stop) * ringAt(i) * neckAt(i);
    const muzzle = muzzleShare(1, seg.repeat - 1, stop); // the muzzle's girth at the stop (it sets how low it hangs)
    // (a ring's slim nodes — its two rims, the joint ahead of it — share the links' cross-section;
    // parts seat on the rings' centres alone)
    const ringNode = (at: Vec3, q: Quat, r: number, wide = 1): void => {
      const j = addNode(at, q, r, 'spine');
      nodes[j].segment = depth;
      if (segScale || wide !== 1) nodes[j].scale = [(segScale?.[0] ?? 1) * wide, segScale?.[1] ?? 1, segScale?.[2] ?? 1];
      if (prev >= 0) edges.push([prev, j]);
      prev = j;
    };
    const along = (at: Vec3, d: Vec3, by: number): Vec3 => [at[0] + d[0] * by, at[1] + d[1] * by, at[2] + d[2] * by];
    for (let i = 0; i < seg.repeat; i++) {
      if (atCap()) break;
      const radius = radiusAt(i);
      // a RING is a short barrel, rim to rim, its hind rim standing prouder than the fore (each plate
      // laps the one behind it); the link's node is its middle
      const axis = qRotate([0, 0, 1], quat);
      const half = ringed ? radius * RING_PLATE * 0.5 : 0;
      if (ringed) {
        ringNode(pos, quat, radius * RING_RIM[0]);
        pos = along(pos, axis, half);
      }
      const idx = addNode(pos, quat, radius, 'spine');
      nodes[idx].segment = depth;
      if (segScale) nodes[idx].scale = segScale;
      // (…and round in section, whatever the braincase's: a broad flat skull's shape carried down the
      // muzzle made it a duck's bill, wider than it was deep)
      if (segScale && stop > 0 && i > 0) nodes[idx].scale = [csx + (1 - csx) * stop, csy + (1 - csy) * stop, csz];
      if (prev >= 0) edges.push([prev, idx]);
      spine.push(idx);
      prev = idx;
      if (ringed && !atCap()) {
        pos = along(pos, axis, half);
        ringNode(pos, quat, radius * RING_RIM[1]);
      }

      // advance along local forward (+Z), bending by the per-link curve. In bilateral mode the
      // lateral (yaw) bend is dropped so the spine stays on the X=0 plane — a winding S-curve would
      // make the static body asymmetric (the slither/undulation animation supplies the wind instead).
      const yaw = dev.symmetry === 'bilateral' ? 0 : seg.curve[1];
      quat = qMul(quat, qFromEuler(linkPitch, yaw));
      const fwd = qRotate([0, 0, 1], quat);
      // (rings stand a gap apart — a gap of the two rings' mean radius, or toward the rump, where each
      // ring is a size up on the last, the bigger one's rim closed over it. The slim joint sits where
      // the two rims' rounds would meet: the bottom of the groove)
      const next = ringed && i + 1 < seg.repeat ? radiusAt(i + 1) : radius;
      let step = ringed ? ((radius + next) / 2) * lerp(RING_GAP[0], RING_GAP[1], (elong - 0.75) / 0.65) : nodes[idx].radius * elong; // overlap-bounded stride → continuous body
      if (stop > 0) {
        // the muzzle's links stride by the chain's measure, not their own slimmer one (it keeps the
        // length its genes asked for); the first is drawn in against the braincase
        step = i === 0 ? step * (1 - stop * (1 - STOP_STRIDE)) : girth * Math.pow(seg.taper, i) * elong;
      }
      if (ringed && (i + 1 < seg.repeat || seg.child) && !atCap()) {
        const fore = radius * RING_RIM[1];
        const hind = next * RING_RIM[0];
        const at = clamp((step * step + fore * fore - hind * hind) / (2 * step), [0.25 * step, 0.75 * step]);
        ringNode(along(pos, fwd, at), quat, RING_JOINT * Math.min(radius, next), RING_JOINT_WIDE);
      }
      pos = [pos[0] + fwd[0] * step, pos[1] + fwd[1] * step, pos[2] + fwd[2] * step];
      if (stop > 0 && i === 0) {
        const up = qRotate([0, 1, 0], quat);
        const low = stop * STOP_LOW * radius * csy * (1 - seg.taper * muzzle);
        pos = [pos[0] - up[0] * low, pos[1] - up[1] * low, pos[2] - up[2] * low];
      } else if (stop > 0 && i + 1 < seg.repeat) {
        // the muzzle narrows from below — its jaw line rising to the chin — while the bridge of the nose
        // runs on straight from the stop: the link ahead rises by what it gives up in girth (narrowed about
        // its axis, the bridge fell away to the nose with it, and the brow no longer stood over it)
        const up = qRotate([0, 1, 0], quat);
        const rise = stop * NOSE_RISE * (radiusAt(1) - radiusAt(i + 1));
        pos = [pos[0] + up[0] * rise, pos[1] + up[1] * rise, pos[2] + up[2] * rise];
      }
    }

    const haunched = new Set<number>();
    legGenesHere = seg.appendages.filter((a) => a.kind === 'leg');
    legPairsHere = legGenesHere.length;
    tagmaHere = isTagma(seg, depth);
    ocelliHere = depth > 0 && legPairsHere > 0;
    // A body sprawls or it stands: decided once, from its legs' mean splay. Judged leg by leg, a turtle
    // whose genes sat either side of the line stood on its hind legs like posts and sprawled the fore.
    sprawlHere = legPairsHere > 0 && legGenesHere.reduce((t, a) => t + clamp((4.712 - a.attachAzimuth) * 0.62, [0.12, 1.05]), 0) / legPairsHere > 0.5;
    ringedHere = ringed;
    if (ringed) {
      // every leg of a ringed body reaches the same floor: the lowest belly, less the clearance
      let belly = Infinity;
      let mean = 0;
      for (const i of spine) {
        belly = Math.min(belly, nodes[i].pos[1] - nodes[i].radius * (nodes[i].scale?.[1] ?? 1));
        mean += nodes[i].radius / spine.length;
      }
      ringFloorHere = belly - RING_CLEARANCE * mean;
      ringPoint = RING_POINT * mean;
    }
    for (const app of seg.appendages) {
      if (atCap()) break;
      const ai = clampInt(Math.round(app.attachT * (spine.length - 1)), 0, spine.length - 1);
      // shoulder / haunch: legs thicken the spine node they attach to, giving the body muscular
      // structure instead of a uniform tube. Once per node: on a short trunk several leg pairs share
      // a node, and compounding ×1.22 per pair swelled a spider's 1–2 node body into a giant ball.
      // (less and less as an arm-walker's trunk REARS off its hips, and not at all on an ape's: its hips
      // are the narrow end of a wedge that widens to the shoulders, and swollen they made the rump a
      // ball as broad as the chest, bulging out behind the hind legs. And a ring is armour, not
      // muscle: it carries its legs without a swell)
      if (app.kind === 'leg' && !ringed && !haunched.has(spine[ai])) {
        haunched.add(spine[ai]);
        // (a gentle swell — at ×1.22 the shoulders and hips humped the back into a two-bump sway)
        const swollen = Math.min(nodes[spine[ai]].radius * 1.12, nodes[spine[ai]].radius + 0.2);
        nodes[spine[ai]].radius = reared > 0 && armWalker ? lerp(swollen, nodes[spine[ai]].radius, reared) : swollen;
      }
      // Legs ride the CHAIN, not the nearest node: the slot is interpolated between neighbouring spine
      // nodes (and extrapolated past a 1-node trunk's ends), so a hexapod's or a spider's legs spread
      // fore-aft along the body instead of collapsing onto the same one or two nodes.
      if (app.kind === 'leg' && dev.symmetry !== 'radial') growAppendage(app, spine[ai], hoofSet(app, chainBase(spine, app.attachT), spine));
      else growAppendage(app, spine[ai]);
    }

    if (seg.child && depth + 1 < DEPTH_MAX && !atCap()) {
      growSegment(seg.child, pos, quat, depth + 1, prev, seg);
    }
  }

  /** A virtual attach node at fraction `t` along a spine chain (position/radius interpolated). */
  function chainBase(spine: number[], t: number): BodyNode {
    if (spine.length === 1) {
      // a one-node trunk: spread along its own length (fore-aft by the slot), on the node's surface
      const n = nodes[spine[0]];
      const fwd = qRotate([0, 0, 1], n.quat);
      const u = 0.85 * (clamp(t, [0, 1]) - 0.5) * 2;
      const reach = surfaceExtent(n, fwd) * u;
      // (the cross-section narrows toward the node's ends: a leg slotted near the front or back of an
      // oval body seats on ITS flank there, not on the widest girth, where its hip floated in the air)
      return { ...n, pos: [n.pos[0] + fwd[0] * reach, n.pos[1] + fwd[1] * reach, n.pos[2] + fwd[2] * reach], radius: n.radius * Math.sqrt(1 - u * u) };
    }
    const f = clamp(t, [0, 1]) * (spine.length - 1);
    const i0 = Math.min(Math.floor(f), spine.length - 2);
    const u = f - i0;
    const a = nodes[spine[i0]];
    const b = nodes[spine[i0 + 1]];
    return {
      ...(u < 0.5 ? a : b),
      pos: [a.pos[0] + (b.pos[0] - a.pos[0]) * u, a.pos[1] + (b.pos[1] - a.pos[1]) * u, a.pos[2] + (b.pos[2] - a.pos[2]) * u],
      radius: a.radius + (b.radius - a.radius) * u,
    };
  }

  /**
   * A HOOVED leg roots under the end of the trunk it carries — the haunch at the back of the rump,
   * the shoulder at the front of the chest: a deer's legs frame its body. Its base moves on along the
   * trunk's axis toward that end, by up to HOOF_SET of the trunk's radius there. (On the slots every
   * quadruped shares, a deer stood with its legs bunched under its middle, a barrel of a body
   * overhanging them at both ends: a barrel balanced on a trestle.)
   */
  function hoofSet(app: AppendageGene, base: BodyNode, spine: number[]): BodyNode {
    if (app.terminal !== 'hoof' || spine.length < 2) return base;
    const t = clamp(app.attachT, [0, 1]);
    const a = nodes[spine[t < 0.5 ? 0 : spine.length - 1]].pos;
    const b = nodes[spine[t < 0.5 ? 1 : spine.length - 2]].pos;
    const axis = norm([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
    const k = HOOF_SET * Math.abs(t - 0.5) * 2 * base.radius;
    return { ...base, pos: [base.pos[0] + axis[0] * k, base.pos[1] + axis[1] * k, base.pos[2] + axis[2] * k] };
  }

  function growAppendage(app: AppendageGene, attachIdx: number, virtualBase?: BodyNode): void {
    const base = virtualBase ?? nodes[attachIdx];
    const jitter = (rng() - 0.5) * 0.12;
    // seed perturbs the aim a touch — but not a spider's eyes, a cluster laid out eye by eye (OCELLI)
    const az = app.attachAzimuth + (ocelliHere && app.terminal === 'eye' ? 0 : jitter);
    const ce = Math.cos(app.attachElevation);
    const se = Math.sin(app.attachElevation);
    // spherical aim (MORPHOLOGY §3.1): az sweeps the cross-section, elevation tilts
    // toward the body axis (+forward / −back). This is what lets parts point anywhere.
    const aim = (a: number): Vec3 => norm([ce * Math.cos(a), ce * Math.sin(a), se]);

    if (dev.symmetry === 'radial') {
      // a radial body is arrayed about the VERTICAL: arms fan out over the ground and elevation tilts
      // them up toward the crown (+) or down onto the ground (−) — a starfish lies flat, an octopus
      // sits on its arms, the crown of eyes and the maw look up. (Arrayed about the forward axis, every
      // radial creature stood on its rim like a wheel.)
      const up = (a: number): Vec3 => norm([ce * Math.cos(a), se, ce * Math.sin(a)]);
      // a part grown as a PAIR (an octopus's eyes): once, its azimuth off the front (+Z, at π/2), then
      // mirrored across X=0 — not once per arm, which ringed an octopus's mantle with eight eyes
      if (app.radialPair) {
        const nStart = nodes.length;
        const eStart = edges.length;
        growLimb(app, base, up(Math.PI / 2 - az), attachIdx);
        mirrorAcrossX(nStart, eStart, attachIdx);
        return;
      }
      for (let k = 0; k < dev.radialCount; k++) {
        // a radial body's TENTACLES each bend their own way, a little to one side and some lifting their
        // tips: the ring copies one gene, and eight identical arcs made a starburst from above, a
        // pinwheel. (Hashed from the seed and the arm, not drawn: every later draw stays where it was.
        // A stub too short to show a bend — an urchin's tube feet — grows as it did.)
        const own =
          app.kind === 'tentacle' && app.segments >= 3
            ? { ...app, curl: [app.curl[0] - ARM_LIFT * unitHash(dev.seed, 0x7e0 + k), app.curl[1] + ARM_SWAY * (unitHash(dev.seed, 0x7f0 + k) - 0.5)] as [number, number] }
            : app;
        growLimb(own, base, up(az + (k * Math.PI * 2) / dev.radialCount), attachIdx);
      }
      return;
    }
    // bilateral / none: grow one limb…
    let d = aim(az);
    // (a part's aim is the body's, not its section's: a grazer's mouth is aimed down by as much as its head is
    // bowed — see HEAD_BOW — or it sat on the very point of the muzzle, its nose up on the bridge)
    if (grazer && app.terminal === 'mouth') d = [d[0], d[1] * Math.cos(HEAD_BOW) - d[2] * Math.sin(HEAD_BOW), d[1] * Math.sin(HEAD_BOW) + d[2] * Math.cos(HEAD_BOW)];
    // a non-paired part on a bilateral body must stay on the midline plane (X=0): aim it in the
    // plane and drop the roll + lateral curl that would let a multi-segment part (a tail) wander off.
    if (dev.symmetry === 'bilateral' && !app.pair) {
      d = norm([0, d[1], d[2]]);
      app = { ...app, roll: 0, curl: [app.curl[0], 0] };
    }
    const nStart = nodes.length;
    const eStart = edges.length;
    growLimb(app, base, d, attachIdx);
    // …then a paired part is the *exact* reflection of that limb across X=0 (quaternions can't
    // mirror, so growing the other side from a flipped aim drifts — reflect the grown nodes instead).
    if (app.pair && dev.symmetry === 'bilateral') mirrorAcrossX(nStart, eStart, attachIdx);
  }

  /** Reflect the limb nodes/edges grown in [nStart,nEnd) across the X=0 plane (exact mirror). */
  function mirrorAcrossX(nStart: number, eStart: number, baseIdx: number): void {
    const nEnd = nodes.length;
    const eEnd = edges.length;
    const map = new Map<number, number>();
    map.set(baseIdx, baseIdx); // the shared attach node sits on X=0
    for (let i = nStart; i < nEnd; i++) {
      if (atCap()) break;
      const n = nodes[i];
      // mirror position across X=0; mirror orientation about the YZ plane: (x,y,z,w) → (x,−y,−z,w),
      // which flips the part's outward direction's X while keeping its forward/up read.
      const mi = addNode([-n.pos[0], n.pos[1], n.pos[2]], [n.quat[0], -n.quat[1], -n.quat[2], n.quat[3]], n.radius, n.kind, n.terminal);
      if (n.part) nodes[mi].part = n.part;
      map.set(i, mi);
    }
    for (let e = eStart; e < eEnd; e++) {
      const [a, b] = edges[e];
      const ma = map.get(a);
      const mb = map.get(b);
      if (ma !== undefined && mb !== undefined) edges.push([ma, mb]);
    }
  }

  /** Drop every foot to the lowest foot's Y so the creature stands level (the hip stays put, the lower
   *  leg stretches to reach). Left/right feet share a Y by mirror, so exact symmetry is preserved.
   *  Returns the ground height they stand on (null when nothing stands). */
  function levelFeet(): number | null {
    if (dev.symmetry === 'radial') return null;
    const feet: number[] = [];
    for (let i = 0; i < nodes.length; i++) if (nodes[i].kind === 'terminal' && nodes[i].part?.kind === 'leg') feet.push(i);
    if (feet.length < 2) return null;
    // the ground is the lowest foot — or just under the belly, if every foot ends above it: a creature
    // stands ON its feet. (Arched arthropod legs and stubby limbs used to end beside the belly, so the
    // body lay on the floor with its legs dangling in the air.)
    let belly = Infinity;
    for (const n of nodes) {
      if (n.kind !== 'spine') continue;
      // (the body's true underside, as it is turned: see nodeReach — a crab's tilted shell reached
      // below its scaled radius, and its legs were planted above the floor its belly lay on)
      belly = Math.min(belly, n.pos[1] - nodeReach(n)[1]);
    }
    const groundY = Math.min(...feet.map((i) => nodes[i].pos[1]), belly - 0.04);
    const parentOf = new Int32Array(nodes.length).fill(-1);
    for (const [a, b] of edges) parentOf[b] = a;
    for (const footIdx of feet) {
      const chain: number[] = [footIdx];
      let cur = footIdx;
      while (true) {
        const p = parentOf[cur];
        if (p < 0 || nodes[p].part?.kind !== 'leg') break; // stop at the hip (first non-leg ancestor)
        chain.unshift(p);
        cur = p;
      }
      const k = chain.length - 1;
      if (k < 1) continue;
      const dy = groundY - nodes[footIdx].pos[1];
      if (dy > -1e-9) continue;
      // hip fixed, foot → ground. An ARCHED leg (knee above the hip — an arthropod's) keeps its knee
      // and stretches only the shin, so planting the foot never flattens the arch; a column leg
      // spreads the stretch evenly down its length.
      const arched = k >= 2 && nodes[chain[1]].pos[1] > nodes[chain[0]].pos[1];
      for (let i = 1; i <= k; i++) {
        const w = arched ? (i - 1) / (k - 1) : i / k;
        nodes[chain[i]].pos[1] += dy * w;
      }
    }
    return groundY;
  }

  /**
   * A tail rests ON the ground, never through it. A hanging tail's tip used to end below the feet,
   * and since every view puts the floor at the lowest point, the creature then stood on its tail
   * tip with its feet in the air. Walk each tail from its root: a link that would dip under the
   * floor is lifted to lie along it, and everything after it rides up with it, so a heavy reptile's
   * tail drags on the floor and a light one trails level. An ARM likewise: an ape's long arms
   * reach down to rest their knuckles on the ground, never through it.
   */
  /** A body that lies on its belly: bilateral, with no legs, fins or wings (a snake; a fish swims). */
  function lyingDown(): boolean {
    if (dev.symmetry !== 'bilateral') return false;
    for (const n of nodes) if (n.part?.kind === 'leg' || n.part?.kind === 'fin' || n.part?.kind === 'wing') return false;
    return true;
  }

  function groundTails(groundY: number): void {
    // (see the snake's tail, below)
    const grounded = lyingDown();
    const parentOf = new Int32Array(nodes.length).fill(-1);
    for (const [a, b] of edges) parentOf[b] = a;
    const kids: number[][] = nodes.map(() => []);
    for (const [a, b] of edges) kids[a].push(b);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const p = parentOf[i];
      const kind = n.part?.kind;
      // a tail's (or an arm's) ROOT: its first node off a parent of another kind
      if ((kind !== 'tail' && kind !== 'arm') || p < 0 || nodes[p].part?.kind === kind) continue;
      // A KNUCKLE-WALKER's arm ends ON the ground: the shoulder stays put and the arm below it is
      // stretched or shortened (a little) until the hand rests there, as a leg's is to plant its foot.
      // (Left at its grown length, an ape on long legs stood with its fists hanging in the air, and
      // one on short legs with its forearms squashed to half the upper arm's length.) By degrees, as
      // the trunk rears: see knuckleArm.
      const knuckle = kind === 'arm' && nodes[p].kind === 'spine' && nodes[p].segment === 0 && dev.symmetry === 'bilateral' ? rearedness(dev.body.curve[0]) : 0;
      if (knuckle > 0) {
        const chain = [i];
        for (let k = kids[i].find((c) => nodes[c].part?.kind === kind); k !== undefined; k = kids[k].find((c) => nodes[c].part?.kind === kind)) chain.push(k);
        const hand = nodes[chain[chain.length - 1]];
        const drop = n.pos[1] - hand.pos[1];
        if (hand.terminal === 'hand' && chain.length > 1 && drop > 1e-6) {
          const s = lerp(1, clamp((n.pos[1] - (groundY + hand.radius * 0.85)) / drop, ARM_REACH), knuckle);
          for (const c of chain) nodes[c].pos[1] = n.pos[1] + (nodes[c].pos[1] - n.pos[1]) * s;
        }
      }
      // A SNAKE's tail (a body with no legs and no fins: it lies on the ground, it doesn't swim) rests
      // on the ground along its length: each link settles onto the floor as it thins. (Run straight
      // back from the rump at the rump's own height, the thinning tail's tip stood a quarter of a unit
      // in the air — a hook, a little spike held up behind it.)
      const resting = kind === 'tail' && grounded;
      let lift = 0;
      let cur = i;
      while (true) {
        const c = nodes[cur];
        c.pos[1] += lift;
        // (a blade of a tail is deeper than its radius — it lies on its lower edge)
        const floor = groundY + c.radius * (c.scale?.[1] ?? 1) * 0.85;
        if (c.pos[1] < floor) {
          lift += floor - c.pos[1];
          c.pos[1] = floor;
        } else if (resting) {
          lift -= c.pos[1] - floor;
          c.pos[1] = floor;
        }
        const next = kids[cur].find((k) => nodes[k].part?.kind === kind);
        if (next === undefined) break;
        cur = next;
      }
    }
  }

  function recomputeBounds(): void {
    min[0] = min[1] = min[2] = Infinity;
    max[0] = max[1] = max[2] = -Infinity;
    for (const n of nodes) {
      // A creature RESTS on its body and limbs, never on a mouth or an eye: the floor is the lowest of
      // those. (A sea star's mouth, an octopus's beak, an urchin's, a slug's under its front, a crab's
      // eyes on the rim of its shell: their nodes hung below the arms and the sole, the ground was set
      // under them, and the animal floated a hand's breadth over it.)
      const face = n.terminal === 'mouth' || n.terminal === 'eye';
      const reach = nodeReach(n);
      for (let a = 0; a < 3; a++) {
        if (!(face && a === 1)) min[a] = Math.min(min[a], n.pos[a] - reach[a]);
        max[a] = Math.max(max[a], n.pos[a] + reach[a]);
      }
    }
    if (min[1] === Infinity) min[1] = Math.min(...nodes.map((n) => n.pos[1] - n.radius)); // (all face: unlikely)
  }

  /** How far an arm is an ape's — the limb it walks on its knuckles with: a paired, hand-tipped arm
   *  on a trunk reared up off its hips (0 on a level body, a theropod's little arms … 1 on one wholly
   *  reared; by degrees between, like everything else a rearing trunk changes). */
  function knuckleArm(app: AppendageGene, base: BodyNode): number {
    if (app.kind !== 'arm' || app.terminal !== 'hand' || !app.pair || dev.symmetry !== 'bilateral' || base.segment !== 0) return 0;
    return rearedness(dev.body.curve[0]);
  }

  function growLimb(app: AppendageGene, base: BodyNode, dir0: Vec3, parentIdx: number): void {
    let dir = dir0;
    let startPos: Vec3;
    let arch: Vec3[] | null = null; // an explicit leg polyline (segment directions): arthropod or sprawler
    let sprawl = false; // the polyline is a vertebrate sprawler's (thick, normal-length segments)
    let lizardLeg = false; // …a walking sprawler's (a lizard's, a crocodile's, a frog's arm): see below
    const brush = isBrushTail(app, app.terminal) && dev.symmetry === 'bilateral';
    if (app.kind === 'leg' && dev.symmetry !== 'radial') {
      // Legs attach at the shoulder/hip — the body's *side*, a touch above the belly — not the
      // underbelly midline, then descend. This widens the stance and puts the limb's top where it
      // belongs. The growth heads down with a slight outward splay; the knee/ankle folds do the rest.
      const sideX = dir0[0] >= 0 ? 1 : -1; // which flank (the X=0 mirror makes the other side)
      // Stance width is set by the leg's (bauplan-normalized) azimuth: 4.712 ≈ straight down (narrow,
      // upright), lower ≈ splayed out (sprawling). This is what makes a spider's legs fan out wide
      // instead of hanging in a tight bunch under the body like a quadruped's.
      const splay = clamp((4.712 - app.attachAzimuth) * 0.62, [0.12, 1.05]);
      // measure the flank on the true surface — a wide flat body (croc/lizard) is broader than its
      // scalar radius, and attaching at the radius would bury the leg's top inside the torso.
      const flank = surfaceExtent(base, [sideX, 0, 0]);
      // A column leg's hip sits INSIDE the torso, below its midline: the thigh's top is buried in the
      // body and the limb emerges from the underside of the flank, a mammal's silhouette. (Seated on
      // the flank surface above the midline, every thick thigh ballooned out of the side as a lobe —
      // shoulders and haunches read as balls stuck to a tube.) A sprawler's wider splay still carries
      // its hip out to the side.
      startPos = [base.pos[0] + sideX * flank * Math.min(0.98, 0.5 + splay * 0.7), base.pos[1] - base.radius * 0.18, base.pos[2]];
      dir = norm([sideX * splay, -1, 0]);
      // a BIPED (bird, ape, theropod) stands on one pair under its centre of mass: hips set in from
      // the flank and the legs dropped straight, the feet under the body ~0.4 of a body-width apart.
      // With a quadruped's splay they planted an A-frame half again wider than the body.
      if (legPairsHere === 1 && splay < 0.5) {
        startPos = [base.pos[0] + sideX * flank * 0.5, base.pos[1] - base.radius * 0.18, base.pos[2]];
        dir = [0, -1, 0];
        // …and under a trunk REARED off its hips (an ape's) the hip joints sit at the BACK of the
        // pelvis, the thighs dropping from under the tail end: hung from its middle, the whole rear
        // half of the rump stood out behind the heels as a ball. (By degrees as the trunk rears, and
        // evenly, from the lean of the most upright level walker: on top of the hips' slide to the
        // pelvis over the same leans, a quicker shift was a jump.)
        // (only where arms carry the front of the body: a bird that stands tall has nothing but its
        // two feet under it, and with its hips at the back of its pelvis it stood ahead of them,
        // falling on its bill)
        const up = armWalker ? clamp((HIP_BACK_FROM - dev.body.curve[0]) / (HIP_BACK_FROM - UPRIGHT_FULL), [0, 1]) : 0;
        if (up > 0) startPos[2] -= REARED_HIP_BACK * base.radius * up;
      }
      // ARTHROPOD legs (a hexapod or more, or an extreme sprawl): not a mammal's column folding fore-aft
      // at the knee but an ARCH in the leg's own vertical plane — the femur rises up-and-out, the knee
      // peaks above the body, the shin drops to a foot planted far out to the side. Each pair also
      // fans fore-aft by its slot (front legs reach forward, hind legs back), so 8 legs radiate like a
      // spider's instead of hanging in a row of identical columns.
      // (an extreme splay alone only arches a CHITINOUS body's legs: a frog or a lizard that drew a wide
      // stance is still a vertebrate sprawler, not a spider standing on its knuckles)
      if (legPairsHere >= 3 || (splay > 0.72 && dev.covering.type === 'chitin')) {
        // each pair FANS around the body by its slot — the front legs reach forward, the hind legs
        // back, the middle ones out to the side — so the legs radiate from the thorax like a spider's
        // or a beetle's instead of standing in a row of parallel arches
        // a SPIDER's eight legs (on a cephalothorax) radiate widest; a CRAB's (eight on the trunk,
        // under its shell) splay out to the side
        const spider = legPairsHere >= 4 && tagmaHere;
        const decapod = legPairsHere >= 4 && !tagmaHere;
        // a MYRIAPOD's legs stand out square from the rings of its middle and flare at its ends: the
        // front pairs reach forward beside the head, the last sweep back behind the rump like a
        // centipede's trailing pair (fanned evenly, a row of ten was a comb)
        const u = app.attachT - 0.5;
        // (a crab's walking legs sweep BACK as a set — the first pair barely forward of square, the last
        // well behind it: fanned evenly fore and aft about the middle, they radiated round the shell
        // like a tick's)
        const fan = ringedHere
          ? (u > 0 ? 0.5 * u + 2.4 * u * u * u : 0.9 * u + 4.4 * u * u * u)
          : decapod
            ? u * DECAPOD_FAN[0] - DECAPOD_FAN[1]
            : u * (spider ? 2.3 : 1.9);
        const hx = sideX * Math.cos(fan);
        const hz = Math.sin(fan);
        // a spider's knees peak high over its back and its long shins reach far out and down; a crab's
        // legs rise out from under the shell's rim, run on outward and down, and turn to points planted
        // wide — the body slung low between them (out level and then straight down, they were the legs
        // of a table, and the crab stood as tall as it was wide); a
        // hexapod's femur runs out nearer level, the tibia drops steeply and the tarsus angles out
        // along the ground (one profile for all read as a spider on stilts or an insect on its belly)
        const n = app.segments - 1; // segment advances (n nodes span n-1 lengths)
        // (a spider's shin and foot reach OUT as they come down, the leg one arc from the knee to a foot
        // planted far out: dropped near plumb from a high knee, seen down its own plane the near leg was
        // one straight pole through the head)
        const sweep = spider ? Math.sign(u) * SPIDER_SWEEP : 0;
        const [h1, h2] = [fan + sweep, fan + 2 * sweep].map((a) => [sideX * Math.cos(a), Math.sin(a)]);
        const [k0, mid, end]: Vec3[] = spider
          ? [[hx, 0.8, hz], [h1[0] * 0.75, -0.7, h1[1] * 0.75], [h2[0] * 0.6, -1, h2[1] * 0.6]]
          : decapod
            ? [[hx, 0.62, hz], [hx, -0.5, hz], [hx * 0.55, -1, hz * 0.55]]
            : [[hx, 0.4, hz], [hx * 0.45, -1, hz * 0.45], [hx * 0.6, -0.45, hz * 0.6]];
        arch = [];
        if (n <= 1) arch.push(norm([hx * 0.7, -0.7, hz * 0.7]));
        else for (let k = 0; k < n; k++) arch.push(norm(k === 0 ? k0 : k === n - 1 ? end : mid));
        dir = arch[0];
        startPos = [base.pos[0] + sideX * flank * 0.9, base.pos[1] + base.radius * 0.05, base.pos[2]];
        if (ringedHere && n >= 2) {
          // a myriapod's leg leaves low on its ring's flank, rises a little to the knee, runs out and
          // down, and turns to a point planted well out to the side. The middle links take whatever
          // slope brings the point to the body's one floor, so a long leg reaches further out instead
          // of deeper down (every leg on the crab's profile, the longest pair stood the body on stilts
          // and the rest hung straight to reach the ground beside it)
          startPos = [base.pos[0] + sideX * flank * 0.86, base.pos[1] - base.radius * (base.scale?.[1] ?? 1) * 0.22, base.pos[2]];
          const rise = norm([hx, 0.34, hz]);
          const point = norm([hx * 0.22, -1, hz * 0.22]);
          const L = app.length * 1.2;
          const fall = clamp(((startPos[1] - ringFloorHere - ringPoint) / L + rise[1] + point[1]) / Math.max(n - 2, 1), [0.08, 0.94]);
          const run = Math.sqrt(1 - fall * fall);
          arch = [];
          for (let k = 0; k < n; k++) arch.push(k === 0 ? rise : k === n - 1 ? point : [hx * run, -fall, hz * run]);
          dir = arch[0];
        }
      } else if (sprawlHere) {
        // a SPRAWLER (lizard, croc, newt): the upper leg juts out sideways at hip height, the elbow /
        // knee sits out beside the body and the shin drops to a foot planted wide — the push-up stance,
        // not a mammal's column tucked under the belly. Same polyline machinery as the arthropod arch
        // (the knee rides a hair above the hip, so planting the foot stretches only the shin), but a
        // vertebrate's thickness and segment lengths.
        const zf = (app.attachT - 0.5) * 0.9;
        const n = app.segments - 1;
        arch = [];
        // a JUMPER (a frog): hind legs far longer than the fore fold up in a tight Z beside the body —
        // the thigh juts forward and out, the shin folds back along the flank, and the long foot lies
        // flat on the ground pointing forward, the spring loaded. (Planted as a sprawler's posts, a
        // frog stood on stilts at the back.)
        // (judged per link: the two pairs can differ in their link count)
        const fore = legGenesHere.reduce((m, a) => (a.attachT > m.attachT ? a : m), app);
        const jumper = legPairsHere === 2 && app.attachT < 0.5 && app.length > 1.4 * fore.length;
        if (jumper && n >= 2) {
          arch.push(norm([sideX, -0.12, 0.62]));
          arch.push(norm([sideX * 0.3, -0.3, -1]));
          for (let k = 2; k < n; k++) arch.push(norm([sideX * 0.15, -0.16, 1]));
        } else if (n <= 1) arch.push(norm([sideX * 0.8, -0.6, zf * 0.3]));
        else if (!shelled) {
          // a walking sprawler's limb (a lizard's, a crocodile's, a frog's arm): the upper limb rises a
          // little out of the flank to an elbow or a knee held up beside the body, and the lower limb
          // angles down and out to a foot planted wide of it. (Run level out of the flank and straight
          // down, under a haunch that swallowed the upper limb, each was a stub on a table leg: a
          // push-up stance with no elbow or knee to be seen.)
          lizardLeg = true;
          for (let k = 0; k < n; k++) {
            if (k === 0) arch.push(norm([sideX, 0.32, zf * 0.4]));
            else if (k === n - 1) arch.push(norm([sideX * 0.42, -1, zf * 0.5]));
            else arch.push(norm([sideX * 0.48, -1, zf * 0.25]));
          }
        } else
          for (let k = 0; k < n; k++) {
            if (k === 0) arch.push(norm([sideX, 0.06, zf * 0.4]));
            else if (k === n - 1) arch.push(norm([sideX * 0.12, -1, zf * 0.5]));
            else arch.push(norm([sideX * 0.3, -1, zf * 0.25]));
          }
        sprawl = true;
        dir = arch[0];
        startPos = [base.pos[0] + sideX * flank * 0.82, base.pos[1] - base.radius * 0.12, base.pos[2]];
      }
      dir0 = dir;
    } else {
      // Seat a face organ (eye/mouth/ear) proud of the body by a fraction of ITS OWN radius, so it
      // always clears the surface without floating — for a tiny or a huge organ alike. The renderer
      // draws no connecting capsule into these (see meshData SURFACE_ORGANS), so the organ must sit on
      // the surface: never buried, never adrift. Other appendages attach at the surface as before.
      const t = app.terminal;
      // the mouth hugs the skin (0.12): its geometry is traced onto the true surface by the viewer's
      // mouth-line system, so a proud seat would only push the anchor off the face it draws on
      // …and so does an ear: it is a flap drawn from its root, and the root belongs in the skull (set
      // half its width proud, the flap stood on air, or on a lump of skin put there to hide the gap)
      const seat = t === 'eye' ? 0.6 : t === 'mouth' ? 0.12 : t === 'ear' ? 0.1 : 0;
      // A radial body's TENTACLES root on its underside, round the mouth, and reach out from there —
      // an octopus's arms come from under its mantle. (Rooted where they aim, on the flank, they stuck
      // out of the middle of the body like spokes, the mantle hanging down between them to the floor.)
      let root = dir;
      if (dev.symmetry === 'radial' && app.kind === 'tentacle' && dir[1] < 0.2) root = norm([dir[0], dir[1] - TENTACLE_ROOT, dir[2]]);
      // A BRUSH is set on at the top of the croup and falls away behind it, whichever way it is then
      // carried. (Seated where it aims, like any other part, a tail that hangs came out from under
      // the rump, between the thighs, with the buttocks standing out above it.)
      if (brush) root = norm([dir[0], dir[1] + BRUSH_SEAT, dir[2]]);
      // A HORN roots on the skull at its azimuth however far back it is swept: on the skull's upper rear
      // corner. (Seated where it aimed, a pair aimed well back both rooted on the back of the skull, near the
      // midline, their sheaths merged — from above, a fork laid on the neck: a wyvern's, a dragon's.)
      if (app.kind === 'horn' && dev.symmetry === 'bilateral' && dir[2] < -HORN_SEAT_BACK) root = norm([dir[0], dir[1], -HORN_SEAT_BACK]);
      // measured against the node's TRUE surface (see surfaceExtent), so a long snout or a domed skull
      // still wears its face proud rather than swallowing it.
      const out = surfaceExtent(base, root) + seat * app.thickness;
      startPos = [base.pos[0] + root[0] * out, base.pos[1] + root[1] * out, base.pos[2] + root[2] * out];
      // A KNUCKLE-WALKER's arm (an ape's) hangs from a SHOULDER: the upper corner of the chest, out on
      // its flank, the deltoid standing proud of the ribs — an ape is widest across the shoulders.
      // (Rooted where it aimed, under the chest, each arm left the breastbone like a foreleg: from the
      // front the ape was a thumb on four posts, no wider at the shoulder than at the neck.)
      const knuckle = knuckleArm(app, base);
      if (knuckle > 0) {
        const sideX = dir[0] >= 0 ? 1 : -1;
        const shoulder: Vec3 = [
          base.pos[0] + sideX * surfaceExtent(base, [sideX, 0, 0]) * SHOULDER_OUT,
          base.pos[1] + base.radius * (base.scale?.[1] ?? 1) * SHOULDER_UP,
          base.pos[2],
        ];
        startPos = [lerp(startPos[0], shoulder[0], knuckle), lerp(startPos[1], shoulder[1], knuckle), lerp(startPos[2], shoulder[2], knuckle)];
      }
      // An eye STALK stands up from wherever it is rooted — a crab's from the front rim of its shell —
      // leaning the way its root faces. (Grown straight out along the root's direction, stalks could
      // only be rooted on top of the body: set on the front rim, they pointed forward like feelers.)
      if (app.kind === 'eyestalk' && t === 'eye' && app.segments >= 2 && dev.symmetry !== 'radial' && dir[1] < STALK_RISE) {
        const flat = Math.hypot(dir[0], dir[2]);
        const k = flat > 1e-6 ? Math.sqrt(1 - STALK_RISE * STALK_RISE) / flat : 0;
        dir0 = [dir[0] * k, STALK_RISE, dir[2] * k];
      }
    }
    // orient +Z → aim direction, then roll about that axis (orients flat parts). A radial body's parts
    // each stand in an UPRIGHT frame (turned to their heading, then tilted): the shortest turn from +Z
    // twists as the aim nears −Z, so the one arm that pointed backward curled a different way from its
    // siblings — an octopus with one arm in the air, a star with one ray dug into the floor.
    let quat = qMul(qFromAxisAngle(dir0, app.roll), dev.symmetry === 'radial' ? qUpright(dir0) : qFromTo([0, 0, 1], dir0));
    let pos: Vec3 = startPos;
    let prev = parentIdx;

    // A column leg's joints, in a limb frame where a POSITIVE pitch swings the next link BACK (−Z):
    // a hind leg (and a bird's, an ape's) runs hip → knee forward → hock back → foot forward. A
    // quadruped's FORELEG folds the other way: the upper arm slopes back to an elbow behind the
    // shoulder, the forearm drops near-vertical, the pastern angles forward to the paw. (The signs
    // were inverted: every hind knee pointed backward like a bird's heel, under every quadruped.)
    const fore = app.kind === 'leg' && !arch && legPairsHere === 2 && app.attachT > 0.5 && dev.symmetry !== 'radial';
    let pitch = app.kind !== 'leg' ? app.curl[0] : fore ? 0.18 + 0.5 * Math.abs(app.curl[0]) : -app.curl[0];
    // An EAR is one node on the skull, whatever its gene says of links: the flap is drawn whole from
    // its root, and no stalk is meshed under it (see bodyField) — grown as a chain, a bred ear's flap
    // would hang in the air a link's length off the head.
    const segments = app.terminal === 'ear' ? 1 : app.segments;
    for (let j = 0; j < segments; j++) {
      if (atCap()) break;
      const last = j === segments - 1;
      let r = app.thickness * Math.pow(app.taper, j);
      // a real leg is a muscular haunch tapering to a slim shin/ankle (the broad foot comes from the
      // paw/hoof terminator, which spreads wider than its node) — so legs read as powerful, not vestigial.
      if (app.kind === 'leg') {
        const t = app.segments > 1 ? j / (app.segments - 1) : 0;
        // arthropod legs are slender jointed rods (a spider's leg is a fraction of its body's girth);
        // vertebrate legs are a muscular haunch that falls away fast to a slim shin: ~1.5× at the hip,
        // ~1.05× by the knee, ~0.7× at the ankle (a straight taper read as a noodle)
        // …and a SHELLED body's legs (a tortoise's) are columns out of the openings of its shell, their
        // roots inside it: swollen at the hip like a lizard's, each thigh stood out under the rim as a
        // ball as big as the head — a frog wearing a shell
        // (a walking sprawler's upper limb is a limb, not a haunch: it shows, from the flank to the elbow)
        r *= shelled ? 0.95 - 0.15 * t : lizardLeg ? 1.05 - 0.2 * t : arch && !sprawl ? 0.62 - 0.22 * t : 0.7 + 0.8 * (1 - t) * (1 - t);
        // …but a haunch is part of the body it hangs from, never a second body beside it: on a
        // thick-limbed animal (a bear) the swollen hips stood out of the flanks as four balls, the
        // trunk a peanut between them. The limb below keeps its girth.
        if (j === 0 && !arch) r = Math.min(r, HIP_MAX * base.radius);
      }
      // (an ape's upper arm swells into the shoulder it hangs from: see knuckleArm)
      const deltoid = j === 0 ? knuckleArm(app, base) : 0;
      if (deltoid > 0) r *= 1 + (DELTOID - 1) * deltoid;
      if (brush) r *= brushProfile(segments > 1 ? j / (segments - 1) : 0);
      // an eye STALK is a stalk: slimmer than the eye it carries. (Its links were as thick as the
      // eyeball — a snail's feelers and a crab's eyes stood on chimneys.)
      if (!last && app.terminal === 'eye') r *= STALK_SLIM;
      if (!last && app.kind === 'arm' && app.terminal === 'pincer') r *= CHELIPED_SLIM;
      // the eye is the emotional anchor — floor the grown bulb so even a tapered/stalked eye on a
      // small head always reads (M19/M24), regardless of how the gene tapered down its tip.
      // (a spider's small eyes are beads: see OCELLI)
      if (last && app.terminal === 'eye') r = Math.max(r, ocelliHere ? R_MIN : EYE_R_MIN);
      if (arch) quat = qFromTo([0, 0, 1], arch[Math.min(j, arch.length - 1)]);
      const idx = addNode(pos, quat, r, last ? 'terminal' : 'limb', last ? app.terminal : undefined);
      // (a webbed ring's arms carry their web's reach, for the skin to stretch it between them)
      nodes[idx].part = app.web ? { kind: app.kind, style: app.style, web: app.web } : { kind: app.kind, style: app.style };
      // a SCULLING tail leaves the rump round and turns into a blade: its width falls away faster than
      // its depth, so from the side it stays tall to near the tip and from above it runs to a thin
      // line. (Round all the way down, a crocodile's tail was a cone — a rat's, scaled up.)
      if (j > 0 && segments > 1 && isScullingTail(app, app.terminal)) {
        const u = j / (segments - 1);
        nodes[idx].scale = [1 - SCULL_PINCH * u, 1 + SCULL_DEPTH * Math.sin(Math.PI * 0.8 * u), 1];
      }
      edges.push([prev, idx]);
      prev = idx;
      if (arch) {
        const d = arch[Math.min(j, arch.length - 1)];
        const L = app.length * (sprawl ? 1.0 : 1.2); // an arthropod's long spindly segments
        pos = [pos[0] + d[0] * L, pos[1] + d[1] * L, pos[2] + d[2] * L];
        continue;
      }

      quat = qMul(quat, qFromEuler(pitch, app.curl[1]));
      dir = qRotate([0, 0, 1], quat);
      pos = [pos[0] + dir[0] * app.length, pos[1] + dir[1] * app.length, pos[2] + dir[2] * app.length];
      // a real jointed leg: thigh forward → (knee folds the shin sharply back under the body) → (hock
      // swings the foot forward) — a clear Z stance, not one gentle curved sweep; a foreleg's mirror
      // fold (see `fore`). Other limbs keep their curl.
      if (app.kind === 'leg') {
        // knee — a clear backward fold, but softened: at ×3.0 the leg folded so far back under the
        // body that added segment length turned into more fold instead of more standing height,
        // which is why creatures read as stubby however long their legs got.
        if (fore) {
          if (j === 0) pitch = -(0.3 + 0.5 * Math.abs(app.curl[0])); // elbow — the forearm comes back to vertical
          else if (j === 1) pitch = app.terminal === 'hoof' && app.segments >= 4 ? HOOF_KNEE : -0.32; // wrist — the pastern angles forward to the paw (a hooved leg's knee: its cannon drops plumb)
        } else if (j === 0) pitch = Math.abs(app.curl[0]) * 2.15 + 0.2; // knee — the shin folds back
        else if (j === 1) pitch = -(Math.abs(app.curl[0]) * 2.0 + 0.2); // hock — swing the foot forward
      }
    }
  }
}

// =============================================================================
// Bauplan pass (M24) — the structural attractor basin
// =============================================================================

/**
 * Canonical leg-pair `attachT` positions per pair-count — the bilateral limb attractor basins.
 * index = number of leg pairs (1=biped · 2=quadruped · 3=hexapod · 4=octopod · 5=decapod). Each leg
 * part is `pair:true`, so grow's exact X=0 mirror keeps the arrangement symmetric.
 */
export const LEG_SLOTS: readonly (readonly number[])[] = [
  [],
  [0.55],
  // a quadruped stands with its legs under the hips and shoulders — the trunk's ends — not pulled
  // in toward the middle (at 0.2/0.8 the body overhung its short wheelbase like a sausage on stilts)
  [0.1, 0.92],
  [0.18, 0.5, 0.82],
  [0.12, 0.37, 0.63, 0.88],
  [0.1, 0.3, 0.5, 0.7, 0.9],
];

/** Canonical attachT slots for `pairs` leg-pairs (≥6 spread evenly across the trunk). */
export function legSlots(pairs: number): readonly number[] {
  if (pairs <= 0) return [];
  if (pairs < LEG_SLOTS.length) return LEG_SLOTS[pairs];
  const out: number[] = [];
  for (let i = 0; i < pairs; i++) out.push(((i + 0.5) / pairs) * 0.8 + 0.1);
  return out;
}

/** The leg slots of a MYRIAPOD's trunk (see isRinged): the pairs run its whole length, rump to
 *  shoulders — a pair to each ring when there are as many. (On the slots above, drawn in toward the
 *  middle, a ten-legged body carried a legless third of itself ahead of its legs.) */
export function ringSlots(pairs: number): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < pairs; i++) out.push(pairs > 1 ? i / (pairs - 1) : 0.5);
  return out;
}

/**
 * The bauplan pass: pure, deterministic structural normalization (M24). Pulls the legs onto the
 * canonical layout for their count (lerped by `coherence`) and guarantees a prominent face — so a
 * creature reads as a real body plan no matter how far mutation has wandered. Decorative parts and
 * proportions are left alone (that is the "coherent weird"). Operates on a clone — the input is pure.
 */
export function developBauplan(genome: Genome): Genome {
  const g = structuredClone(genome) as Genome;
  const coh = clamp(g.coherence ?? 1, [0, 1]);
  if (g.symmetry === 'radial') {
    ensureRadialFace(g);
  } else {
    normalizeLegs(g, coh);
    ensureBilateralFace(g);
  }
  return g;
}

const AP = GENE_BOUNDS.appendage;
const LEG_AZ_LO = 3.3;
const LEG_AZ_HI = 4.95;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** 0 → 1 over t ∈ [0, 1], eased at both ends. */
function smooth01(t: number): number {
  const u = clamp(t, [0, 1]);
  return u * u * (3 - 2 * u);
}

/** Pull a leg's azimuth into the down-and-out band — folding any up-pointing aim down first, so a
 *  leg is never broken (pointing up); `coherence` then snaps it toward the canonical band. */
function pullLegAzimuth(az: number, coh: number): number {
  let a = az % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  if (a < Math.PI) a = Math.PI * 2 - a; // up → down
  const canon = a < LEG_AZ_LO ? LEG_AZ_LO : a > LEG_AZ_HI ? LEG_AZ_HI : a;
  return lerp(a, canon, coh);
}

/** Trunk pitch per link at which a body begins to count as reared upright, and at which it wholly is
 *  (a songbird leans −0.25 at most; a hawk stands a little way into the band, −0.285 to −0.3 — its
 *  legs a third of the way up its body; an ape −0.34 or more). */
const UPRIGHT_FROM = -0.27;
const UPRIGHT_FULL = -0.34;
/** …and the pitch from which a rearing trunk's hip joints begin to move to the back of its pelvis */
const HIP_BACK_FROM = -0.255;

/**
 * How reared a trunk of this pitch per link is: 0 a level body … 1 one standing upright off its hips.
 * By degrees, not at a line: with a single threshold at −0.26, one small mutation of a hawk's lean
 * (−0.255) took its legs from mid-body to its rump and its belly's swell away — a chick on two pegs
 * under its back third in every other litter. Across the band the legs slide and the swell fades.
 */
export function rearedness(pitch: number): number {
  const t = clamp((UPRIGHT_FROM - pitch) / (UPRIGHT_FROM - UPRIGHT_FULL), [0, 1]);
  return t * t * (3 - 2 * t);
}

/** where the hips of a reared biped sit: its pelvis, the trunk's bottom end */
const PELVIS_SLOT = 0.06;

/** The canonical slot of a one-pair body's legs on a trunk of this pitch: a level walker's balance
 *  point mid-body (a bird's, a raptor's), sliding to the pelvis as the trunk rears (an ape's). */
export function bipedSlot(pitch: number): number {
  return lerp(legSlots(1)[0], PELVIS_SLOT, rearedness(pitch));
}
/** a crab's walking legs: how widely they fan fore and aft by their slot (rad per unit of attachT), and
 *  how far back the whole set sweeps (rad) */
export const DECAPOD_FAN: readonly [number, number] = [1.05, 0.2];

/** how far under the body a radial creature's tentacles take root (the pull of their seat toward −Y) */
const TENTACLE_ROOT = 1.2;
/** each of a radial body's tentacles bends to one side by up to half this a link, and lifts its tip by
 *  up to this a link (rad; a negative pitch curls a sprawled arm up — none is bent down into the floor) */
const ARM_SWAY = 0.24;
const ARM_LIFT = 0.06;

function normalizeLegs(g: Genome, coh: number): void {
  // every leg-bearing section: the trunk, or an arthropod's thorax ahead of its abdomen
  for (let s: SegmentGene | undefined = g.body; s; s = s.child) normalizeSectionLegs(s, s === g.body, coh);
}

function normalizeSectionLegs(seg: SegmentGene, trunk: boolean, coh: number): void {
  const legs = seg.appendages.filter((p) => p.kind === 'leg');
  const pairs = legs.length;
  if (pairs === 0) return;
  // a REARED biped (the trunk pitched up off its hips: an ape, a kangaroo, a humanoid) stands on
  // its pelvis — the trunk's bottom end — not at a horizontal walker's balance point mid-body (a
  // bird's or a raptor's), where the legs sprouted from its belly
  const slots = pairs === 1 && trunk ? [bipedSlot(seg.curve[0])] : trunk && isRinged(seg, 0) ? ringSlots(pairs) : legSlots(pairs);
  legs.sort((x, y) => x.attachT - y.attachT); // front-to-back; assign slots in order
  legs.forEach((leg, i) => {
    leg.pair = true; // legs are always mirrored
    leg.attachT = clamp(lerp(leg.attachT, slots[i], coh), AP.attachT);
    leg.attachAzimuth = pullLegAzimuth(leg.attachAzimuth, coh);
    leg.attachElevation = lerp(leg.attachElevation, 0, coh); // legs don't tilt fore/aft
    leg.roll = lerp(leg.roll, 0, coh);
  });
}

/** A body section past the trunk carrying three or more leg pairs: an arthropod's thorax (an insect's)
 *  or cephalothorax (a spider's), with a legless abdomen behind it — its joints are pinched waists. */
function isTagma(seg: SegmentGene, depth: number): boolean {
  if (depth < 1) return false;
  let pairs = 0;
  for (const a of seg.appendages) if (a.kind === 'leg') pairs++;
  return pairs >= 3;
}

/** A trunk of five or more links carrying five or more leg pairs: a MYRIAPOD's — a centipede's, a
 *  trilobite's, a woodlouse's — a chain of rings with a leg pair to each (see RING_SWELL). */
export function isRinged(seg: SegmentGene, depth: number): boolean {
  if (depth !== 0 || seg.repeat < 5) return false;
  let pairs = 0;
  for (const a of seg.appendages) if (a.kind === 'leg') pairs++;
  return pairs >= 5;
}

/** Whether a creature's legs end in points drawn past their last nodes (a myriapod's: see RING_POINT). */
export function pointedLegs(g: Genome): boolean {
  return g.symmetry === 'bilateral' && isRinged(g.body, 0);
}

/** The section that carries the legs (the most of them): the trunk, or an arthropod's thorax. */
export function legBearer(g: Genome): SegmentGene {
  let best = g.body;
  let most = 0;
  for (let s: SegmentGene | undefined = g.body; s; s = s.child) {
    const n = s.appendages.filter((a) => a.kind === 'leg').length;
    if (n > most) {
      most = n;
      best = s;
    }
  }
  return best;
}

/** The head = the front-most body section (the deepest `child`), or the trunk if there is none. */
function frontSegment(g: Genome): SegmentGene {
  let s = g.body;
  while (s.child) s = s.child;
  return s;
}

function ensureBilateralFace(g: Genome): void {
  const head = frontSegment(g);
  const girth = (head.size[0] + head.size[1]) / 2;
  // (the muzzle of a head with a stop is slimmer than its chain's taper alone makes it)
  let depth = 0;
  for (let s = g.body; s.child; s = s.child) depth++;
  const stop = headStop(head, depth);
  const links = Math.max(0, head.repeat - 1);
  const frontR = girth * Math.pow(head.taper, links) * muzzleShare(links, links, stop);
  // (a head that carries legs is a spider's cephalothorax: its eyes are a cluster, see OCELLI)
  ensureFace(head.appendages, girth, frontR, head.repeat > 1 && !!g.body.child, depth > 0 && head.appendages.some((a) => a.kind === 'leg'));
}

/** Guarantee a prominent eye-set + a mouth (M24/M19): synthesize them if mutation deleted them,
 *  and floor the sizes so they always read. The mouth is kept on the face front. */
// a paired eye's azimuth stays at least this far (rad) off the vertical midline
const EYE_AZ_MAX = 1.1;
function ensureFace(apps: AppendageGene[], girth: number, frontR = girth, linkedHead = false, cephalothorax = false): void {
  const eyes = apps.filter((p) => p.terminal === 'eye');
  if (eyes.length === 0) apps.push(faceEye(girth));
  else
    for (const [k, e] of eyes.entries()) {
      // a spider's eyes: each pair in its own place in the cluster on the front of its carapace (OCELLI)
      if (cephalothorax && e.pair && k < OCELLI.length) {
        const [x, y, s] = OCELLI[k];
        e.attachAzimuth = Math.atan2(y, x);
        e.attachElevation = Math.acos(Math.min(1, Math.hypot(x, y)));
        e.thickness = k === 0 ? clamp(Math.max(EYE_R_MIN, girth * s), AP.thickness) : Math.max(R_MIN, girth * s);
        continue;
      }
      // Prominent but PROPORTIONATE. The floor is measured against the head segment's girth, while
      // the head *node* tapers smaller than that — so a bare `girth * 0.45` floor grew eyes nearly
      // as wide as the skull, two balls that owned the whole face and occluded the mouth behind
      // them. Keep a floor (M19: eyes are the emotional anchor) but cap it against the same girth.
      // Cap for proportion FIRST, then floor for prominence — in the other order the cap wins on
      // small-headed creatures (girth < 0.28) and silently defeats the floor it was paired with,
      // leaving eyes smaller than M19 promises. Prominence outranks proportion when they collide.
      e.thickness = clamp(Math.max(0.075, Math.min(Math.max(e.thickness, girth * 0.17), girth * 0.26)), AP.thickness);
      // and keep them off the snout tip, so the muzzle front belongs to the mouth — an eye on the
      // CRANIUM of a multi-link head (the muzzle runs on ahead, lower and narrower) may look forward,
      // a cat's or an ape's gaze; one on a plain head's front stays at 0.75 (~47° to the side)
      const cranium = linkedHead && e.attachT < 0.35;
      e.attachElevation = clamp(Math.min(e.attachElevation, cranium ? 1.15 : 0.75), AP.attachElevation);
      // a PAIR aimed near straight up (or down) lands both eyes on the midline as one merged ball —
      // fold the azimuth off it so the mirrored eyes always clear each other
      if (e.pair && Math.abs(Math.cos(e.attachAzimuth)) < Math.cos(EYE_AZ_MAX)) {
        const up = Math.sin(e.attachAzimuth) >= 0;
        const right = Math.cos(e.attachAzimuth) >= 0;
        e.attachAzimuth = up ? (right ? EYE_AZ_MAX : Math.PI - EYE_AZ_MAX) : right ? 2 * Math.PI - EYE_AZ_MAX : Math.PI + EYE_AZ_MAX;
      }
    }

  const mouths = apps.filter((p) => p.terminal === 'mouth');
  if (mouths.length === 0) apps.push(faceMouth(girth));
  else
    for (const m of mouths) {
      // a big, clearly-read mouth — but never wider than the snout link that carries it (a mammal's
      // muzzle is far narrower than its cranium; a skull-sized floor wrapped a frog's grin around it)
      m.thickness = clamp(Math.max(m.thickness, Math.min(Math.max(0.26, girth * 0.46), frontR * 0.85)), AP.thickness);
      // Keep the maw on the FACE, not under the chin. `aim` is [cos(e)cos(a), cos(e)sin(a), sin(e)]
      // with the maw's azimuth ≈ 3π/2, so elevation IS the fore/aft tilt, and it sets where the
      // organ SEATS as well as where it points. At 0.4 the mouth aims ~66° at the ground; even at
      // 0.85 it seated behind the (large, forward-set) eyes, which occluded it entirely. 0.95 puts
      // the maw out front on the snout — the frontmost face feature, the way a muzzle reads. The
      // sampler in random.ts deliberately draws ABOVE this floor: a floor covering the whole
      // sampled range would pin every creature's mouth to one constant and kill the gene.
      // (a mouth set BACK along a head of several links — a shark's, under its snout — is on the
      // underside there by design, the snout running on ahead of it: it may aim further down)
      const underslung = linkedHead && m.attachT < 0.7;
      m.attachElevation = clamp(Math.max(m.attachElevation, underslung ? 0.5 : 0.95), AP.attachElevation);
    }
}

function ensureRadialFace(g: Genome): void {
  const apps = g.body.appendages;
  const girth = (g.body.size[0] + g.body.size[1]) / 2;
  if (!apps.some((p) => p.terminal === 'eye')) apps.push(radialEyeCrown(girth));
  if (!apps.some((p) => p.terminal === 'mouth')) apps.push(radialMaw(girth));
}

function faceEye(girth: number): AppendageGene {
  return facePart('eyestalk', 'eye', true, 0, 0.85, 0.95, 0.3, clamp(girth * 0.55, AP.length), clamp(Math.max(0.085, girth * 0.26), AP.thickness));
}
function faceMouth(girth: number): AppendageGene {
  // elevation 1.15 ≈ 24° below the forward axis — the mouth rides the front of the muzzle, the way
  // a face reads, instead of hanging beneath the jaw where nothing but the floor can see it
  return facePart('maw', 'mouth', false, 0.05, 0.92, 4.71, 1.15, clamp(girth * 0.5, AP.length), clamp(Math.max(0.2, girth * 0.42), AP.thickness));
}
function radialEyeCrown(girth: number): AppendageGene {
  // pair:false but grow arrays it radialCount× → a ring of eyes around the crown
  return facePart('eyestalk', 'eye', false, 0.85, 0.8, 0, 0.2, clamp(girth * 0.5, AP.length), clamp(Math.max(0.085, girth * 0.21), AP.thickness));
}
function radialMaw(girth: number): AppendageGene {
  // elevation ≈ +Z so grow's radial array collapses the copies onto the front centre (a central maw)
  return facePart('maw', 'mouth', false, 0.05, 0.7, 0, 1.35, clamp(girth * 0.45, AP.length), clamp(Math.max(0.2, girth * 0.4), AP.thickness));
}
function facePart(
  kind: PartKind, terminal: Terminal, pair: boolean, style: number,
  attachT: number, attachAzimuth: number, attachElevation: number, length: number, thickness: number,
): AppendageGene {
  return { kind, style, attachT, attachAzimuth, attachElevation, roll: 0, segments: 1, length, thickness, taper: 0.9, curl: [0, 0], terminal, pair };
}

// --- tiny vec/quat helpers (kept inline to keep the engine dependency-free) ----

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function qMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
function qFromAxisAngle(axis: Vec3, angle: number): Quat {
  const h = angle / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}
/** Compose a local rotation: pitch about local X, then yaw about local Y. */
function qFromEuler(pitch: number, yaw: number): Quat {
  return qMul(qFromAxisAngle([1, 0, 0], pitch), qFromAxisAngle([0, 1, 0], yaw));
}
/** Conjugate — the inverse rotation, for our unit quats (world → the node's local frame). */
function qConj(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}
/**
 * Distance from a node's centre to its SURFACE along a world-space direction. A shaped node (a long
 * snout, a broad skull, a flat croc body) is an ellipsoid, so its surface is nearer on the squashed
 * axis and further on the stretched one. Parts must seat against that true surface — otherwise a
 * stretched snout swallows the mouth it carries, and a broad flank leaves the legs hanging inside.
 * Round nodes (no scale) fall back to the scalar radius, exactly as before.
 */
function surfaceExtent(node: BodyNode, dirWorld: Vec3): number {
  const s = node.scale;
  if (!s) return node.radius;
  const d = qRotate(dirWorld, qConj(node.quat)); // into the node's local frame
  const k = Math.hypot(d[0] / (node.radius * s[0]), d[1] / (node.radius * s[1]), d[2] / (node.radius * s[2]));
  return k > 1e-6 ? 1 / k : node.radius;
}
function qRotate(v: Vec3, q: Quat): Vec3 {
  const [x, y, z, w] = q;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}
/** Shortest-arc quaternion rotating unit vector `a` onto unit vector `b`. */
/** The frame whose +Z is `d`, with its X axis level: a turn about the vertical to d's heading, then a
 *  tilt to its elevation (straight up or down has no heading — the shortest turn serves there). */
function qUpright(d: Vec3): Quat {
  if (Math.hypot(d[0], d[2]) < 1e-6) return qFromTo([0, 0, 1], d);
  return qMul(qFromAxisAngle([0, 1, 0], Math.atan2(d[0], d[2])), qFromAxisAngle([1, 0, 0], -Math.asin(Math.max(-1, Math.min(1, d[1])))));
}

function qFromTo(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) {
    // 180°: rotate about any axis perpendicular to a
    let axis: Vec3 = [a[1], -a[0], 0];
    if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-6) axis = [0, a[2], -a[1]];
    return qFromAxisAngle(norm(axis), Math.PI);
  }
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
