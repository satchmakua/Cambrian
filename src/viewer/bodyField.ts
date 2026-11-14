/**
 * The creature's skin as an implicit field — pure math, no three.js (headless-testable; vec/quat
 * inlined per the engine house style).
 *
 * One source of truth for "where exactly is the surface?". Two consumers:
 *   - smoothSkin polygonizes the field (soft union, k > 0) into the M15 organic surface;
 *   - the mouth system (mouthLine/teeth) projects lip curves and tooth roots onto the SAME field,
 *     so face geometry is anchored to the true skin instead of hovering at idealized offsets —
 *     the root cause of the old floating teeth and glued-on "sandwich" jaws.
 *
 * The field is the smooth union of one capsule per body edge plus one ellipsoid per anisotropic
 * node (`BodyNode.scale` — shaped skulls, flat torsos), so a wedge head keeps its wedge in smooth
 * mode too. `Carve` ops subtract ellipsoidal cavities (mouth maws, lamprey funnels) with a soft
 * rim — a mouth becomes negative space cut into the head, not a lump glued in front of it.
 */
import type { Phenotype, BodyNode } from '../engine/grow';
import { quillNodes } from './quills';
import type { Vec3 } from '../engine/genome';

export interface FieldPrims {
  /** capsules, one per included edge: a→b with radius pr (round caps — joints need no spheres) */
  ax: Float64Array;
  ay: Float64Array;
  az: Float64Array;
  bx: Float64Array;
  by: Float64Array;
  bz: Float64Array;
  pr: Float64Array; // mean radius (legacy consumers: mean-girth measures, the grid floor)
  /** per-end radii: each edge is a ROUND CONE a(ra) → b(rb), so a chain of tapering nodes reads as one
   *  smooth tapered limb/trunk instead of a string of beads joined by constant-radius tubes */
  ra: Float64Array;
  rb: Float64Array;
  /** per-cone bounding sphere: centre (cx,cy,cz) and half-length hl (radius = hl + max(ra, rb)) —
   *  lets fieldAt skip any primitive that provably cannot change the smooth union at a point */
  cx: Float64Array;
  cy: Float64Array;
  cz: Float64Array;
  hl: Float64Array;
  /** ELLIPTICAL cones (spine chains with an anisotropic cross-section): a flag, the segment's local
   *  frame (the start node's orientation — +Z along the chain), and the cross-section x/y scale at each
   *  end, interpolated along the segment. A tall fish or a broad croc is then one smooth elliptical
   *  tube, instead of round cones studded with a bulging ellipsoid at every node (the caterpillar). */
  an: Uint8Array;
  aq: Float64Array; // 4·nc
  sx0: Float64Array;
  sy0: Float64Array;
  sx1: Float64Array;
  sy1: Float64Array;
  nc: number;
  /** each cone's edge: its parent node `ia` and child node `ib` (both the node itself in the one-prim-
   *  per-node fallback) — what a vertex on that cone is skinned to */
  ia: Int32Array;
  ib: Int32Array;
  /** ellipsoid nodes (per-node anisotropy): centers ec (3·ne), orientations eq (4·ne), semi-axes er (3·ne) */
  ec: Float64Array;
  eq: Float64Array;
  er: Float64Array;
  /** each ellipsoid's blend into the union, × k: 1, or its chain's own (CHAIN_BLEND) for a swimmer's snout
   *  tip (absent: all 1) */
  eb?: Float64Array;
  ne: number;
  /** CHAINS: each cone's chain id (the trunk, the neck, the head, each limb, the tail), and the cone
   *  order fieldAt walks (chain by chain). Cones of one chain meet at shared nodes of equal radius and
   *  need almost no blend; a full smooth-min there swelled every joint by up to k/4 and sagged the
   *  span between — a roll at each spine node, the caterpillar trunk. Chains blend into each other. */
  ch: Int32Array;
  ord: Int32Array;
  /** smooth-union blend radius; 0 → hard union (matches the capsule-kit surface) */
  k: number;
  /** how far an ellipsoid can overshoot its node's scalar radius (grid padding must cover this) */
  excess: number;
  /** the mean radius of the skeleton's EDGES — what a blend radius is measured against. (Not of the
   *  cones: a smoothed chain is several cones to an edge, and counting each would weigh a body's mean
   *  girth toward its trunk.) */
  meanR: number;
}

/** A subtractive ellipsoid cavity (a mouth, a funnel, an eye socket) smooth-MAXed out of the body. */
export interface Carve {
  pos: Vec3;
  quat: [number, number, number, number];
  radii: Vec3; // semi-axes in the carve's local frame (x width, y height, z depth)
  blend: number; // rim softness in world units — the fleshy lip roll where cavity meets skin
  band: number; // wet-flesh shading falloff: aFlesh fades to 0 this far outside the cavity wall
}

// The smooth body meshes only the locomotor silhouette — trunk + these limb kinds. Eyes, mouth,
// horns, wings, fins, ears, whiskers, etc. are drawn as solid features on top, so meshing them into
// the field only made thin floating lumps + gaps (M24 fix).
const BODY_PART_KINDS = new Set(['leg', 'tail', 'arm', 'tentacle', 'neck']);
export function isBodyNode(n: BodyNode): boolean {
  return n.kind === 'spine' || (n.part != null && BODY_PART_KINDS.has(n.part.kind));
}
// The HYBRID mode meshes *everything* (full part definition) except the eyes/mouth, which always draw
// as solids — best of both: an organic surface like smooth, but nothing drops out like capsules keep.
// parts whose features draw themselves completely — meshing their 1-node stub into the skin only
// raised a lump under the feature (a fish's fins and gills studded its flanks with bumps)
// (an ear's stub is as thick as the ear is wide: meshed into the skin it stood on the skull as a ball
// half the skull's own size, one under each ear — a cranium in two lobes with a cleft down the middle)
// (…and a horn: its links meshed as skin stood a fat stub under the keratin sheath drawn from its last
// node — a pencil, a fat cone with a needle on its point; the sheath is drawn whole from the skull)
const FEATURE_ONLY_KINDS = new Set(['wing', 'fin', 'gill', 'frill', 'crest', 'whisker', 'ear', 'horn']);
export function isHybridNode(n: BodyNode): boolean {
  // the carapace stub is drawn as a conforming shell of its own (smoothSkin.buildShellGeometry)
  // wings are drawn whole from the shoulder (wings.ts); fins from their root (buildFin)
  return n.terminal !== 'eye' && n.terminal !== 'mouth' && n.terminal !== 'carapace' && !FEATURE_ONLY_KINDS.has(n.part?.kind ?? '');
}

