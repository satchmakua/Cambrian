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
function surfacePrims(p: Phenotype, surface: SkinSurface): FieldPrims {
  let per = PRIM_CACHE.get(p);
  if (!per) {
    per = new Map();
    PRIM_CACHE.set(p, per);
  }
  const hit = per.get(surface);
  if (hit) return hit;

  const prims = buildFieldPrims(p, surface === 'hybrid' ? 'hybrid' : 'body');
  if (surface !== 'kit') {
    let meanR = 0;
    for (let i = 0; i < prims.nc; i++) meanR += prims.pr[i];
    meanR = meanR / Math.max(prims.nc, 1);
    prims.k = (surface === 'hybrid' ? 0.34 : 0.5) * meanR; // mirror smoothSkin's blend exactly
  }
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
  const arc = 0.85 + hash01(seed, mouthIdx + 23) * 0.5; // how far the slit wraps around the muzzle
  const droop = 0.12 + hash01(seed, mouthIdx + 37) * 0.22;
  const muzzled = p.genomeRef.covering.type === 'fur' && JAWED.has(variant);
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
        blend: s.r * 0.2,
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
function traceCurve(
  f: FieldPrims,
  carves: readonly Carve[],
  s: MouthSpec,
  origin: Vec3,
  samples: number,
  pitch: (t: number) => number,
): MouthSample[] {
  const out: MouthSample[] = [];
  for (let i = 0; i < samples; i++) {
    const t = -1 + (2 * i) / (samples - 1);
    const yawA = t * s.arc;
    const pitchA = pitch(t);
    // direction = aim yawed about `up` by t·arc, then pitched down about the yawed `right`
    const cy = Math.cos(yawA), sy = Math.sin(yawA);
    const dirYaw: Vec3 = [
      s.aim[0] * cy + s.right[0] * sy,
      s.aim[1] * cy + s.right[1] * sy,
      s.aim[2] * cy + s.right[2] * sy,
    ];
    const cp = Math.cos(pitchA), sp = Math.sin(pitchA);
    const dir = norm3([
      dirYaw[0] * cp - s.up[0] * sp,
      dirYaw[1] * cp - s.up[1] * sp,
      dirYaw[2] * cp - s.up[2] * sp,
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
export function buildMouthLine(
  p: Phenotype,
  s: MouthSpec,
  carves: readonly Carve[] = [],
  samples = 17,
  surface: SkinSurface = 'kit',
): MouthLine {
  const f = surfacePrims(p, surface);
  // ray origin: inside the anchor node, pulled a touch back from the mouth so rays always exit
  // through the face (a mouth seated proud of a snout tip still traces onto the snout).
  const origin: Vec3 = [
    s.anchor.pos[0] - s.aim[0] * s.anchor.radius * 0.2,
    s.anchor.pos[1] - s.aim[1] * s.anchor.radius * 0.2,
    s.anchor.pos[2] - s.aim[2] * s.anchor.radius * 0.2,
  ];

  // the slit's resting pitch: mouths sit below the muzzle's midline, corners droop (heavy, grim)
  const setDown = 0.1;
  // Half-separation (radians of pitch) between the lip lines. This is the single number that
  // decides whether a mouth reads as a MOUTH or as a scratch: at 0.28·gape the lips sat ~0.1 bu
  // apart on a typical head — a hairline that swallowed its own interior and teeth. Opened up so
  // the dark throat and the tooth rows actually have room to show.
  const gapeHalf = 0.5 * s.gape + 0.14;
  // a muzzle's upper lip is part of the skull: it sits a little below the muzzle's midline and only
  // the mandible drops to open (the whole gape opens downward); everything else splits the gape
  // about the mouth line
  const upperPitch = s.muzzled
    ? (t: number) => setDown + 0.08 + s.droop * 0.5 * Math.abs(t)
    : (t: number) => setDown + s.droop * Math.abs(t) - gapeHalf * Math.cos((t * Math.PI) / 2);
  const lowerPitch = s.muzzled
    ? (t: number) => setDown + 0.08 + s.droop * 0.5 * Math.abs(t) + 2 * gapeHalf * Math.cos((t * Math.PI) / 2)
    : (t: number) => setDown + s.droop * Math.abs(t) + gapeHalf * Math.cos((t * Math.PI) / 2);

  const upper = traceCurve(f, [], s, origin, samples, upperPitch);
  const lower = traceCurve(f, carves, s, origin, samples, lowerPitch);

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
