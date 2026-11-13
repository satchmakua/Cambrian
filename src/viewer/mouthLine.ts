/**
 * The mouth line (mouth overhaul) — ONE closed curve on the true skin that every piece of mouth
 * geometry anchors to. Pure math, no three.js (headless-testable).
 *
 * A real mouth is not an object stuck in front of a face; it is a slit IN the face: lips wrap a
 * closed curve on the skin, teeth root in gum ridges just inside that curve, the interior is a
 * recess. So instead of hand-placed primitive assemblies (the old "sandwich" jaws with teeth
 * hovering at idealized offsets), the mouth is DERIVED: rays fan out from inside the head across
 * the mouth's arc, each is traced to the true body-field surface (`bodyField`), and the resulting
 * samples carry tangent frames. Lips sweep along these curves; tooth roots interpolate them —
 * nothing can float, by construction.
 *
 * The same module derives the `Carve` ops (`mouthCarves`) that subtract the actual cavity from the
 * smooth-skin field, so the curve, the carve, and the teeth all agree on one geometry. Everything
 * is deterministic from the phenotype (seeded via the engine's unitHash — no Math.random).
 */
import type { Phenotype, BodyNode } from '../engine/grow';
import type { Vec3 } from '../engine/genome';
import { unitHash } from '../engine/rng';
import {
  buildFieldPrims,
  carveDist,
  cross3,
  dot3,
  norm3,
  projectToSurface,
  qRotateV,
  rayToSurface,
  type Carve,
  type FieldPrims,
} from './bodyField';
import { mouthVariant, type MouthVariant } from './partStyles';

export interface MouthSample {
  t: number; // −1 (left corner) … 0 (front center) … +1 (right corner)
  p: Vec3; // on-surface point
  n: Vec3; // outward surface normal
  tan: Vec3; // curve tangent, pointing toward +t
  away: Vec3; // in-surface direction pointing AWAY from the mouth opening (up for the top lip,
  //            down for the bottom) — teeth emerge along −away, lips thicken along ±away
}

export interface MouthLine {
  upper: MouthSample[]; // corner → corner along the top lip line
  lower: MouthSample[]; // corner → corner along the bottom lip line (dropped by the gape)
  width: number; // world corner-to-corner distance
  /** a muzzled mouth's nose seat: the skin point up the muzzle front from the upper lip's centre */
  nose: { p: Vec3; n: Vec3 } | null;
}

/** Everything the mouth builds agree on — derived once, used by lips, teeth, carves, animation. */
export interface MouthSpec {
  idx: number; // the mouth node's index in p.nodes
  variant: MouthVariant;
  r: number; // feature radius (the scale every offset is a multiple of)
  gape: number; // 0 closed … 1 agape — deterministic per creature, always a little open
  arc: number; // corner half-angle around the muzzle (rad) — how far the slit wraps
  droop: number; // extra downward pitch at the corners (rad) — a grim, heavy mouth
  /** a mammal mouth (furred, jawed): it rides a muzzle, rests CLOSED, and opens by dropping the
   *  mandible only — the upper lip stays put on the muzzle the way a skull stays put */
  muzzled: boolean;
  node: BodyNode;
  anchor: BodyNode; // the body node the mouth seats on (ray origin lives inside it)
  aim: Vec3; // world outward aim (+Z of the mouth frame)
  right: Vec3; // world +X of the mouth frame
  up: Vec3; // world +Y of the mouth frame
}

// The jawed family carves a wedge maw; ring mouths carve a funnel; hard/tube mouths don't carve.
const WEDGE: ReadonlySet<MouthVariant> = new Set(['herbivore', 'maw', 'fanged', 'baleen']);
const JAWED: ReadonlySet<MouthVariant> = new Set(['herbivore', 'maw', 'fanged']);
const FUNNEL: ReadonlySet<MouthVariant> = new Set(['sucker', 'lamprey']);

/**
 * Which rendered skin the mouth is being traced for. The capsule kit is the HARD union (k = 0);
 * the smooth/hybrid skins are the SOFT union with smoothSkin's blend radii — tracing on the wrong
 * one buries lips under the inflated blend (or floats them off the kit). Builders default to
 * 'kit'; CreatureMesh passes the mode it actually renders.
 */
export type SkinSurface = 'kit' | 'smooth' | 'hybrid';