/**
 * Flatten a phenotype into field primitives. `mode` picks the node filter (locomotor body vs. every
 * part); the same fallbacks as the original smoothSkin keep the field non-empty on any topology.
 * `k` starts at 0 (hard union) — smoothSkin assigns its blend radius after measuring mean girth.
 */
/** how many cones each link of a smoothed chain is cut into */
export const CHAIN_CUTS = 3;
/** limb chains that are smooth curves (a spine's are too); a leg's or an arm's links meet at joints */
const SMOOTH_LIMBS = new Set(['tail', 'tentacle']);

/** An antenna's skin, ×its links' girth. No node grows thinner than R_MIN, so a feeler was as thick as
 *  a leg's tip — on an ant's or a centipede's small head, two pipes; drawn at its own fineness it is a
 *  feeler. */
export const ANTENNA_SLIM = 0.4;
const slimOf = (n: BodyNode): number => (n.kind !== 'spine' && n.part?.kind === 'antenna' ? ANTENNA_SLIM : 1);

/** how far below a stopped skull's axis its jaw runs (×the braincase's and the nose's radii), and its
 *  girth there (the same) — the chin a little fuller against a nose that narrows to it */
export const JAW_DROP: readonly [number, number] = [0.48, 0.42];
export const JAW_GIRTH: readonly [number, number] = [0.58, 0.92];

/** The bridge cone over a stopped skull's stop (see buildFieldPrims): from the brow, forward and up on
 *  the braincase, to the top of the muzzle's first link. */
export function bridgeOf(p: Phenotype): { a: Vec3; b: Vec3; ra: number; rb: number } | null {
  const j = jawOf(p);
  if (!j) return null;
  const c = p.nodes[j.i0];
  let m: BodyNode | null = null;
  for (const [a, b] of p.edges) if (a === j.i0 && p.nodes[b].kind === 'spine') m = p.nodes[b];
  if (!m) return null;
  const fwd = norm3([m.pos[0] - c.pos[0], m.pos[1] - c.pos[1], m.pos[2] - c.pos[2]]);
  const uu = fwd[1];
  const up = norm3([0 - fwd[0] * uu, 1 - fwd[1] * uu, 0 - fwd[2] * uu], [0, 1, 0]);
  const at = (q: readonly number[], f: number, u: number): Vec3 => [q[0] + fwd[0] * f + up[0] * u, q[1] + fwd[1] * f + up[1] * u, q[2] + fwd[2] * f + up[2] * u];
  return {
    a: at(c.pos, 0.42 * c.radius, 0.28 * c.radius),
    b: at(m.pos, 0.1 * m.radius, 0.18 * m.radius),
    ra: 0.55 * c.radius,
    rb: 0.78 * m.radius,
  };
}

/** The jaw cone under a furred skull with a stop (see buildFieldPrims), or null. */
export function jawOf(p: Phenotype): { a: Vec3; b: Vec3; ra: number; rb: number; i0: number; i1: number; edge: number } | null {
  if (p.genomeRef.covering.type !== 'fur') return null;
  let last = -1;
  for (const n of p.nodes) if (n.kind === 'spine') last = Math.max(last, n.segment ?? 0);
  if (last < 1) return null;
  const head: number[] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind === 'spine' && n.segment === last) head.push(i);
  });
  if (head.length < 3) return null;
  const c = p.nodes[head[0]], m = p.nodes[head[1]], t = p.nodes[head[head.length - 1]];
  // a stop: the muzzle well under the braincase's girth (a plain tapering chain steps far less)
  if (m.radius > 0.7 * c.radius) return null;
  const fwd = norm3([t.pos[0] - c.pos[0], t.pos[1] - c.pos[1], t.pos[2] - c.pos[2]]);
  const dd = -fwd[1];
  const down = norm3([0 - fwd[0] * dd, -1 - fwd[1] * dd, 0 - fwd[2] * dd], [0, -1, 0]);
  const at = (q: readonly number[], d: number, back: number): Vec3 => [q[0] + down[0] * d - fwd[0] * back, q[1] + down[1] * d - fwd[1] * back, q[2] + down[2] * d - fwd[2] * back];
  const edge = p.edges.findIndex(([a, b]) => a === head[0] && b === head[1]);
  return {
    a: at(c.pos, JAW_DROP[0] * c.radius, 0.05 * c.radius),
    b: at(t.pos, JAW_DROP[1] * t.radius, 0.25 * t.radius),
    ra: JAW_GIRTH[0] * c.radius,
    rb: JAW_GIRTH[1] * t.radius,
    i0: head[0],
    i1: head[head.length - 1],
    edge: edge < 0 ? 0 : edge,
  };
}

