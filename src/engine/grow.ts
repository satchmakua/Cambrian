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
import { mulberry32 } from './rng';
import { R_MIN, NODE_MAX, DEPTH_MAX, GENE_BOUNDS, clamp } from './bounds';
import type { Genome, SegmentGene, AppendageGene, Terminal, PartKind, Vec3 } from './genome';

export type Quat = [number, number, number, number]; // [x, y, z, w]

/** Fusiform bulge: how much fatter the middle of a body chain is than its ends. */
const BODY_BULGE = 0.35;

/** Minimum grown radius for an eye bulb (bu) — the face must always read (M19/M24). */
const EYE_R_MIN = 0.06;

export interface BodyNode {
  pos: Vec3;
  quat: Quat; // orientation; the node's local forward is +Z
  radius: number; // always ≥ R_MIN
  scale?: Vec3; // local-frame ellipsoid multipliers on `radius` (width/height/length); round if absent
  kind: 'spine' | 'limb' | 'terminal';
  terminal?: Terminal;
  part?: { kind: PartKind; style: number }; // which genome part grew this node (for render variants)
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

  growSegment(dev.body, [0, 0, 0], [0, 0, 0, 1], 0, -1);

  if (nodes.length === 0) addNode([0, 0, 0], [0, 0, 0, 1], R_MIN, 'spine'); // never empty

  levelFeet(); // drop every foot to a common ground level (the creature stands), then refresh bounds
  recomputeBounds();

  return { nodes, edges, bounds: { min, max }, genomeRef: genome };

  // --- recursive growth -------------------------------------------------------

  function growSegment(seg: SegmentGene, startPos: Vec3, startQuat: Quat, depth: number, parentIdx: number): void {
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

    for (let i = 0; i < seg.repeat; i++) {
      if (atCap()) break;
      const u = seg.repeat > 1 ? i / (seg.repeat - 1) : 0.5;
      const profile = 1 + BODY_BULGE * Math.sin(Math.PI * u);
      const radius = girth * Math.pow(seg.taper, i) * profile;
      const idx = addNode(pos, quat, radius, 'spine');
      if (segScale) nodes[idx].scale = segScale;
      if (prev >= 0) edges.push([prev, idx]);
      spine.push(idx);
      prev = idx;

      // advance along local forward (+Z), bending by the per-link curve. In bilateral mode the
      // lateral (yaw) bend is dropped so the spine stays on the X=0 plane — a winding S-curve would
      // make the static body asymmetric (the slither/undulation animation supplies the wind instead).
      const yaw = dev.symmetry === 'bilateral' ? 0 : seg.curve[1];
      quat = qMul(quat, qFromEuler(seg.curve[0], yaw));
      const fwd = qRotate([0, 0, 1], quat);
      const step = nodes[idx].radius * elong; // overlap-bounded stride → continuous body
      pos = [pos[0] + fwd[0] * step, pos[1] + fwd[1] * step, pos[2] + fwd[2] * step];
    }

    for (const app of seg.appendages) {
      if (atCap()) break;
      const ai = clampInt(Math.round(app.attachT * (spine.length - 1)), 0, spine.length - 1);
      // shoulder / haunch: legs thicken the spine node they attach to, giving the
      // body muscular structure instead of a uniform tube.
      if (app.kind === 'leg') {
        nodes[spine[ai]].radius = Math.min(nodes[spine[ai]].radius * 1.22, nodes[spine[ai]].radius + 0.35);
      }
      growAppendage(app, spine[ai]);
    }

    if (seg.child && depth + 1 < DEPTH_MAX && !atCap()) {
      growSegment(seg.child, pos, quat, depth + 1, prev);
    }
  }