// One field per (phenotype, surface), shared by every mouth on that creature. The mouth path only
// ever READS the prims (ray/Newton tracing), so sharing is safe — and it collapses the per-mouth
// rebuild that made many-mouthed radial bodies (an 8-maw urchin) pay for the field 8 times over.
// Keyed weakly on the phenotype, so caches die with the creature.
const PRIM_CACHE = new WeakMap<Phenotype, Map<SkinSurface, FieldPrims>>();

/** Field prims tuned to the rendered surface (the same blend k smoothSkin uses, per mode). */
export function surfacePrims(p: Phenotype, surface: SkinSurface): FieldPrims {
  let per = PRIM_CACHE.get(p);
  if (!per) {
    per = new Map();
    PRIM_CACHE.set(p, per);
  }
  const hit = per.get(surface);
  if (hit) return hit;

  const prims = buildFieldPrims(p, surface === 'hybrid' ? 'hybrid' : 'body');
  if (surface !== 'kit') prims.k = (surface === 'hybrid' ? 0.34 : 0.5) * prims.meanR; // mirror smoothSkin's blend exactly
  per.set(surface, prims);
  return prims;
}

/** Deterministic per-creature 0..1 from the genome seed + a salt (the viewer-side jig, but seeded). */
export function hash01(seed: number, salt: number): number {
  return unitHash(seed, salt);
}

/** Locate the body node a mouth seats on: walk parents until a node that is part of the skin field. */
function findAnchor(p: Phenotype, mouthIdx: number): BodyNode {
  const parentOf = new Map<number, number>();
  for (const [a, b] of p.edges) parentOf.set(b, a);
  let cur: number | undefined = mouthIdx;
  for (let hops = 0; hops < 16; hops++) {
    cur = parentOf.get(cur);
    if (cur === undefined) break;
    const n = p.nodes[cur];
    if (n.kind === 'spine' || n.part == null) return n;
    if (n.part.kind !== 'maw') return n; // any non-mouth limb node is on the skin
  }
  return p.nodes[mouthIdx]; // degenerate topology — anchor on the mouth itself
}

/** Build the spec for one mouth node (null if the node isn't a mouth). */
export function mouthSpec(p: Phenotype, mouthIdx: number): MouthSpec | null {
  const node = p.nodes[mouthIdx];
  if (!node || node.terminal !== 'mouth') return null;
  const style = node.part?.style ?? 0.5;
  const variant = mouthVariant(style);
  const seed = p.genomeRef.seed;
  const r = Math.max(node.radius, 0.06);
  // Always a little open (a closed neutral mouth reads friendly/cartoon; a slight gape reads alive
  // and hungry), opening wider by a deterministic per-creature draw. Fanged maws hang wider.
  const base = variant === 'fanged' ? 0.34 : variant === 'maw' ? 0.26 : 0.16;
  const gape = base + hash01(seed, mouthIdx + 11) * 0.38;
  const muzzled = p.genomeRef.covering.type === 'fur' && JAWED.has(variant);
  // how far the slit wraps around the muzzle — a mammal's lip line ends under the eye, not back by
  // the ear (a long wrap read as a cartoon grin)
  const arc = (muzzled ? 0.62 : 0.85) + hash01(seed, mouthIdx + 23) * (muzzled ? 0.22 : 0.5);
  // How far the corners fall below level. A seam (a reptile's, a fish's, a shark's) a little: no longer
  // lifted by the sweep (see traceCurve), the old droop of a fifth of a radian and more turned it down
  // into a frown. A muzzle's lip line falls back to its corners, as a dog's or an ape's does — and it
  // wraps a round muzzle, which seen from above and in front bends a level line up into a grin.
  const droop = muzzled ? 0.34 + hash01(seed, mouthIdx + 37) * 0.22 : 0.03 + hash01(seed, mouthIdx + 37) * 0.08;
  return {
    idx: mouthIdx,
    variant,
    r,
    gape,
    arc,
    droop,
    muzzled,
    node,
    anchor: findAnchor(p, mouthIdx),
    aim: qRotateV(node.quat, [0, 0, 1]),
    right: qRotateV(node.quat, [1, 0, 0]),
    up: qRotateV(node.quat, [0, 1, 0]),
  };
}