/** Catmull–Rom through p1 → p2 (p0 and p3 the neighbours), at t in [0, 1]. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t2 * t);
}

export function buildFieldPrims(p: Phenotype, mode: 'body' | 'hybrid' = 'body'): FieldPrims {
  // (an urchin's quills are drawn root to point, each one cone: quills.ts)
  const quills = new Set(mode === 'hybrid' ? [...quillNodes(p)].map((i) => p.nodes[i]) : []);
  const include = mode === 'hybrid' ? (n: BodyNode) => isHybridNode(n) && !quills.has(n) : isBodyNode;
  // an eyestalk's last link runs INTO the eyeball (which draws itself): mesh it as a thin cone ending
  // at the eye, or the eye hangs in the air above a stump
  const stalkTip = (a: BodyNode, b: BodyNode) => mode === 'hybrid' && b.terminal === 'eye' && a.kind === 'limb' && a.part?.kind === 'eyestalk';
  let bodyEdges = p.edges.filter(([a, b]) => include(p.nodes[a]) && (include(p.nodes[b]) || stalkTip(p.nodes[a], p.nodes[b])));
  // (a body with no limb of its own but its quills — an urchin without tube feet — falls back on every
  // link but those and the parts that draw themselves: on every link, its quills were skinned as beaded
  // rods, and the links to the eyes and the mouth under it hung a bulb from its underside — the urchin a
  // pear, its lower lobe through the floor)
  const quillSet = mode === 'hybrid' ? quills : new Set([...quillNodes(p)].map((i) => p.nodes[i]));
  const ownDrawn = (n: BodyNode) => quillSet.has(n) || n.terminal === 'eye' || n.terminal === 'mouth';
  if (bodyEdges.length === 0) bodyEdges = p.edges.filter(([a, b]) => !ownDrawn(p.nodes[a]) && !ownDrawn(p.nodes[b]));
  const edges = bodyEdges.length > 0 ? bodyEdges : null;

  // A CHAIN IS A CURVE. A trunk, a neck, a tail is a row of nodes, and a straight cone from each to
  // the next meets its neighbour at an angle wherever the girth or the heading changes: a crease ring
  // round the body at every node. The light picked each one out — a weasel's chest, seen from the
  // front, was a stack of bands like a grub's; a shark's belly was terraced. So each link of such a
  // chain is cut into CHAIN_CUTS cones along a spline through its nodes (their places and their
  // radii): the same body, without the corners. (A leg's links stay straight: those are joints.)
  // (…and a radial body's arms: a sea star's, cut at its joints, were strings of sausages, banded across)
  const radial = p.genomeRef.symmetry === 'radial';
  const sameChain = (a: BodyNode, b: BodyNode): boolean =>
    a.kind === 'spine' && b.kind === 'spine'
      ? (a.segment ?? 0) === (b.segment ?? 0)
      : a.kind !== 'spine' && b.kind !== 'spine' && a.part != null && a.part.kind === b.part?.kind && (SMOOTH_LIMBS.has(a.part.kind) || (radial && a.part.kind === 'spine'));
  const up = new Int32Array(p.nodes.length).fill(-1); // a node's neighbour up its chain, among the meshed edges
  const down = new Int32Array(p.nodes.length).fill(-1); // …and down it (−2: it forks)
  if (edges) {
    for (const [ia, ib] of edges) {
      if (!sameChain(p.nodes[ia], p.nodes[ib])) continue;
      up[ib] = ia;
      down[ia] = down[ia] === -1 ? ib : -2;
    }
  }

  const ax: number[] = [], ay: number[] = [], az: number[] = [];
  const bx: number[] = [], by: number[] = [], bz: number[] = [];
  const ra: number[] = [], rb: number[] = [];
  const ia: number[] = [], ib: number[] = [];
  const anL: number[] = [], aqL: number[] = [];
  const sx0: number[] = [], sy0: number[] = [], sx1: number[] = [], sy1: number[] = [];
  const edgeOf: number[] = []; // which edge each cone was cut from
  const included = new Set<BodyNode>();
  let girth = 0; // the edges' mean radius, summed
  const cone = (e: number, i0: number, i1: number, A: Vec3, B: Vec3, rA: number, rB: number, ell: BodyNode | null, s0: [number, number], s1: [number, number]) => {
    ax.push(A[0]); ay.push(A[1]); az.push(A[2]);
    bx.push(B[0]); by.push(B[1]); bz.push(B[2]);
    ra.push(rA); rb.push(rB);
    ia.push(i0); ib.push(i1);
    anL.push(ell ? 1 : 0);
    const q = ell ? ell.quat : [0, 0, 0, 1];
    aqL.push(q[0], q[1], q[2], q[3]);
    sx0.push(s0[0]); sy0.push(s0[1]); sx1.push(s1[0]); sy1.push(s1[1]);
    edgeOf.push(e);
  };
  // spine-chain degree (spine neighbours among the meshed edges): an interior spine node's shape is
  // carried by its elliptical cones, so only chain ENDS keep a node ellipsoid (rump, snout tip)
  const spineDeg = new Map<BodyNode, number>();
  if (edges) {
    for (const [i0, i1] of edges) {
      const a = p.nodes[i0], b = p.nodes[i1];
      if (a.kind === 'spine' && b.kind === 'spine') {
        spineDeg.set(a, (spineDeg.get(a) ?? 0) + 1);
        spineDeg.set(b, (spineDeg.get(b) ?? 0) + 1);
      }
    }
  }
  if (edges) {
    for (let i = 0; i < edges.length; i++) {
      const i0 = edges[i][0], i1 = edges[i][1];
      const a = p.nodes[i0];
      const b = p.nodes[i1];
      // a shaped chain is meshed as elliptical cones, link to link, in the first link's frame: the
      // spine's sections, and a limb's own shaped links (the blade of a sculling tail — as round
      // cones a crocodile's tail was a rat's, however its links were flattened)
      const bothSpine = a.kind === 'spine' && b.kind === 'spine';
      const bothLimb = a.kind !== 'spine' && b.kind !== 'spine';
      const ell = (bothSpine || bothLimb) && (a.scale || b.scale) ? a : null;
      const sa: [number, number] = ell ? [a.scale?.[0] ?? 1, a.scale?.[1] ?? 1] : [1, 1];
      const sb: [number, number] = ell ? [b.scale?.[0] ?? 1, b.scale?.[1] ?? 1] : [1, 1];
      const rB = stalkTip(a, b) ? Math.min(a.radius * 0.8, b.radius * 0.45) : b.radius * slimOf(b);
      // a limb's root cone starts INSIDE a shaped body node: at the node's scalar radius its base
      // sphere stood proud of a flattened body — a crab's eight leg roots swelled its flat carapace
      // into a ball — so it starts at the node's narrowest cross-section instead
      const rA = a.kind === 'spine' && b.kind !== 'spine' && a.scale ? a.radius * Math.min(a.scale[0], a.scale[1], 1) : a.radius * slimOf(a);
      girth += (rA + rB) * 0.5;
      included.add(a);
      included.add(b);
      if (!sameChain(a, b)) {
        cone(i, i0, i1, a.pos, b.pos, rA, rB, ell, sa, sb);
        continue;
      }
      // the neighbours either side (a chain's end runs on straight: the neighbour mirrored)
      const pv = up[i0] >= 0 ? p.nodes[up[i0]] : null;
      const nx = down[i1] >= 0 ? p.nodes[down[i1]] : null;
      const at = (t: number): { P: Vec3; r: number } => {
        const P: Vec3 = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          P[k] = catmullRom(pv ? pv.pos[k] : 2 * a.pos[k] - b.pos[k], a.pos[k], b.pos[k], nx ? nx.pos[k] : 2 * b.pos[k] - a.pos[k], t);
        }
        const r = catmullRom(pv ? pv.radius * slimOf(pv) : 2 * rA - rB, rA, rB, nx ? nx.radius * slimOf(nx) : 2 * rB - rA, t);
        // (never past the link's own two girths by much: a spline overshoots where a girth steps)
        const lo = Math.min(rA, rB), hi = Math.max(rA, rB);
        return { P, r: Math.min(hi * 1.06, Math.max(lo * 0.94, r)) };
      };
      let A = { P: a.pos, r: rA };
      for (let c = 1; c <= CHAIN_CUTS; c++) {
        const t = c / CHAIN_CUTS;
        const B = c === CHAIN_CUTS ? { P: b.pos, r: rB } : at(t);
        const t0 = (c - 1) / CHAIN_CUTS;
        cone(i, i0, i1, A.P, B.P, A.r, B.r, ell, [sa[0] + (sb[0] - sa[0]) * t0, sa[1] + (sb[1] - sa[1]) * t0], [sa[0] + (sb[0] - sa[0]) * t, sa[1] + (sb[1] - sa[1]) * t]);
        A = B;
      }
    }
    // A furred skull with a STOP (a braincase with a muzzle hung on its front: see grow's headStop)
    // has a JAW under both: from the angle of the jaw, below the braincase, to the chin under the nose.
    // (Without it the head was a ball with a tube half its girth plugged into its front — a sausage in
    // an orange — its lower outline stepping up sharply where the muzzle began.)
    const jaw = jawOf(p);
    if (jaw) {
      cone(jaw.edge, jaw.i0, jaw.i1, jaw.a, jaw.b, jaw.ra, jaw.rb, null, [1, 1], [1, 1]);
      // …and a BRIDGE over the stop, from the brow down onto the muzzle: the step from braincase to
      // muzzle is sharper than the skin's blend can round, and it left a crease round the top of the
      // muzzle where it met the skull (a bulb stuck on the front of a ball)
      const br = bridgeOf(p);
      if (br) cone(jaw.edge, jaw.i0, jaw.i1, br.a, br.b, br.ra, br.rb, null, [1, 1], [1, 1]);
    }
  } else {
    // (one ball per node — but not the parts that draw themselves, where there is anything else; and a
    // shaped node's ball no bigger than its narrowest girth, so the ellipsoid it carries gives the shape)
    const some = p.nodes.some((n) => !ownDrawn(n));
    for (let i = 0; i < p.nodes.length; i++) {
      const n = p.nodes[i];
      if (some && ownDrawn(n)) continue;
      const r = n.scale ? n.radius * Math.min(n.scale[0], n.scale[1], n.scale[2], 1) : n.radius;
      cone(i, i, i, n.pos, n.pos, r, r, null, [1, 1], [1, 1]);
      girth += n.radius;
      included.add(n);
    }
  }
  const nc = ax.length;
  const pr = new Float64Array(nc);
  for (let i = 0; i < nc; i++) pr[i] = (ra[i] + rb[i]) * 0.5;
  const an = Uint8Array.from(anL);
  const aq = Float64Array.from(aqL);

  // anisotropic nodes carry their shape as an ellipsoid primitive — except interior spine nodes, whose
  // cross-section the elliptical cones on both sides already carry (see `an`)
  const shaped: BodyNode[] = [];
  // (however z-stretched: an interior node's ellipsoid has the cones' own cross-section at the node and
  // narrows away from it, so it never widens the body — all it did, where its skin met theirs, was swell
  // by the blend: a ring round the body at every node. A shark's trunk, stretched 1.15 and a hair, kept
  // them and was a maggot banded in rings; a lizard's and a crocodile's backs were bumped at each link.)
  for (const n of included) {
    if (!n.scale) continue;
    // (a shaped limb link's cones carry its cross-section whole: an ellipsoid on top of them would
    // only swell the joint where the two surfaces blend)
    if (n.kind !== 'spine') continue;
    const interior = n.kind === 'spine' && (spineDeg.get(n) ?? 0) >= 2;
    if (interior) continue;
    shaped.push(n);
  }
  // …and the webs between a ring of webbed arms (an octopus's), each panel an ellipsoid too
  const webs = edges ? webPanels(p, include) : [];
  const ne = shaped.length + webs.length;
  // A swimmer's snout TIP — its chain's front end — keeps its ellipsoid only for the length it adds to the
  // cones' end cap: the two surfaces coincide round the tip, and smooth-unioned at the full k they swelled
  // it by k/4 (a shark's last link a third fatter than its own: a dolphin's bottle-nose). It blends as its
  // own chain does.
  const eb = new Float64Array(ne).fill(1);
  const swimmer = p.nodes.some((n) => n.part?.kind === 'fin') && !p.nodes.some((n) => n.part?.kind === 'leg');
  if (swimmer) {
    shaped.forEach((n, i) => {
      const j = p.nodes.indexOf(n);
      if (up[j] >= 0 && down[j] === -1) eb[i] = CHAIN_BLEND;
    });
  }
  const ec = new Float64Array(ne * 3);
  const eq = new Float64Array(ne * 4);
  const er = new Float64Array(ne * 3);
  let excess = 0;
  for (let i = 0; i < shaped.length; i++) {
    const n = shaped[i];
    const s = n.scale as Vec3;
    ec[i * 3] = n.pos[0]; ec[i * 3 + 1] = n.pos[1]; ec[i * 3 + 2] = n.pos[2];
    eq[i * 4] = n.quat[0]; eq[i * 4 + 1] = n.quat[1]; eq[i * 4 + 2] = n.quat[2]; eq[i * 4 + 3] = n.quat[3];
    er[i * 3] = n.radius * s[0]; er[i * 3 + 1] = n.radius * s[1]; er[i * 3 + 2] = n.radius * s[2];
    excess = Math.max(excess, n.radius * (Math.max(s[0], s[1], s[2]) - 1));
  }
  // (a panel lies between its two arms, inside the bounds their nodes already pad: no excess)
  webs.forEach((w, j) => {
    const i = shaped.length + j;
    ec.set(w.c, i * 3);
    eq.set(w.q, i * 4);
    er.set(w.r, i * 3);
  });
  const cx = new Float64Array(nc), cy = new Float64Array(nc), cz = new Float64Array(nc), hl = new Float64Array(nc);
  for (let i = 0; i < nc; i++) {
    cx[i] = (ax[i] + bx[i]) / 2;
    cy[i] = (ay[i] + by[i]) / 2;
    cz[i] = (az[i] + bz[i]) / 2;
    hl[i] = Math.hypot(bx[i] - ax[i], by[i] - ay[i], bz[i] - az[i]) / 2;
  }
  for (let i = 0; i < nc; i++) if (an[i]) excess = Math.max(excess, Math.max(ra[i], rb[i]) * (Math.max(sx0[i], sy0[i], sx1[i], sy1[i]) - 1));
  // chains: a cone belongs to the chain of its far node — a spine node's segment (trunk, neck, head),
  // a limb node's part root (the first node of that leg / tail / horn). The fallback (one prim per
  // node) keeps every prim its own chain: the old all-smooth union.
  const ch = new Int32Array(nc);
  if (edges) {
    const parentOf = new Int32Array(p.nodes.length).fill(-1);
    for (const [a, b] of p.edges) parentOf[b] = a;
    const rootOf = (i: number): number => {
      let cur = i;
      for (;;) {
        const n = p.nodes[cur];
        const par = parentOf[cur];
        if (par < 0 || n.kind === 'spine') return cur;
        const pn = p.nodes[par];
        if (pn.kind === 'spine' || pn.part?.kind !== n.part?.kind) return cur;
        cur = par;
      }
    };
    for (let i = 0; i < nc; i++) {
      const b = ib[i];
      const nb = p.nodes[b];
      ch[i] = nb.kind === 'spine' ? -1 - (nb.segment ?? 0) : rootOf(b);
    }
  } else {
    for (let i = 0; i < nc; i++) ch[i] = i;
  }
  const ord = Int32Array.from({ length: nc }, (_, i) => i).sort((a, b) => ch[a] - ch[b] || a - b);
  const f64 = (v: number[]) => Float64Array.from(v);
  return {
    ax: f64(ax), ay: f64(ay), az: f64(az), bx: f64(bx), by: f64(by), bz: f64(bz), pr, ra: f64(ra), rb: f64(rb), cx, cy, cz, hl,
    an, aq, sx0: f64(sx0), sy0: f64(sy0), sx1: f64(sx1), sy1: f64(sy1), nc, ia: Int32Array.from(ia), ib: Int32Array.from(ib),
    ch, ord, ec, eq, er, eb, ne, k: 0, excess,
    meanR: girth / Math.max(edges ? edges.length : included.size, 1),
  };
}

/** A copy of the field with only the cones `keep` passes (the ellipsoids, the blend and the measures
 *  stay as they were) — the skin leaves its thin limbs out and draws them exact (limbTubes.ts). */