  function growAppendage(app: AppendageGene, attachIdx: number): void {
    const base = nodes[attachIdx];
    const az = app.attachAzimuth + (rng() - 0.5) * 0.12; // seed perturbs the aim a touch
    const ce = Math.cos(app.attachElevation);
    const se = Math.sin(app.attachElevation);
    // spherical aim (MORPHOLOGY §3.1): az sweeps the cross-section, elevation tilts
    // toward the body axis (+forward / −back). This is what lets parts point anywhere.
    const aim = (a: number): Vec3 => norm([ce * Math.cos(a), ce * Math.sin(a), se]);

    if (dev.symmetry === 'radial') {
      for (let k = 0; k < dev.radialCount; k++) growLimb(app, base, aim(az + (k * Math.PI * 2) / dev.radialCount));
      return;
    }
    // bilateral / none: grow one limb…
    let d = aim(az);
    // a non-paired part on a bilateral body must stay on the midline plane (X=0): aim it in the
    // plane and drop the roll + lateral curl that would let a multi-segment part (a tail) wander off.
    if (dev.symmetry === 'bilateral' && !app.pair) {
      d = norm([0, d[1], d[2]]);
      app = { ...app, roll: 0, curl: [app.curl[0], 0] };
    }
    const nStart = nodes.length;
    const eStart = edges.length;
    growLimb(app, base, d);
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
   *  leg stretches to reach). Left/right feet share a Y by mirror, so exact symmetry is preserved. */
  function levelFeet(): void {
    if (dev.symmetry === 'radial') return;
    const feet: number[] = [];
    for (let i = 0; i < nodes.length; i++) if (nodes[i].kind === 'terminal' && nodes[i].part?.kind === 'leg') feet.push(i);
    if (feet.length < 2) return;
    const groundY = Math.min(...feet.map((i) => nodes[i].pos[1]));
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
      if (dy > -1e-3) continue;
      for (let i = 1; i <= k; i++) nodes[chain[i]].pos[1] += dy * (i / k); // hip fixed, foot → ground
    }
  }

  function recomputeBounds(): void {
    min[0] = min[1] = min[2] = Infinity;
    max[0] = max[1] = max[2] = -Infinity;
    for (const n of nodes) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], n.pos[a] - n.radius);
        max[a] = Math.max(max[a], n.pos[a] + n.radius);
      }
    }
  }

  function growLimb(app: AppendageGene, base: BodyNode, dir0: Vec3): void {
    let dir = dir0;
    let startPos: Vec3;
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
      startPos = [base.pos[0] + sideX * flank * (0.92 + splay * 0.35), base.pos[1] + base.radius * 0.2, base.pos[2]];
      dir = norm([sideX * splay, -1, 0]);
      dir0 = dir;
    } else {
      // Seat a face organ (eye/mouth/ear) proud of the body by a fraction of ITS OWN radius, so it
      // always clears the surface without floating — for a tiny or a huge organ alike. The renderer
      // draws no connecting capsule into these (see meshData SURFACE_ORGANS), so the organ must sit on
      // the surface: never buried, never adrift. Other appendages attach at the surface as before.
      const t = app.terminal;
      // the mouth hugs the skin (0.12): its geometry is traced onto the true surface by the viewer's
      // mouth-line system, so a proud seat would only push the anchor off the face it draws on
      const seat = t === 'eye' ? 0.6 : t === 'mouth' ? 0.12 : t === 'ear' ? 0.5 : 0;
      // measured against the node's TRUE surface (see surfaceExtent), so a long snout or a domed skull
      // still wears its face proud rather than swallowing it.
      const out = surfaceExtent(base, dir) + seat * app.thickness;
      startPos = [base.pos[0] + dir[0] * out, base.pos[1] + dir[1] * out, base.pos[2] + dir[2] * out];
    }
    // orient +Z → aim direction, then roll about that axis (orients flat parts)
    let quat = qMul(qFromAxisAngle(dir0, app.roll), qFromTo([0, 0, 1], dir0));
    let pos: Vec3 = startPos;
    let prev = nodes.indexOf(base);

    let pitch = app.curl[0];
    for (let j = 0; j < app.segments; j++) {
      if (atCap()) break;
      const last = j === app.segments - 1;
      let r = app.thickness * Math.pow(app.taper, j);
      // a real leg is a muscular haunch tapering to a slim shin/ankle (the broad foot comes from the
      // paw/hoof terminator, which spreads wider than its node) — so legs read as powerful, not vestigial.
      if (app.kind === 'leg') {
        const t = app.segments > 1 ? j / (app.segments - 1) : 0;
        r *= 1.32 - 0.62 * t; // ~1.32× at the hip → ~0.7× at the ankle
      }
      // the eye is the emotional anchor — floor the grown bulb so even a tapered/stalked eye on a
      // small head always reads (M19/M24), regardless of how the gene tapered down its tip.
      if (last && app.terminal === 'eye') r = Math.max(r, EYE_R_MIN);
      const idx = addNode(pos, quat, r, last ? 'terminal' : 'limb', last ? app.terminal : undefined);
      nodes[idx].part = { kind: app.kind, style: app.style };
      edges.push([prev, idx]);
      prev = idx;

      quat = qMul(quat, qFromEuler(pitch, app.curl[1]));
      dir = qRotate([0, 0, 1], quat);
      pos = [pos[0] + dir[0] * app.length, pos[1] + dir[1] * app.length, pos[2] + dir[2] * app.length];
      // a real jointed leg: thigh → (knee folds the shin sharply back under the body) → (ankle swings
      // the foot forward) — a clear Z stance, not one gentle curved sweep. Other limbs keep their curl.
      if (app.kind === 'leg') {
        // knee — a clear backward fold, but softened: at ×3.0 the leg folded so far back under the
        // body that added segment length turned into more fold instead of more standing height,
        // which is why creatures read as stubby however long their legs got.
        if (j === 0) pitch = -Math.abs(app.curl[0]) * 2.15 - 0.2;
        else if (j === 1) pitch = Math.abs(app.curl[0]) * 2.0 + 0.2; // ankle — swing the foot forward
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
  [0.2, 0.8],
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

/** Pull a leg's azimuth into the down-and-out band — folding any up-pointing aim down first, so a
 *  leg is never broken (pointing up); `coherence` then snaps it toward the canonical band. */
function pullLegAzimuth(az: number, coh: number): number {
  let a = az % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  if (a < Math.PI) a = Math.PI * 2 - a; // up → down
  const canon = a < LEG_AZ_LO ? LEG_AZ_LO : a > LEG_AZ_HI ? LEG_AZ_HI : a;
  return lerp(a, canon, coh);
}

function normalizeLegs(g: Genome, coh: number): void {
  const legs = g.body.appendages.filter((p) => p.kind === 'leg');
  const pairs = legs.length;
  if (pairs === 0) return;
  const slots = legSlots(pairs);
  legs.sort((x, y) => x.attachT - y.attachT); // front-to-back; assign slots in order
  legs.forEach((leg, i) => {
    leg.pair = true; // legs are always mirrored
    leg.attachT = clamp(lerp(leg.attachT, slots[i], coh), AP.attachT);
    leg.attachAzimuth = pullLegAzimuth(leg.attachAzimuth, coh);
    leg.attachElevation = lerp(leg.attachElevation, 0, coh); // legs don't tilt fore/aft
    leg.roll = lerp(leg.roll, 0, coh);
  });
}

/** The head = the front-most body section (the deepest `child`), or the trunk if there is none. */
function frontSegment(g: Genome): SegmentGene {
  let s = g.body;
  while (s.child) s = s.child;
  return s;
}

function ensureBilateralFace(g: Genome): void {
  const head = frontSegment(g);
  ensureFace(head.appendages, (head.size[0] + head.size[1]) / 2);
}

/** Guarantee a prominent eye-set + a mouth (M24/M19): synthesize them if mutation deleted them,
 *  and floor the sizes so they always read. The mouth is kept on the face front. */
function ensureFace(apps: AppendageGene[], girth: number): void {
  const eyes = apps.filter((p) => p.terminal === 'eye');
  if (eyes.length === 0) apps.push(faceEye(girth));
  else
    for (const e of eyes) {
      // Prominent but PROPORTIONATE. The floor is measured against the head segment's girth, while
      // the head *node* tapers smaller than that — so a bare `girth * 0.45` floor grew eyes nearly
      // as wide as the skull, two balls that owned the whole face and occluded the mouth behind
      // them. Keep a floor (M19: eyes are the emotional anchor) but cap it against the same girth.
      // Cap for proportion FIRST, then floor for prominence — in the other order the cap wins on
      // small-headed creatures (girth < 0.28) and silently defeats the floor it was paired with,
      // leaving eyes smaller than M19 promises. Prominence outranks proportion when they collide.
      e.thickness = clamp(Math.max(0.075, Math.min(Math.max(e.thickness, girth * 0.17), girth * 0.26)), AP.thickness);
      // and keep them off the snout tip, so the muzzle front belongs to the mouth
      e.attachElevation = clamp(Math.min(e.attachElevation, 0.75), AP.attachElevation);
    }

  const mouths = apps.filter((p) => p.terminal === 'mouth');
  if (mouths.length === 0) apps.push(faceMouth(girth));
  else
    for (const m of mouths) {
      m.thickness = clamp(Math.max(m.thickness, 0.26, girth * 0.46), AP.thickness); // a big, clearly-read mouth
      // Keep the maw on the FACE, not under the chin. `aim` is [cos(e)cos(a), cos(e)sin(a), sin(e)]
      // with the maw's azimuth ≈ 3π/2, so elevation IS the fore/aft tilt, and it sets where the
      // organ SEATS as well as where it points. At 0.4 the mouth aims ~66° at the ground; even at
      // 0.85 it seated behind the (large, forward-set) eyes, which occluded it entirely. 0.95 puts
      // the maw out front on the snout — the frontmost face feature, the way a muzzle reads. The
      // sampler in random.ts deliberately draws ABOVE this floor: a floor covering the whole
      // sampled range would pin every creature's mouth to one constant and kill the gene.
      m.attachElevation = clamp(Math.max(m.attachElevation, 0.95), AP.attachElevation);
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