/** All of a phenotype's mouth specs (usually one — the guaranteed face). */
export function mouthSpecs(p: Phenotype): MouthSpec[] {
  const out: MouthSpec[] = [];
  for (let i = 0; i < p.nodes.length; i++) {
    if (p.nodes[i].terminal === 'mouth') {
      const s = mouthSpec(p, i);
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * The cavity `Carve` ops for every mouth on the body — what the smooth skin subtracts so the maw
 * is a true recess. Jawed mouths carve a wide flat wedge; ring mouths a deep round funnel. Every
 * carve is then shrunk until it spares the eyes: a cavity that eats the flesh BEHIND an eye
 * leaves the eyeball hovering over a crater (measured on ~37% of carve-bearing creatures before
 * this clamp), and the eye is the emotional anchor — it always wins over maw size.
 */
export function mouthCarves(p: Phenotype): Carve[] {
  const out: Carve[] = [];
  for (const s of mouthSpecs(p)) {
    let carve: Carve | null = null;
    // a jawed mouth rests closed: a cavity behind shut lips is never seen, only felt as a dent (and
    // seen through the parted rim as a dark gaping maw). Funnels and baleen slots still carve.
    if (JAWED.has(s.variant)) continue;
    if (WEDGE.has(s.variant)) {
      const depth = s.r * (0.85 + s.gape * 0.3);
      carve = {
        pos: [
          s.node.pos[0] - s.aim[0] * depth * 0.42,
          s.node.pos[1] - s.aim[1] * depth * 0.42,
          s.node.pos[2] - s.aim[2] * depth * 0.42,
        ],
        quat: [...s.node.quat] as [number, number, number, number],
        radii: [s.r * 1.2, s.r * (0.38 + s.gape * 0.5), depth],
        blend: s.r * 0.26,
        band: s.r * 0.4,
      };
    } else if (FUNNEL.has(s.variant)) {
      const depth = s.r * 1.35;
      carve = {
        pos: [
          s.node.pos[0] - s.aim[0] * depth * 0.5,
          s.node.pos[1] - s.aim[1] * depth * 0.5,
          s.node.pos[2] - s.aim[2] * depth * 0.5,
        ],
        quat: [...s.node.quat] as [number, number, number, number],
        radii: [s.r * 0.78, s.r * 0.78, depth],
        // (a soft rim, the skin rounding over into the hole: cut at a fifth of the mouth's size, the
        // hole's edge stair-stepped in the mesh and caught the light — a torn white rim)
        blend: s.r * 0.36,
        band: s.r * 0.55,
      };
    }
    if (carve) out.push(spareTheEyes(p, carve));
  }
  return out;
}

/** Shrink a carve (deterministically, bounded) until every eye keeps solid flesh behind it. */
function spareTheEyes(p: Phenotype, c: Carve): Carve {
  // the flesh an eye needs: the point its bulb is seated over, just inside the skin
  const backings: { pt: Vec3; margin: number }[] = [];
  for (const n of p.nodes) {
    if (n.terminal !== 'eye') continue;
    const aim = qRotateV(n.quat, [0, 0, 1]);
    const back = 1.5 * n.radius;
    backings.push({
      pt: [n.pos[0] - aim[0] * back, n.pos[1] - aim[1] * back, n.pos[2] - aim[2] * back],
      margin: n.radius * 0.3,
    });
  }
  let cur = c;
  for (let i = 0; i < 6; i++) {
    const hit = backings.some((b) => carveDist(cur, b.pt[0], b.pt[1], b.pt[2]) < b.margin + cur.blend);
    if (!hit) break;
    cur = {
      ...cur,
      radii: [cur.radii[0] * 0.8, cur.radii[1] * 0.8, cur.radii[2] * 0.8],
      blend: cur.blend * 0.85,
      band: cur.band * 0.85,
    };
  }
  return cur;
}

/**
 * Trace one lip curve: rays fan from inside the anchor across the arc, pitched by `pitch(t)`
 * (radians below the aim; positive = downward), each traced to the skin. `carves` lets the lower
 * lip land on the carved cavity rim instead of the pristine skin.
 */
/** a seam mouth's half-gape at its least (rad): parted enough to read as a mouth, not to arch */
const SEAM_GAPE = 0.05;
/** …and how far its corners fall below its middle (× the mouth's size): a hair, not a frown */
const SEAM_DROP = 0.04;

/**
 * Trace a lip at the pitches `pitch` gives, then nudge each sample's pitch (secant steps: a point at
 * distance d from the origin moves about d·Δpitch) until its height along `up` is `target(t, the
 * middle's height)`. The middle sample keeps its pitch.
 */
function levelCurve(
  f: FieldPrims,
  carves: readonly Carve[],
  s: MouthSpec,
  origin: Vec3,
  samples: number,
  pitch: (t: number) => number,
  up: Vec3,
  target: (t: number, midH: number) => number,
): MouthSample[] {
  const mid = samples >> 1;
  const offs = new Float64Array(samples);
  const at = (t: number) => pitch(t) + offs[Math.round(((t + 1) / 2) * (samples - 1))];
  let out = traceCurve(f, carves, s, origin, samples, at);
  for (let it = 0; it < 6; it++) {
    const mh = dot3(out[mid].p, up);
    let worst = 0;
    for (let i = 0; i < samples; i++) {
      if (i === mid) continue;
      const t = -1 + (2 * i) / (samples - 1);
      const err = dot3(out[i].p, up) - target(t, mh); // too high: pitch further down
      const q = out[i].p;
      const d = Math.hypot(q[0] - origin[0], q[1] - origin[1], q[2] - origin[2]);
      offs[i] = Math.max(-LEVEL_MAX, Math.min(LEVEL_MAX, offs[i] + err / Math.max(d, 1e-3)));
      worst = Math.max(worst, Math.abs(err));
    }
    if (worst < 1e-3 * s.r) break;
    out = traceCurve(f, carves, s, origin, samples, at);
  }
  return out;
}
/** the most a sample's pitch is nudged to level it (rad) */
const LEVEL_MAX = 0.7;

/** a mouth aimed closer than this (cosine) to the head's vertical sweeps about its own up instead */
const SWEEP_ALONG = 0.9;

/** `v` turned by `a` about the unit axis `k` (Rodrigues) */
function rotateAbout(v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a), sn = Math.sin(a);
  const kv = cross3(k, v);
  const d = dot3(k, v) * (1 - c);
  return [v[0] * c + kv[0] * sn + k[0] * d, v[1] * c + kv[1] * sn + k[1] * d, v[2] * c + kv[2] * sn + k[2] * d];
}

function traceCurve(
  f: FieldPrims,
  carves: readonly Carve[],
  s: MouthSpec,
  origin: Vec3,
  samples: number,
  pitch: (t: number) => number,
): MouthSample[] {
  const out: MouthSample[] = [];
  // The line sweeps across the face about the HEAD's vertical, not about the mouth's own up. A mouth
  // aims down onto the front of the face, so its up leans forward; swept about that, the lip line was
  // a circle on a tilted plane, and from in front its corners rose above its middle — a cartoon grin
  // on every face. About the head's vertical the corners keep the middle's height, and the droop alone
  // bends them. (A mouth aimed along the head's vertical — under a sea star — sweeps about its own up.)
  const headUp = norm3(qRotateV(s.anchor.quat, [0, 1, 0]));
  const axis = Math.abs(dot3(headUp, s.aim)) < SWEEP_ALONG ? headUp : s.up;
  // (turned the way the mouth's own frame turns: +t toward its right)
  const turn = dot3(cross3(axis, s.aim), s.right) < 0 ? -1 : 1;
  for (let i = 0; i < samples; i++) {
    const t = -1 + (2 * i) / (samples - 1);
    const yawA = t * s.arc * turn;
    const pitchA = pitch(t);
    // direction = aim yawed about the sweep axis by t·arc, then pitched down about the yawed `right`
    const dirYaw = rotateAbout(s.aim, axis, yawA);
    const upYaw = rotateAbout(s.up, axis, yawA);
    const cp = Math.cos(pitchA), sp = Math.sin(pitchA);
    const dir = norm3([
      dirYaw[0] * cp - upYaw[0] * sp,
      dirYaw[1] * cp - upYaw[1] * sp,
      dirYaw[2] * cp - upYaw[2] * sp,
    ]);
    const hit =
      rayToSurface(f, carves, origin, dir) ??
      projectToSurface(f, carves, [
        origin[0] + dir[0] * s.r,
        origin[1] + dir[1] * s.r,
        origin[2] + dir[2] * s.r,
      ]);
    out.push({ t, p: hit.p, n: hit.n, tan: [1, 0, 0], away: [0, 1, 0] });
  }
  // tangents from neighbors; `away` = in-surface normal to the curve, signed to point off the mouth
  for (let i = 0; i < samples; i++) {
    const a = out[Math.max(0, i - 1)].p;
    const b = out[Math.min(samples - 1, i + 1)].p;
    const tan = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const sm = out[i];
    sm.tan = tan;
    const away = norm3(cross3(sm.n, tan));
    sm.away = away;
  }
  return out;
}

/**
 * Build the full mouth line: an upper and a lower lip curve on the true skin, meeting at the
 * corners, separated in the middle by the gape. Pass the same `carves` given to the smooth skin
 * so the lower lip hugs the carved rim; pass `[]` for the capsule-kit surface.
 */
/** how squarely a lip's skin must face the way the head does to count as the face (cos of the angle) */
const FACE_MIN = 0.45;
/** …and a lip on skin facing more squarely down than this lies under the head (cos of the angle) */
const UNDERSIDE = 0.8;
/** a head node stretched longer than this (× its radius) is a snout, its mouth along its jaw line */
const LONG_SNOUT = 1.3;
/** a mandibled mouth is at most this many of its own radii from corner to corner */
const MANDIBLE_SPAN = 2.0;
/** …and so is a mouth set on a headless body's trunk (a slug's): its line's span is an angle about the
 *  whole body there, and it ran from flank to flank — a grin across the front of the animal */
const TRUNK_MOUTH_SPAN = 2.4;

export function buildMouthLine(
  p: Phenotype,
  spec: MouthSpec,
  carves: readonly Carve[] = [],
  samples = 17,
  surface: SkinSurface = 'kit',
): MouthLine {
  let s = spec;
  const f = surfacePrims(p, surface);
  // ray origin: inside the anchor node, pulled a touch back from the mouth so rays always exit
  // through the face (a mouth seated proud of a snout tip still traces onto the snout).
  const origin: Vec3 = [
    s.anchor.pos[0] - s.aim[0] * s.anchor.radius * 0.2,
    s.anchor.pos[1] - s.aim[1] * s.anchor.radius * 0.2,
    s.anchor.pos[2] - s.aim[2] * s.anchor.radius * 0.2,
  ];

  // the slit's resting pitch: mouths sit below the muzzle's midline, corners droop (heavy, grim)
  let setDown = 0.1;
  let droop = s.droop;
  // Half-separation (radians of pitch) between the lip lines. This is the single number that
  // decides whether a mouth reads as a MOUTH or as a scratch: at 0.28·gape the lips sat ~0.1 bu
  // apart on a typical head — a hairline that swallowed its own interior and teeth. Opened up so
  // the dark throat and the tooth rows actually have room to show.
  let gapeHalf = 0.5 * s.gape + 0.14;
  // …but a jawed mouth that shuts as a seam (a reptile's, a frog's, a fish's, a slug's) parts only a
  // sliver: its lips split the gape about the line, so the upper one arched up in the middle by as
  // much as a fifth of a radian and more, and from in front the seam was a frown on every such face
  if (!s.muzzled && JAWED.has(s.variant)) gapeHalf = SEAM_GAPE + 0.08 * s.gape;
  // a muzzle's upper lip is part of the skull: it sits a little below the muzzle's midline and only
  // the mandible drops to open (the whole gape opens downward); everything else splits the gape
  // about the mouth line
  const upperPitch = s.muzzled
    ? (t: number) => setDown + 0.08 + droop * 0.5 * Math.abs(t)
    : (t: number) => setDown + droop * Math.abs(t) - gapeHalf * Math.cos((t * Math.PI) / 2);
  const lowerPitch = s.muzzled
    ? (t: number) => setDown + 0.08 + droop * 0.5 * Math.abs(t) + 2 * gapeHalf * Math.cos((t * Math.PI) / 2)
    : (t: number) => setDown + droop * Math.abs(t) + gapeHalf * Math.cos((t * Math.PI) / 2);

  let upper = traceCurve(f, [], s, origin, samples, upperPitch);
  let lower = traceCurve(f, carves, s, origin, samples, lowerPitch);
  // A lip stays on the FACE. On a flat head (a frog's, a newt's) the face is a thin band round its
  // rim, and a mouth pitched for a round head slid off it: the lower lip under the chin, the drooping
  // corners round under the jaw — it hung below the head as a loose hooked loop. While any of it lies
  // on the head's underside, or the lips' centres off its front, the mouth closes a little, droops
  // less and rides higher (a round head's lips already sit on its face: nothing changes there).
  // (Judged against the head's own axes, not the mouth's aim: a mouth aimed down a little counts the
  // underside of the chin as facing it.) Exempt: a muzzle, whose mandible drops by design and whose
  // lower lip rides the chin; and a long snout (a croc's, a lizard's), whose mouth runs back along
  // its jaw line on the snout's underside edge — that is where its mouth is.
  const mid = samples >> 1;
  const fwd = qRotateV(s.anchor.quat, [0, 0, 1]);
  const down = qRotateV(s.anchor.quat, [0, -1, 0]);
  const offFace = () =>
    dot3(upper[mid].n, fwd) < FACE_MIN || dot3(lower[mid].n, fwd) < FACE_MIN || lower.some((sm) => dot3(sm.n, down) > UNDERSIDE);
  const snout = (s.anchor.scale?.[2] ?? 1) > LONG_SNOUT;
  // (nor a radial body: it has no head, and its mouth is where it is — under the disc, say)
  const headed = p.genomeRef.symmetry !== 'radial';
  for (let k = 0; k < 5 && headed && !s.muzzled && !snout && offFace(); k++) {
    gapeHalf *= 0.72;
    droop *= 0.6;
    setDown -= 0.06;
    upper = traceCurve(f, [], s, origin, samples, upperPitch);
    lower = traceCurve(f, carves, s, origin, samples, lowerPitch);
  }

  // A MANDIBLED mouth is a small one: its blades hinge at its corners and close across it, so it is
  // no wider than they reach. (The line's span is an angle about the body it sits on: on a head that
  // is a mouth's width — on a crab, whose mouth sits on its trunk, the lips ran the whole breadth of
  // the animal, a dark wire strung under its front from claw to claw.)
  const onTrunk = headed && p.nodes[p.edges.find(([, b]) => b === s.idx)?.[0] ?? 0]?.segment === 0 && !p.nodes.some((n) => n.kind === 'spine' && (n.segment ?? 0) > 0);
  const span = s.variant === 'mandibles' ? MANDIBLE_SPAN : onTrunk ? TRUNK_MOUTH_SPAN : 0;
  if (span > 0) {
    for (let k = 0; k < 5; k++) {
      const a = upper[0].p, b = upper[samples - 1].p;
      const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (w <= span * s.r) break;
      s = { ...s, arc: (s.arc * span * s.r) / w };
      upper = traceCurve(f, [], s, origin, samples, upperPitch);
      lower = traceCurve(f, carves, s, origin, samples, lowerPitch);
    }
  }

  // A SEAM lies level across the face. Swept at one pitch, a ray to the side of a narrow snout met the
  // skin sooner and dropped less than the one down the middle, so the corners rose (a theropod's grin),
  // and on a broad round head they fell (a frog's frown). Each sample's pitch is nudged until it sits at
  // the middle's height on the head's own vertical, less a hair at the corners; the lower lip runs
  // below the upper by the gape in the middle and meets it at the corners.
  if (headed && !s.muzzled && JAWED.has(s.variant)) {
    const headUp = norm3(qRotateV(s.anchor.quat, [0, 1, 0]));
    const h = (q: Vec3) => dot3(q, headUp);
    const drop = (t: number) => SEAM_DROP * s.r * Math.abs(t);
    upper = levelCurve(f, [], s, origin, samples, upperPitch, headUp, (t, mh) => mh - drop(t));
    const uMid = h(upper[mid].p);
    lower = levelCurve(f, carves, s, origin, samples, lowerPitch, headUp, (t, mh) => uMid - drop(t) - (uMid - mh) * Math.cos((t * Math.PI) / 2));
  }

  // weld the corners exactly (shared start/end), then fix `away` signs: the top lip's `away`
  // points up-face (away from the opening), the bottom lip's points down-chin.
  lower[0] = { ...upper[0] };
  lower[samples - 1] = { ...upper[samples - 1] };
  for (const sm of upper) if (dot3(sm.away, s.up) < 0) flipAway(sm);
  for (const sm of lower) if (dot3(sm.away, s.up) > 0) flipAway(sm);

  const cl = upper[0].p;
  const cr = upper[samples - 1].p;
  // the nose: straight up the muzzle front from the upper lip's centre — the same ray fan, pitched
  // above the lip line, so it lands on the muzzle tip whatever the skull's shape
  let nose: MouthLine['nose'] = null;
  if (s.muzzled) {
    const pitch = upperPitch(0) - 0.62;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dir = norm3([s.aim[0] * cp - s.up[0] * sp, s.aim[1] * cp - s.up[1] * sp, s.aim[2] * cp - s.up[2] * sp]);
    const hit = rayToSurface(f, [], origin, dir);
    if (hit) nose = { p: hit.p, n: hit.n };
  }
  return {
    upper,
    lower,
    width: Math.hypot(cr[0] - cl[0], cr[1] - cl[1], cr[2] - cl[2]),
    nose,
  };
}

function flipAway(sm: MouthSample): void {
  sm.away = [-sm.away[0], -sm.away[1], -sm.away[2]];
}

/**
 * A CLOSED ring on the true skin around the mouth's aim — the anchor for radial mouths (lamprey
 * funnels, suckers) and for socket collars (beak ceres, trunk roots). `spread` is the cone
 * half-angle (rad) of the fan around the aim; samples run counterclockwise seen from outside,
 * `t` ∈ [−1, 1) maps the full turn, and the LAST sample does not repeat the first (pass
 * `closed: true` to sweepTube). Each sample's `away` points radially out of the ring (away from
 * the opening), so teeth emerge inward along −away exactly like the jawed rows.
 */
export function buildMouthRing(
  p: Phenotype,
  s: MouthSpec,
  spread: number,
  carves: readonly Carve[] = [],
  samples = 20,
  surface: SkinSurface = 'kit',
): MouthSample[] {
  const f = surfacePrims(p, surface);
  const origin: Vec3 = [
    s.anchor.pos[0] - s.aim[0] * s.anchor.radius * 0.2,
    s.anchor.pos[1] - s.aim[1] * s.anchor.radius * 0.2,
    s.anchor.pos[2] - s.aim[2] * s.anchor.radius * 0.2,
  ];
  const out: MouthSample[] = [];
  const cs = Math.cos(spread);
  const ss = Math.sin(spread);
  for (let i = 0; i < samples; i++) {
    const t = -1 + (2 * i) / samples;
    const a = t * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    const dir = norm3([
      s.aim[0] * cs + (s.right[0] * ca + s.up[0] * sa) * ss,
      s.aim[1] * cs + (s.right[1] * ca + s.up[1] * sa) * ss,
      s.aim[2] * cs + (s.right[2] * ca + s.up[2] * sa) * ss,
    ]);
    const hit =
      rayToSurface(f, carves, origin, dir) ??
      projectToSurface(f, carves, [origin[0] + dir[0] * s.r, origin[1] + dir[1] * s.r, origin[2] + dir[2] * s.r]);
    out.push({ t, p: hit.p, n: hit.n, tan: [1, 0, 0], away: [0, 1, 0] });
  }
  // tangents wrap around the ring; `away` = in-surface, radially outward
  const n = out.length;
  const c = ringCenter(out);
  for (let i = 0; i < n; i++) {
    const a = out[(i - 1 + n) % n].p;
    const b = out[(i + 1) % n].p;
    const tan = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const sm = out[i];
    sm.tan = tan;
    let away = norm3(cross3(sm.n, tan));
    // sign: outward = away from the ring's center
    const rad: Vec3 = [sm.p[0] - c[0], sm.p[1] - c[1], sm.p[2] - c[2]];
    if (dot3(away, rad) < 0) away = [-away[0], -away[1], -away[2]];
    sm.away = away;
  }
  return out;
}

function ringCenter(ring: readonly MouthSample[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const s of ring) {
    c[0] += s.p[0];
    c[1] += s.p[1];
    c[2] += s.p[2];
  }
  c[0] /= ring.length;
  c[1] /= ring.length;
  c[2] /= ring.length;
  return c;
}