export function withoutCones(f: FieldPrims, keep: (m: number) => boolean): FieldPrims {
  const idx: number[] = [];
  for (let m = 0; m < f.nc; m++) if (keep(m)) idx.push(m);
  const nc = idx.length;
  const pick = (a: Float64Array) => Float64Array.from(idx, (m) => a[m]);
  const aq = new Float64Array(nc * 4);
  idx.forEach((m, i) => aq.set(f.aq.subarray(m * 4, m * 4 + 4), i * 4));
  const ch = Int32Array.from(idx, (m) => f.ch[m]);
  return {
    ax: pick(f.ax), ay: pick(f.ay), az: pick(f.az), bx: pick(f.bx), by: pick(f.by), bz: pick(f.bz),
    pr: pick(f.pr), ra: pick(f.ra), rb: pick(f.rb), cx: pick(f.cx), cy: pick(f.cy), cz: pick(f.cz), hl: pick(f.hl),
    an: Uint8Array.from(idx, (m) => f.an[m]), aq,
    sx0: pick(f.sx0), sy0: pick(f.sy0), sx1: pick(f.sx1), sy1: pick(f.sy1),
    nc, ia: Int32Array.from(idx, (m) => f.ia[m]), ib: Int32Array.from(idx, (m) => f.ib[m]),
    ch, ord: Int32Array.from({ length: nc }, (_, i) => i).sort((a, b) => ch[a] - ch[b] || a - b),
    ec: f.ec, eq: f.eq, er: f.er, eb: f.eb, ne: f.ne, k: f.k, excess: f.excess, meanR: f.meanR,
  };
}

/** Move cone m's ends (and their radii), keeping its bounding sphere and mean radius in step. */
export function setCone(f: FieldPrims, m: number, A: readonly number[], B: readonly number[], rA: number, rB: number): void {
  f.ax[m] = A[0]; f.ay[m] = A[1]; f.az[m] = A[2];
  f.bx[m] = B[0]; f.by[m] = B[1]; f.bz[m] = B[2];
  f.ra[m] = rA; f.rb[m] = rB; f.pr[m] = (rA + rB) / 2;
  f.cx[m] = (A[0] + B[0]) / 2; f.cy[m] = (A[1] + B[1]) / 2; f.cz[m] = (A[2] + B[2]) / 2;
  f.hl[m] = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) / 2;
}

// rotate v by the CONJUGATE of q (world → the prim's local frame), inlined, no allocation of q'
function rotConj(qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number, out: Vec3): void {
  // q* = (-x,-y,-z,w); v' = q* v q
  const ix = -qx, iy = -qy, iz = -qz, iw = qw;
  const tx = iw * vx + iy * vz - iz * vy;
  const ty = iw * vy + iz * vx - ix * vz;
  const tz = iw * vz + ix * vy - iy * vx;
  const tw = -ix * vx - iy * vy - iz * vz;
  out[0] = tx * iw + tw * -ix + ty * -iz - tz * -iy;
  out[1] = ty * iw + tw * -iy + tz * -ix - tx * -iz;
  out[2] = tz * iw + tw * -iz + tx * -iy - ty * -ix;
}

const SCRATCH: Vec3 = [0, 0, 0];

// --- shared small vector math (the viewer's pure-math home, next to qRotateV/basisToQuat) ------

/** Normalize, with an explicit degenerate fallback — callers pick the axis that is load-bearing
 *  for THEM (e.g. the jaw hinge falls back to the corner axis [1,0,0], aim-shaped code to [0,0,1]). */
export function norm3(v: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [fallback[0], fallback[1], fallback[2]];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Rotate v by quaternion q (allocating — for the cold mouth-line paths, not the field hot loop). */
export function qRotateV(q: readonly number[], v: readonly number[]): Vec3 {
  const [x, y, z, w] = q;
  const tx = w * v[0] + y * v[2] - z * v[1];
  const ty = w * v[1] + z * v[0] - x * v[2];
  const tz = w * v[2] + x * v[1] - y * v[0];
  const tw = -x * v[0] - y * v[1] - z * v[2];
  return [
    tx * w + tw * -x + ty * -z - tz * -y,
    ty * w + tw * -y + tz * -x - tx * -z,
    tz * w + tw * -z + tx * -y - ty * -x,
  ];
}

/** Quaternion from an orthonormal right-handed basis (columns X, Y, Z) — orients teeth/lips. */
export function basisToQuat(X: readonly number[], Y: readonly number[], Z: readonly number[]): [number, number, number, number] {
  // standard rotation-matrix → quaternion (Shepperd), matrix columns = the basis vectors
  const m00 = X[0], m10 = X[1], m20 = X[2];
  const m01 = Y[0], m11 = Y[1], m21 = Y[2];
  const m02 = Z[0], m12 = Z[1], m22 = Z[2];
  const tr = m00 + m11 + m22;
  let qx: number, qy: number, qz: number, qw: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    qw = 0.25 * s;
    qx = (m21 - m12) / s;
    qy = (m02 - m20) / s;
    qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  return [qx, qy, qz, qw];
}

// polynomial smooth-min (soft union) — the same form smoothSkin has always used
function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b;
  const t = 0.5 + (0.5 * (a - b)) / k;
  const h = t < 0 ? 0 : t > 1 ? 1 : t;
  return a * (1 - h) + b * h - k * h * (1 - h);
}

/**
 * Exact signed distance to a round cone — the convex hull of sphere(a, r1) and sphere(b, r2)
 * (Quilez). This is what makes a tapering chain read as ONE smooth limb: consecutive cones share the
 * joint sphere, so radius varies continuously along the skeleton instead of stepping per edge.
 */
export function roundConeDist(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r1: number, r2: number,
): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  // degenerate: a zero-length edge, or one end-sphere swallows the other → the bigger sphere
  if (l2 < 1e-12 || a2 <= 1e-12) {
    const da = Math.sqrt(pax * pax + pay * pay + paz * paz) - r1;
    const qx = px - bx, qy = py - by, qz = pz - bz;
    const db = Math.sqrt(qx * qx + qy * qy + qz * qz) - r2;
    return da < db ? da : db;
  }
  const il2 = 1 / l2;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const wx = pax * l2 - bax * y, wy = pay * l2 - bay * y, wz = paz * l2 - baz * y;
  const x2 = wx * wx + wy * wy + wz * wz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

const ELL_P: Vec3 = [0, 0, 0];
const ELL_B: Vec3 = [0, 0, 0];
/**
 * Distance to an ELLIPTICAL round cone: in the segment's local frame (+Z along the chain), squash the
 * cross-section by the scale interpolated at the point's position along the segment, measure the exact
 * round-cone distance there, and scale back by the smaller cross-section axis (conservative — the
 * union and the polygonizer only need a field that never overestimates).
 */
function ellipticConeDist(f: FieldPrims, m: number, x: number, y: number, z: number): number {
  const qx = f.aq[m * 4], qy = f.aq[m * 4 + 1], qz = f.aq[m * 4 + 2], qw = f.aq[m * 4 + 3];
  rotConj(qx, qy, qz, qw, x - f.ax[m], y - f.ay[m], z - f.az[m], ELL_P);
  rotConj(qx, qy, qz, qw, f.bx[m] - f.ax[m], f.by[m] - f.ay[m], f.bz[m] - f.az[m], ELL_B);
  const l2 = ELL_B[0] * ELL_B[0] + ELL_B[1] * ELL_B[1] + ELL_B[2] * ELL_B[2];
  let t = l2 > 1e-12 ? (ELL_P[0] * ELL_B[0] + ELL_P[1] * ELL_B[1] + ELL_P[2] * ELL_B[2]) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const sx = f.sx0[m] + (f.sx1[m] - f.sx0[m]) * t;
  const sy = f.sy0[m] + (f.sy1[m] - f.sy0[m]) * t;
  const d = roundConeDist(
    ELL_P[0] / sx, ELL_P[1] / sy, ELL_P[2],
    0, 0, 0,
    ELL_B[0] / sx, ELL_B[1] / sy, ELL_B[2],
    f.ra[m], f.rb[m],
  );
  // the squash is Lipschitz with constant 1/min(sx, sy, 1): scaling back by that bound never overestimates
  return d * Math.min(sx, sy, 1);
}

/** the blend between cones of one chain, as a fraction of their own (see FieldPrims.ch) */
const CHAIN_BLEND = 0.15;

// --- webs ----------------------------------------------------------------------------------------

/** a web panel's thickness, as a share of its arms' radius where it meets them (the arms stand on it
 *  as ridges), and how far into each arm its sides reach (×that radius), so the two blend */
const WEB_THICK = 0.45;
const WEB_SINK = 0.35;
/** how far out a panel runs toward its arms' web points (it stops short of their chord, so between
 *  two arms the web's margin falls back toward the body) */
const WEB_OUT = 0.85;

/** a point `s` of the way along a chain of nodes (by length), and the chain's radius there */
function alongChain(p: Phenotype, chain: number[], s: number): { at: Vec3; r: number } {
  let total = 0;
  for (let k = 1; k < chain.length; k++) total += dist3(p.nodes[chain[k - 1]].pos, p.nodes[chain[k]].pos);
  let left = s * total;
  for (let k = 1; k < chain.length; k++) {
    const a = p.nodes[chain[k - 1]], b = p.nodes[chain[k]];
    const l = dist3(a.pos, b.pos);
    if (left <= l || k === chain.length - 1) {
      const t = l > 1e-9 ? Math.min(1, left / l) : 0;
      return { at: [a.pos[0] + (b.pos[0] - a.pos[0]) * t, a.pos[1] + (b.pos[1] - a.pos[1]) * t, a.pos[2] + (b.pos[2] - a.pos[2]) * t], r: a.radius + (b.radius - a.radius) * t };
    }
    left -= l;
  }
  const n = p.nodes[chain[0]];
  return { at: [...n.pos] as Vec3, r: n.radius };
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** a rotation taking the local axes to the orthonormal columns X, Y, Z */
function quatOfBasis(X: Vec3, Y: Vec3, Z: Vec3): [number, number, number, number] {
  const m00 = X[0], m11 = Y[1], m22 = Z[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    return [(Y[2] - Z[1]) * s, (Z[0] - X[2]) * s, (X[1] - Y[0]) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (Y[0] + X[1]) / s, (Z[0] + X[2]) / s, (Y[2] - Z[1]) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(Y[0] + X[1]) / s, 0.25 * s, (Z[1] + Y[2]) / s, (Z[0] - X[2]) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(Z[0] + X[2]) / s, (Z[1] + Y[2]) / s, 0.25 * s, (X[1] - Y[0]) / s];
}

/**
 * The WEB between a ring of webbed arms (an octopus's): round each body node, its webbed arms sorted
 * by their angle about the vertical, and between each arm and the next a flat panel of skin — an
 * ellipsoid from their roots out toward the point `web` of the way along each, as wide as the gap
 * between them (and a little into each), half as thick as they are. Without it the arms left the
 * mantle as separate rods, a spider's legs; with it they spread from one skirt.
 */
export function webPanels(p: Phenotype, include: (n: BodyNode) => boolean): { c: Vec3; q: [number, number, number, number]; r: Vec3 }[] {
  const out: { c: Vec3; q: [number, number, number, number]; r: Vec3 }[] = [];
  // (a web joins a RING of arms round a radial body: on a bilateral one — a mutant carrying webbed
  // arms in pairs — the arms "next" to each other round the trunk are left and right, and a panel
  // between them would be skin stretched across its chest)
  if (p.genomeRef.symmetry !== 'radial') return out;
  const kids: number[][] = p.nodes.map(() => []);
  for (const [a, b] of p.edges) kids[a].push(b);
  // each webbed arm's chain, root first, grouped by the body node it grows from
  const rings = new Map<number, { chain: number[]; web: number; ang: number }[]>();
  p.edges.forEach(([a, b]) => {
    const n = p.nodes[b];
    const web = n.part?.web ?? 0;
    if (web <= 0 || p.nodes[a].kind !== 'spine' || !include(n)) return;
    const chain = [b];
    for (let cur = b; ; ) {
      const next = kids[cur].find((k) => p.nodes[k].part?.kind === n.part?.kind);
      if (next === undefined) break;
      chain.push(next);
      cur = next;
    }
    if (chain.length < 2) return;
    const c = p.nodes[a].pos;
    const ang = Math.atan2(n.pos[0] - c[0], n.pos[2] - c[2]);
    let ring = rings.get(a);
    if (!ring) rings.set(a, (ring = []));
    ring.push({ chain, web, ang });
  });
  for (const ring of rings.values()) {
    if (ring.length < 3) continue;
    ring.sort((u, v) => u.ang - v.ang);
    for (let k = 0; k < ring.length; k++) {
      const A = ring[k], B = ring[(k + 1) % ring.length];
      // (a ring with a gap — an arm lost — is not webbed across it)
      const gap = (B.ang - A.ang + Math.PI * 2) % (Math.PI * 2);
      if (gap > (Math.PI * 2) / ring.length * 1.6) continue;
      const a0 = p.nodes[A.chain[0]], b0 = p.nodes[B.chain[0]];
      const wa = alongChain(p, A.chain, Math.min(A.web, B.web));
      const wb = alongChain(p, B.chain, Math.min(A.web, B.web));
      const ma = alongChain(p, A.chain, Math.min(A.web, B.web) * 0.5);
      const mb = alongChain(p, B.chain, Math.min(A.web, B.web) * 0.5);
      const Q: Vec3 = [(a0.pos[0] + b0.pos[0]) / 2, (a0.pos[1] + b0.pos[1]) / 2, (a0.pos[2] + b0.pos[2]) / 2];
      const P: Vec3 = [(wa.at[0] + wb.at[0]) / 2, (wa.at[1] + wb.at[1]) / 2, (wa.at[2] + wb.at[2]) / 2];
      let Z: Vec3 = [P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]];
      const len = Math.hypot(Z[0], Z[1], Z[2]);
      if (len < 1e-6) continue;
      Z = [Z[0] / len, Z[1] / len, Z[2] / len];
      // across: from one arm to the other at the panel's middle, square to its run
      let X: Vec3 = [mb.at[0] - ma.at[0], mb.at[1] - ma.at[1], mb.at[2] - ma.at[2]];
      const span = Math.hypot(X[0], X[1], X[2]);
      const xz = X[0] * Z[0] + X[1] * Z[1] + X[2] * Z[2];
      X = [X[0] - Z[0] * xz, X[1] - Z[1] * xz, X[2] - Z[2] * xz];
      const xl = Math.hypot(X[0], X[1], X[2]);
      if (xl < 1e-6) continue;
      X = [X[0] / xl, X[1] / xl, X[2] / xl];
      const Y: Vec3 = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
      const rArm = (ma.r + mb.r) / 2;
      const half = (len * WEB_OUT) / 2;
      out.push({
        c: [Q[0] + Z[0] * half, Q[1] + Z[1] * half, Q[2] + Z[2] * half],
        q: quatOfBasis(X, Y, Z),
        r: [span / 2 + rArm * WEB_SINK, rArm * WEB_THICK, half],
      });
    }
  }
  return out;
}

/** The body field: < 0 inside the creature, 0 on the skin, > 0 outside. */
export function fieldAt(f: FieldPrims, x: number, y: number, z: number): number {
  let d = Infinity; // the smooth union of the finished chains
  let cd = Infinity; // the current chain's union
  let ck = 0; // …and its blend radius into the rest
  let cur = 0x7fffffff;
  const k = f.k;
  for (let o = 0; o < f.nc; o++) {
    const m = f.ord[o];
    if (f.ch[m] !== cur) {
      if (cd !== Infinity) d = d === Infinity ? cd : smin(cd, d, ck);
      cur = f.ch[m];
      cd = Infinity;
      ck = 0;
    }
    // per-primitive blend: a thin limb blends over at most ~its own radius, so slender legs keep their
    // definition instead of webbing into each other, while fat trunk sections still fuse softly
    const rMaxM = f.ra[m] > f.rb[m] ? f.ra[m] : f.rb[m];
    const km = k < rMaxM * 1.1 ? k : rMaxM * 1.1;
    if (km > ck) ck = km;
    // within a chain, only a whisper of blend (it still fillets the inside of a bent knee)
    const kc = km * CHAIN_BLEND;
    const sMax = f.an[m] ? Math.max(f.sx0[m], f.sy0[m], f.sx1[m], f.sy1[m], 1) : 1;
    // Exact culling: val is at least the distance to the cone's bounding sphere. A cone that far can't
    // move its chain's union (smin(val, cd, kc) = cd once val ≥ cd + kc), or — past d + k + kc — can't
    // move the finished union even through the chain's blend (at most k; 2·kc covers the chain's own).
    const near = cd + kc < d + k + 2 * kc ? cd + kc : d + k + 2 * kc;
    if (near !== Infinity) {
      const ox = x - f.cx[m], oy = y - f.cy[m], oz = z - f.cz[m];
      const lim = near + f.hl[m] + rMaxM * sMax;
      if (lim > 0 && ox * ox + oy * oy + oz * oz > lim * lim) continue;
    }
    const val = f.an[m]
      ? ellipticConeDist(f, m, x, y, z)
      : roundConeDist(x, y, z, f.ax[m], f.ay[m], f.az[m], f.bx[m], f.by[m], f.bz[m], f.ra[m], f.rb[m]);
    cd = cd === Infinity ? val : smin(val, cd, kc);
  }
  if (cd !== Infinity) d = d === Infinity ? cd : smin(cd, d, ck);
  for (let m = 0; m < f.ne; m++) {
    if (d !== Infinity) {
      const ox = x - f.ec[m * 3], oy = y - f.ec[m * 3 + 1], oz = z - f.ec[m * 3 + 2];
      const R = Math.max(f.er[m * 3], f.er[m * 3 + 1], f.er[m * 3 + 2]);
      const lim = d + k + R;
      if (lim > 0 && ox * ox + oy * oy + oz * oz > lim * lim) continue;
    }
    // scaled-space ellipsoid distance (underestimates on long axes — safe for a union)
    rotConj(f.eq[m * 4], f.eq[m * 4 + 1], f.eq[m * 4 + 2], f.eq[m * 4 + 3], x - f.ec[m * 3], y - f.ec[m * 3 + 1], z - f.ec[m * 3 + 2], SCRATCH);
    const rx = f.er[m * 3], ry = f.er[m * 3 + 1], rz = f.er[m * 3 + 2];
    const qx = SCRATCH[0] / rx, qy = SCRATCH[1] / ry, qz = SCRATCH[2] / rz;
    const minR = Math.min(rx, ry, rz);
    const val = (Math.sqrt(qx * qx + qy * qy + qz * qz) - 1) * minR;
    d = d === Infinity ? val : smin(val, d, f.k * (f.eb?.[m] ?? 1));
  }
  return d;
}

/** Signed distance to a carve's cavity wall: < 0 inside the cavity, > 0 in solid flesh/air. */
export function carveDist(c: Carve, x: number, y: number, z: number): number {
  rotConj(c.quat[0], c.quat[1], c.quat[2], c.quat[3], x - c.pos[0], y - c.pos[1], z - c.pos[2], SCRATCH);
  const qx = SCRATCH[0] / c.radii[0], qy = SCRATCH[1] / c.radii[1], qz = SCRATCH[2] / c.radii[2];
  return (Math.sqrt(qx * qx + qy * qy + qz * qz) - 1) * Math.min(c.radii[0], c.radii[1], c.radii[2]);
}

/** The body field with cavities subtracted: smax(body, −cavity) with a soft fleshy rim. */
export function fieldAtCarved(f: FieldPrims, carves: readonly Carve[], x: number, y: number, z: number): number {
  let d = fieldAt(f, x, y, z);
  for (let i = 0; i < carves.length; i++) {
    const c = carves[i];
    d = -smin(-d, carveDist(c, x, y, z), c.blend); // smax(d, −cd) = −smin(−d, cd)
  }
  return d;
}

/** Central-difference gradient of the carved field (≈ the outward surface normal on the skin). */
export function fieldGrad(f: FieldPrims, carves: readonly Carve[], x: number, y: number, z: number, out: Vec3): void {
  const h = 1e-3;
  out[0] = fieldAtCarved(f, carves, x + h, y, z) - fieldAtCarved(f, carves, x - h, y, z);
  out[1] = fieldAtCarved(f, carves, x, y + h, z) - fieldAtCarved(f, carves, x, y - h, z);
  out[2] = fieldAtCarved(f, carves, x, y, z + h) - fieldAtCarved(f, carves, x, y, z - h);
  const len = Math.hypot(out[0], out[1], out[2]);
  if (len > 1e-9) {
    out[0] /= len;
    out[1] /= len;
    out[2] /= len;
  } else {
    out[0] = 0; out[1] = 0; out[2] = 1;
  }
}

export interface SurfacePoint {
  p: Vec3;
  n: Vec3; // outward unit normal
}

/**
 * March a ray from `origin` along unit `dir` to the first inside→outside zero crossing, then bisect.
 * Use with an origin inside the body (a head center) to find where a face ray exits the skin.
 * Returns null if the ray never exits within `maxT` (origin already outside marches forward first).
 */
export function rayToSurface(f: FieldPrims, carves: readonly Carve[], origin: Vec3, dir: Vec3, maxT = 12): SurfacePoint | null {
  let t = 0;
  let dPrev = fieldAtCarved(f, carves, origin[0], origin[1], origin[2]);
  let tPrev = 0;
  for (let i = 0; i < 96 && t < maxT; i++) {
    // inside: |d| under-estimates the distance to the surface, so stepping by −d can't overshoot
    const step = dPrev < 0 ? Math.max(-dPrev * 0.9, 0.01) : 0.02;
    t += step;
    const d = fieldAtCarved(f, carves, origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t);
    if (dPrev < 0 && d >= 0) {
      // bisect the bracket [tPrev, t] — 16 halvings take a ~0.5 bu bracket well under the 1e-4
      // tolerance the callers assert, and each extra step is a full field evaluation
      let lo = tPrev, hi = t;
      for (let j = 0; j < 16; j++) {
        const mid = (lo + hi) / 2;
        if (hi - lo < 1e-5) break;
        const dm = fieldAtCarved(f, carves, origin[0] + dir[0] * mid, origin[1] + dir[1] * mid, origin[2] + dir[2] * mid);
        if (dm < 0) lo = mid;
        else hi = mid;
      }
      const tf = (lo + hi) / 2;
      const p: Vec3 = [origin[0] + dir[0] * tf, origin[1] + dir[1] * tf, origin[2] + dir[2] * tf];
      const n: Vec3 = [0, 0, 1];
      fieldGrad(f, carves, p[0], p[1], p[2], n);
      return { p, n };
    }
    dPrev = d;
    tPrev = t;
  }
  return null;
}

/**
 * Newton-walk a point onto the nearest surface (|field| → 0 along the gradient). For points already
 * near the skin (offset lip curves, tooth roots) this converges in a few steps; the field is not a
 * true SDF under soft blends, so steps are damped and capped for safety.
 */
export function projectToSurface(f: FieldPrims, carves: readonly Carve[], start: Vec3): SurfacePoint {
  const p: Vec3 = [start[0], start[1], start[2]];
  const g: Vec3 = [0, 0, 1];
  for (let i = 0; i < 32; i++) {
    const d = fieldAtCarved(f, carves, p[0], p[1], p[2]);
    if (Math.abs(d) < 1e-4) break;
    fieldGrad(f, carves, p[0], p[1], p[2], g);
    const step = Math.max(-0.25, Math.min(0.25, d * 0.85)); // damped + capped — soft blends are not unit-gradient
    p[0] -= g[0] * step;
    p[1] -= g[1] * step;
    p[2] -= g[2] * step;
  }
  fieldGrad(f, carves, p[0], p[1], p[2], g);
  return { p, n: [g[0], g[1], g[2]] };
}
