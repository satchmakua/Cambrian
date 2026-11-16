/**
 * Thin limbs drawn exact. A limb link not much thicker than the skin's grid cell is more than marching
 * tets can resolve: at a cell or so across, a spider's leg, an octopus's arm tip, a tail's last links
 * came out beaded — the outline wobbling with every cell the link crossed — and since such a link is
 * floored at 0.88 of a cell to keep it whole, it came out too thick as well (a cat's tail tip at twice
 * its girth; on the World's coarser skins every leg of a cat, two or three times over). So a limb link
 * that thin leaves the field, and is drawn as what the field says it is: a round cone, with a sphere
 * at each joint. The tubes are appended to the skin's own geometry, so the covering shader, the rig's
 * skin weights (which already know these cones) and the fur shells treat them as skin.
 *
 * Where the field hands a limb on to a tube, the field's cone is tucked in under the tube's joint
 * sphere (see splitThin): two surfaces of the same girth meeting there would fight over the pixels.
 */
import type { Phenotype } from '../engine/grow';
import { roundConeDist, setCone, withoutCones, type FieldPrims } from './bodyField';

/** a limb link at most this many grid cells thick is drawn exact */
export const TUBE_THIN = 1.6;
/** A HOOVED leg's knee (its carpus) and its hock (tarsus) — the joint above its hoof — is a knob: the ball
 *  there this much wider than the links it joins. (A ball of the joint's own girth, swept through or not,
 *  a deer's leg ran from its forearm to its hoof as one smooth tapering stilt: no knee, no hock.) */
export const HOOF_KNOB = 1.35;
/** …and the knob is a SWELLING, not a ball on a stick: each link it joins widens into it over this many of
 *  the joint's girths (a smoothstep, flat where it meets the ball), and the field's limb above it swells
 *  into it as well (see KNOB_COLLAR). A bare ball 1.35× its links met them in a crease at either side of
 *  its equator — its top lit, a dark line under it: a pale ring seam at every knee and hock, the leg a
 *  stack of tubes. */
export const KNOB_EASE = 2.2;
/** where the field's limb hands on at a knob, a collar of tube rises out of it into the knob: from this
 *  share of the field limb's girth (sunk inside its polygonized skin) at KNOB_EASE_FIELD girths above the
 *  joint, swelling to the knob's girth there */
export const KNOB_COLLAR = 0.9;
export const KNOB_EASE_FIELD = 2.6;
/** a field cone that tapers this steeply into a tube's joint (girth per length) or more is tucked in by
 *  slimming its end (to TUCK_SLIM of the joint's girth); a gentler one by stopping it short */
const TUCK_STEEP = 0.3;
const TUCK_SLIM = 0.6;
/** How a field cone's end at a hand-over is tucked in (see splitThin): how far it is drawn in (× its
 *  length) and its girth there. A steep cone slims its end; a gentle one stops short by enough that its
 *  end cap stays inside the joint sphere (the ball of the joint's girth on the tube's side). */
function tuckEnd(r: number, rOther: number, L: number): { t: number; r: number } {
  const steep = (rOther - r) / L;
  if (steep >= TUCK_STEEP) return { t: 0, r: r * TUCK_SLIM };
  const s = Math.min(r * Math.max(0.3, (2.2 * steep) / (1 - steep * steep) + 0.15), 0.42 * L);
  return { t: s / L, r: r + (rOther - r) * (s / L) };
}

/**
 * THE HAND-OVER COLLAR. Where the field hands a limb on to a tube, the field's end is tucked in under the
 * tube's joint ball — and the polygonized skin round a tucked end is not the limb's: its rounded end
 * turns its face down (lit from above, a dark band), the ball's top turns its face up just under it (a
 * bright one), and the marching tets bend the skin's normals down a cell or more above that. A dog's every
 * wrist and hock wore a sock's top: a crease ring, the leg dark above it and pale below. So the tube runs
 * on UP the field's limb as a collar of the limb's own girth — HAND_PROUD proud of it at the hold, where the
 * field's tucked end and its bent normals lie (the tuck, and HAND_HOLD_CELLS grid cells beyond it) — then
 * sinks into the field's own clean flank, to HAND_SINK of its girth, over HAND_EASE of the joint's girths:
 * where the two cross they have one girth and one lean, and no seam shows. (A knob's collar: KNOB_COLLAR.)
 */
export const HAND_PROUD = 0.025;
export const HAND_HOLD_CELLS = 1.5;
export const HAND_SINK = 0.97;
export const HAND_EASE = 1.6;
/** …the hold is at most this share of the collar (the rest, its ease) */
export const HAND_HOLD_SHARE = 0.4;
/** …the collar reaches at most this share of the field's limb up from the joint (clear of its next joint):
 *  up the one link, or through the gentle joints of a chain (a tail's spline) as far as HAND_RUN girths */
export const HAND_REACH = 0.8;
export const HAND_RUN = 6;
/** …in this many rings */
export const HAND_RINGS = 9;
/** …and is drawn only where that much of the field's limb is at least this many of the joint's girths long */
export const HAND_LINK = 1.0;

const keyOf = (x: number, y: number, z: number) => `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

/**
 * A JOINTED SHELL's leg — an insect's, a spider's, a crab's, a centipede's — is a row of stiff
 * podomeres, not a hose: each of its links is drawn as a segment of its own, pinched in to PODO_WAIST
 * of its girth at every joint it shares with the next and darker there (the joint's membrane). Drawn
 * as the field has it — round cones with a ball of the joint's girth at each knee — every arthropod
 * stood on smooth tubes strung with beads: a doll's ball joints.
 */
export const PODO_WAIST = 0.72;
/** the shade at a podomere joint (× the skin's own: the membrane between two plates) */
export const PODO_DARK = 0.62;
/** how far a podomere's pinch reaches from its joint, in its girths (at most a quarter of its length) */
export const PODO_EASE = 0.6;

/** the leg terminals of a vertebrate's column — a leg ending in one is never a row of podomeres */
const BEAST_FEET: ReadonlySet<string> = new Set(['paw', 'hoof', 'hand']);

/** Which of the field's cones are a jointed shell's leg links (podomeres), or null when none is. */
export function podomeres(p: Phenotype, full: FieldPrims): Uint8Array | null {
  if (p.genomeRef.covering.type !== 'chitin') return null;
  // (a leg that stands on a paw, a hoof or a hand is a beast's, whatever its hide: a chitin-coated chimera's,
  // pinched in and darkened at its knee and its wrist, was a jointed doll's, a stack of capsules on padded paws)
  if (p.nodes.some((n) => n.part?.kind === 'leg' && BEAST_FEET.has(n.terminal ?? ''))) return null;
  const out = new Uint8Array(full.nc);
  let any = false;
  for (let m = 0; m < full.nc; m++) {
    if (full.ia[m] === full.ib[m] || full.an[m]) continue;
    const a = p.nodes[full.ia[m]], b = p.nodes[full.ib[m]];
    if (a.kind === 'spine' || b.kind === 'spine' || a.part?.kind !== 'leg' || b.part?.kind !== 'leg') continue;
    out[m] = 1;
    any = true;
  }
  return any ? out : null;
}

/**
 * A bare TIP — a tail's or a tentacle's that ends in nothing (no fin, club, barb or brush drawn there) —
 * runs on past its last node to a point, TIP_POINT of its girth long. (Capped with a ball of its last
 * node's girth — never under R_MIN — every such tail ended in a blunt round fingertip: a wyvern's, a
 * snake's, a mouse's pink rod, a dragon's, a horror's tentacles ending like hoses.)
 */
export const TIP_POINT = 2.4;

/** Which of the field's cones end a bare tail or tentacle (see TIP_POINT), or null when none does. */
export function bareTips(p: Phenotype, full: FieldPrims): Uint8Array | null {
  const leaf = new Uint8Array(p.nodes.length).fill(1);
  for (const [a] of p.edges) leaf[a] = 0;
  const out = new Uint8Array(full.nc);
  let any = false;
  for (let m = 0; m < full.nc; m++) {
    const b = p.nodes[full.ib[m]];
    if (full.ia[m] === full.ib[m] || !leaf[full.ib[m]] || b.kind === 'spine') continue;
    if (b.part?.kind !== 'tail' && b.part?.kind !== 'tentacle') continue;
    if (b.terminal && b.terminal !== 'none') continue;
    out[m] = 1;
    any = true;
  }
  return any ? out : null;
}

export interface ThinSplit {
  /** the field without its thin limb links, the cones that hand on to one tucked in under its joint */
  field: FieldPrims;
  /** per cone of `field`: 1 — its a end hands on to a tube, 2 — its b end does (neither is floored) */
  handoff: Uint8Array;
  /** the thin links, as cone indices into the full field */
  tubes: number[];
  /** the ends of the field's own cones (keyOf) — a tube's joint there meets the polygonized skin */
  fieldEnds: Set<string>;
  /** per cone of the full field: 1 — a podomere (drawn as a tube whatever its girth), or null */
  podo: Uint8Array | null;
  /** per cone of the full field: 1 — it ends a bare tail or tentacle (drawn on to a point), or null */
  tips: Uint8Array | null;
  /** the joints (keyOf) drawn as knobs: a hooved leg's knee and hock (see HOOF_KNOB) */
  knobs?: Set<string>;
  /** per cone of the full field: 1 — its a end hands a limb on to a tube under a collar, 2 — its b end does
   *  (a limb's own round link; see HAND_PROUD) */
  collars?: Uint8Array;
}

/** Which of the field's limb links are too thin for the grid (`cell`) — or are a jointed shell's leg
 *  links, drawn exact at any girth — and the field without them; or null when there are none (or
 *  nothing else would be left to polygonize). */
export function splitThin(p: Phenotype, full: FieldPrims, cell: number): ThinSplit | null {
  const thin = new Uint8Array(full.nc);
  const tubes: number[] = [];
  const podo = podomeres(p, full);
  const tips = bareTips(p, full);
  for (let m = 0; m < full.nc; m++) {
    // a limb's own links only: a cone from the trunk is the limb's root (it blends into the body), a
    // shaped link keeps its cross-section in the field
    if (full.ia[m] === full.ib[m] || full.an[m]) continue;
    if (p.nodes[full.ia[m]].kind === 'spine' || p.nodes[full.ib[m]].kind === 'spine') continue;
    // (a jointed shell's leg links, and a bare tail's or tentacle's last, are drawn exact at any girth)
    if (Math.max(full.ra[m], full.rb[m]) >= TUBE_THIN * cell && !podo?.[m] && !tips?.[m]) continue;
    thin[m] = 1;
    tubes.push(m);
  }
  if (tubes.length === 0 || (tubes.length === full.nc && full.ne === 0)) return null;

  const tubeAt = new Set<string>();
  for (const m of tubes) {
    tubeAt.add(keyOf(full.ax[m], full.ay[m], full.az[m]));
    tubeAt.add(keyOf(full.bx[m], full.by[m], full.bz[m]));
  }
  const field = withoutCones(full, (m) => !thin[m]);
  const fieldAt = new Map<string, number>();
  const bump = (k: string) => fieldAt.set(k, (fieldAt.get(k) ?? 0) + 1);
  for (let i = 0; i < field.nc; i++) {
    bump(keyOf(field.ax[i], field.ay[i], field.az[i]));
    bump(keyOf(field.bx[i], field.by[i], field.bz[i]));
  }
  const handoff = new Uint8Array(field.nc);
  const collars = new Uint8Array(full.nc);
  const fullOf: number[] = [];
  for (let m = 0; m < full.nc; m++) if (!thin[m]) fullOf.push(m);
  for (let i = 0; i < field.nc; i++) {
    const A = [field.ax[i], field.ay[i], field.az[i]];
    const B = [field.bx[i], field.by[i], field.bz[i]];
    const kA = keyOf(A[0], A[1], A[2]), kB = keyOf(B[0], B[1], B[2]);
    // (only where this cone is the field's one cone at the joint: at a fork, the rest carry on)
    const atA = tubeAt.has(kA) && fieldAt.get(kA) === 1;
    const atB = tubeAt.has(kB) && fieldAt.get(kB) === 1;
    if (!atA && !atB) continue;
    const L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    if (L < 1e-9) continue;
    let rA = field.ra[i], rB = field.rb[i];
    let tA = 0, tB = 0; // how far each end is drawn in (× L)
    // tuck an end in (see tuckEnd)
    const tuck = (r: number, rOther: number) => tuckEnd(r, rOther, L);
    if (atB) {
      const k = tuck(rB, rA);
      tB = k.t;
      rB = k.r;
      handoff[i] |= 2;
    }
    if (atA) {
      const k = tuck(field.ra[i], field.rb[i]);
      tA = k.t;
      rA = k.r;
      handoff[i] |= 1;
    }
    const at = (t: number) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    setCone(field, i, at(tA), at(1 - tB), rA, rB);
    // (a limb's own round link hands on under a collar: a cone from the trunk is the limb's root, blended
    // into the body, and a shaped link keeps its cross-section)
    const m = fullOf[i];
    if (!field.an[i] && p.nodes[field.ia[i]].kind !== 'spine' && p.nodes[field.ib[i]].kind !== 'spine') collars[m] = handoff[i];
  }
  // a hooved leg's knee and hock: the leg node its hoof hangs from
  const knobs = new Set<string>();
  const parentOf = new Map(p.edges.map(([a, b]) => [b, a]));
  p.nodes.forEach((n, i) => {
    const k = n.terminal === 'hoof' ? parentOf.get(i) : undefined;
    if (k !== undefined && p.nodes[k].part?.kind === 'leg') knobs.add(keyOf(p.nodes[k].pos[0], p.nodes[k].pos[1], p.nodes[k].pos[2]));
  });
  for (let m = 0; m < full.nc; m++) {
    // (a knob's own collar swells into it: see KNOB_COLLAR)
    if (collars[m] & 1 && knobs.has(keyOf(full.ax[m], full.ay[m], full.az[m]))) collars[m] &= 2;
    if (collars[m] & 2 && knobs.has(keyOf(full.bx[m], full.by[m], full.bz[m]))) collars[m] &= 1;
  }
  return { field, handoff, tubes, fieldEnds: new Set(fieldAt.keys()), podo, tips, knobs, collars };
}

export interface Tubes {
  positions: Float32Array;
  normals: Float32Array;
  ao: Float32Array;
  indices: Uint32Array;
}

/** radial segments for a tube of girth r on a grid of `cell` (fine enough that the outline is round) */
const segsFor = (r: number, cell: number) => Math.max(6, Math.min(16, Math.ceil((2 * Math.PI * r) / (0.55 * cell))));

/** how near a joint where the field hands a limb on (× its girth) a tube takes the limb's own shade */
export const HANDOVER_SHADE = 1.6;

/** a joint between two links of one chain bent less than this (radians) is swept through, not balled */
const SWEEP_BEND = 0.45;

interface Joint {
  c: number[];
  r: number;
  /** the links that end here, and those that start here */
  ins: number[];
  outs: number[];
  /** swept through: one link in, one out, gently bent, and no field skin here */
  smooth: boolean;
  /** a podomere joint: links in and out, every one a podomere, and no field skin here */
  pinch: boolean;
  /** a bare tip: one link in, none out, no field skin here — drawn on to a point (see TIP_POINT) */
  tip: boolean;
  /** a hooved leg's knee or hock: a swelling the links widen into (see HOOF_KNOB, KNOB_EASE) */
  knob?: boolean;
}

/**
 * The thin links as meshes. A chain of links bent gently at each joint (a tail, a tentacle cut into
 * its spline) is swept as one tube; a sharp joint (a knee), a fork, a free tip and the joint where the
 * field hands a limb on are each a ball of the joint's girth — less what lies buried inside the links
 * it joins. A jointed shell's leg links (`split.podo`) are each a segment of their own, pinched in at
 * the joints between them (see PODO_WAIST). `aoAt` is the skin's occlusion probe (the body above a leg
 * shades it).
 */
export function limbTubes(
  full: FieldPrims,
  split: Pick<ThinSplit, 'tubes' | 'fieldEnds'> & { podo?: Uint8Array | null; tips?: Uint8Array | null; knobs?: Set<string>; collars?: Uint8Array },
  cell: number,
  aoAt: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number,
  skin?: { positions: Float32Array; ao: Float32Array },
): Tubes {
  const tubes = split.tubes;
  const podo = split.podo ?? null;
  const pos: number[] = [];
  const nrm: number[] = [];
  /** per vertex: the membrane's shade at a podomere joint (1 elsewhere) */
  const mem: number[] = [];
  const idx: number[] = [];
  const A = (m: number) => [full.ax[m], full.ay[m], full.az[m]];
  const B = (m: number) => [full.bx[m], full.by[m], full.bz[m]];
  const lenOf = (m: number) => Math.hypot(full.bx[m] - full.ax[m], full.by[m] - full.ay[m], full.bz[m] - full.az[m]);
  const dirOf = (m: number) => {
    const a = A(m), b = B(m);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
    return [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
  };
  const joints = new Map<string, Joint>();
  const joint = (p: number[], r: number): Joint => {
    const k = keyOf(p[0], p[1], p[2]);
    let j = joints.get(k);
    if (!j) joints.set(k, (j = { c: p, r, ins: [], outs: [], smooth: false, pinch: false, tip: false }));
    j.r = Math.max(j.r, r);
    return j;
  };
  const startOf = new Map<number, Joint>();
  const endOf = new Map<number, Joint>();
  for (const m of tubes) {
    const ja = joint(A(m), full.ra[m]);
    ja.outs.push(m);
    startOf.set(m, ja);
    const jb = joint(B(m), full.rb[m]);
    jb.ins.push(m);
    endOf.set(m, jb);
  }
  for (const [k, j] of joints) {
    // (a hooved leg's knee or hock: a ball, never swept through, wider than its links — see HOOF_KNOB)
    if (split.knobs?.has(k)) {
      j.r *= HOOF_KNOB;
      j.knob = true;
      continue;
    }
    if (split.fieldEnds.has(k)) continue;
    if (split.tips && j.ins.length === 1 && j.outs.length === 0 && split.tips[j.ins[0]]) {
      j.tip = true;
      continue;
    }
    if (podo && j.ins.length > 0 && j.outs.length > 0 && [...j.ins, ...j.outs].every((m) => podo[m])) {
      j.pinch = true;
      continue;
    }
    if (j.ins.length !== 1 || j.outs.length !== 1) continue;
    const u = dirOf(j.ins[0]), w = dirOf(j.outs[0]);
    j.smooth = Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1] + u[2] * w[2]))) < SWEEP_BEND;
  }

  // a podomere's PINCH at each end: how far it reaches back from a podomere joint (0 — none), its girth
  // along it, and the membrane's shade
  const pinA = new Float64Array(full.nc);
  const pinB = new Float64Array(full.nc);
  for (const m of tubes) {
    if (!podo?.[m]) continue;
    const L = lenOf(m);
    if (startOf.get(m)!.pinch) pinA[m] = Math.min(PODO_EASE * full.ra[m], 0.25 * L);
    if (endOf.get(m)!.pinch) pinB[m] = Math.min(PODO_EASE * full.rb[m], 0.25 * L);
  }
  // a link's SWELL into a knob at each end: how far it reaches back from the knob (0 — none)
  const swA = new Float64Array(full.nc);
  const swB = new Float64Array(full.nc);
  for (const m of tubes) {
    const L = lenOf(m);
    if (startOf.get(m)!.knob) swA[m] = Math.min(KNOB_EASE * full.ra[m], 0.45 * L);
    if (endOf.get(m)!.knob) swB[m] = Math.min(KNOB_EASE * full.rb[m], 0.45 * L);
  }
  const ease = (d: number, e: number) => (e <= 0 || d >= e ? 1 : PODO_WAIST + (1 - PODO_WAIST) * (1 - (1 - d / e) ** 2));
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const swell = (d: number, e: number) => (e <= 0 || d >= e ? 1 : 1 + (HOOF_KNOB - 1) * smooth(1 - d / e));
  const girthAt = (m: number, t: number, L: number) =>
    (full.ra[m] + ((full.rb[m] - full.ra[m]) * t) / L) * ease(t, pinA[m]) * ease(L - t, pinB[m]) * swell(t, swA[m]) * swell(L - t, swB[m]);
  const shadeOf = (d: number, e: number) => (e <= 0 ? 1 : PODO_DARK + (1 - PODO_DARK) * Math.min(1, d / (0.6 * e)) ** 2);
  const membrane = (m: number, t: number, L: number) => Math.min(shadeOf(t, pinA[m]), shadeOf(L - t, pinB[m]));

  // a piece's vertices, then its triangles — dropping a triangle whose corners all lie inside one of
  // the links it meets (the inside of a bent knee, the half of a joint ball sunk in its own links).
  // (Nothing is cut at a podomere joint: its ball is slimmer than the segments either side, and a pose
  // that bends the knee further than the rest shape did opens the joint's outer side — cut to the rest
  // shape's wedge, the ball left a hole there you could see the ground through.)
  const piece = (base: number, near: readonly number[], margin: number, tris: number[]) => {
    const n = pos.length / 3 - base;
    const buried = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      const x = pos[(base + v) * 3], y = pos[(base + v) * 3 + 1], z = pos[(base + v) * 3 + 2];
      for (const o of near) {
        if (roundConeDist(x, y, z, full.ax[o], full.ay[o], full.az[o], full.bx[o], full.by[o], full.bz[o], full.ra[o], full.rb[o]) < -margin) {
          buried[v] = 1;
          break;
        }
      }
    }
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      if (buried[a] && buried[b] && buried[c]) continue;
      // wind it to face out (the way its corners' normals point)
      const ia = (base + a) * 3, ib = (base + b) * 3, ic = (base + c) * 3;
      const ux = pos[ib] - pos[ia], uy = pos[ib + 1] - pos[ia + 1], uz = pos[ib + 2] - pos[ia + 2];
      const wx = pos[ic] - pos[ia], wy = pos[ic + 1] - pos[ia + 1], wz = pos[ic + 2] - pos[ia + 2];
      const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
      const ox = nrm[ia] + nrm[ib] + nrm[ic], oy = nrm[ia + 1] + nrm[ib + 1] + nrm[ic + 1], oz = nrm[ia + 2] + nrm[ib + 2] + nrm[ic + 2];
      if (fx * ox + fy * oy + fz * oz >= 0) idx.push(base + a, base + b, base + c);
      else idx.push(base + a, base + c, base + b);
    }
  };

  // --- the runs: chains of links swept through their gentle joints ---
  const done = new Set<number>();
  for (const m0 of tubes) {
    if (done.has(m0)) continue;
    let first = m0;
    for (let guard = 0; startOf.get(first)!.smooth && guard < tubes.length; guard++) first = startOf.get(first)!.ins[0];
    const run: number[] = [];
    for (let m = first, guard = 0; guard <= tubes.length; guard++) {
      run.push(m);
      done.add(m);
      const e = endOf.get(m)!;
      if (!e.smooth || done.has(e.outs[0])) break;
      m = e.outs[0];
    }
    // rings: along each link (straight cone, linearly tapered), and one shared at each swept joint,
    // square to the mean of the two links' headings
    let rMax = 0;
    for (const m of run) rMax = Math.max(rMax, full.ra[m], full.rb[m]);
    const segs = segsFor(rMax, cell);
    const rings: { p: number[]; t: number[]; r: number; s: number; k: number }[] = [];
    run.forEach((m, k) => {
      const a = A(m), b = B(m), u = dirOf(m);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const s = L > 1e-9 ? (full.ra[m] - full.rb[m]) / L : 0; // the flank's lean (sin of its half-angle)
      const along = Math.min(6, Math.max(1, Math.round(L / (2 * Math.max(full.ra[m], full.rb[m])))));
      const at = (t: number) => [a[0] + u[0] * t, a[1] + u[1] * t, a[2] + u[2] * t];
      if (pinA[m] > 0 || pinB[m] > 0 || swA[m] > 0 || swB[m] > 0) {
        // a pinched podomere (always a run of its own), or a link swelling into a knob: rings close enough
        // through each pinch or swell to draw its shoulder, each leaning as the girth there runs in or out
        const ts = new Set<number>();
        for (let j = 0; j <= along; j++) ts.add((j / along) * L);
        for (const f of [0.2, 0.45, 0.7, 1]) {
          if (pinA[m] > 0) ts.add(f * pinA[m]);
          if (pinB[m] > 0) ts.add(L - f * pinB[m]);
        }
        for (const f of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
          if (swA[m] > 0) ts.add(f * swA[m]);
          if (swB[m] > 0) ts.add(L - f * swB[m]);
        }
        const h = 1e-4 * L;
        // (a link swept on from the one before it shares that link's last ring: see the joint ring below)
        if (k > 0) {
          const prev = rings[rings.length - 1];
          const t = [prev.t[0] + u[0], prev.t[1] + u[1], prev.t[2] + u[2]];
          const tl = Math.hypot(t[0], t[1], t[2]) || 1;
          prev.t = [t[0] / tl, t[1] / tl, t[2] / tl];
          ts.delete(0);
        }
        for (const t of [...ts].sort((x, y) => x - y)) {
          const dr = (girthAt(m, Math.min(L, t + h), L) - girthAt(m, Math.max(0, t - h), L)) / (Math.min(L, t + h) - Math.max(0, t - h));
          rings.push({ p: at(t), t: u, r: girthAt(m, t, L), s: -dr / Math.sqrt(1 + dr * dr), k: membrane(m, t, L) });
        }
        return;
      }
      if (k === 0) rings.push({ p: a, t: u, r: full.ra[m], s, k: 1 });
      else {
        // the shared ring at the joint: the mean heading and lean of the links either side
        const prev = rings[rings.length - 1];
        const t = [prev.t[0] + u[0], prev.t[1] + u[1], prev.t[2] + u[2]];
        const tl = Math.hypot(t[0], t[1], t[2]) || 1;
        prev.t = [t[0] / tl, t[1] / tl, t[2] / tl];
        prev.s = (prev.s + s) / 2;
      }
      for (let j = 1; j <= along; j++) {
        const f = j / along;
        rings.push({ p: at(f * L), t: u, r: full.ra[m] + (full.rb[m] - full.ra[m]) * f, s, k: 1 });
      }
    });
    // a bare tip runs on past its last node to a point (its girth drawn in, a little full at first)
    const last = run[run.length - 1];
    if (endOf.get(last)!.tip) {
      const b = B(last), u = dirOf(last), rb = full.rb[last];
      const Lp = TIP_POINT * rb;
      const K = 5;
      for (let k = 1; k <= K; k++) {
        const f = k / K;
        const dr = (-rb * 0.8 * Math.pow(Math.max(1 - f, 1e-3), -0.2)) / Lp;
        rings.push({ p: [b[0] + u[0] * f * Lp, b[1] + u[1] * f * Lp, b[2] + u[2] * f * Lp], t: u, r: rb * Math.pow(1 - f, 0.8), s: -dr / Math.sqrt(1 + dr * dr), k: 1 });
      }
    }
    const base = pos.length / 3;
    let e1 = perp(rings[0].t);
    for (const ring of rings) {
      const t = ring.t;
      // carry the frame along (no twist): the last ring's first axis, squared to this ring's heading
      const d = e1[0] * t[0] + e1[1] * t[1] + e1[2] * t[2];
      let v = [e1[0] - t[0] * d, e1[1] - t[1] * d, e1[2] - t[2] * d];
      const vl = Math.hypot(v[0], v[1], v[2]);
      v = vl > 1e-6 ? [v[0] / vl, v[1] / vl, v[2] / vl] : perp(t);
      e1 = v;
      const e2 = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]];
      const sn = Math.max(-0.95, Math.min(0.95, ring.s)), cs = Math.sqrt(1 - sn * sn);
      for (let j = 0; j < segs; j++) {
        const ph = (2 * Math.PI * j) / segs;
        const c = Math.cos(ph), sj = Math.sin(ph);
        const dx = e1[0] * c + e2[0] * sj, dy = e1[1] * c + e2[1] * sj, dz = e1[2] * c + e2[2] * sj;
        pos.push(ring.p[0] + dx * ring.r, ring.p[1] + dy * ring.r, ring.p[2] + dz * ring.r);
        nrm.push(dx * cs + t[0] * sn, dy * cs + t[1] * sn, dz * cs + t[2] * sn);
        mem.push(ring.k);
      }
    }
    const tris: number[] = [];
    for (let k = 0; k + 1 < rings.length; k++) {
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        const v00 = k * segs + j, v01 = k * segs + j1, v10 = (k + 1) * segs + j, v11 = (k + 1) * segs + j1;
        tris.push(v00, v01, v10, v01, v11, v10);
      }
    }
    const ends = [startOf.get(run[0])!, endOf.get(run[run.length - 1])!].filter((j) => !j.pinch);
    const inRun = new Set(run);
    const near = [...new Set(ends.flatMap((j) => [...j.ins, ...j.outs]))].filter((o) => !inRun.has(o));
    piece(base, near, 0.03 * rMax, tris);
  }

  // --- the collars: where the field's limb hands on, the tube runs on up it (see HAND_PROUD) — and where
  // it hands on at a knob, it swells into the knob instead (see KNOB_COLLAR) ---
  const tubeSet = new Set(tubes);
  const fieldEndsAt = new Map<string, number[]>(); // the field's cones (full indices) with an end at a point
  for (let m = 0; m < full.nc; m++) {
    if (tubeSet.has(m)) continue;
    for (const k of [keyOf(full.ax[m], full.ay[m], full.az[m]), keyOf(full.bx[m], full.by[m], full.bz[m])]) fieldEndsAt.set(k, [...(fieldEndsAt.get(k) ?? []), m]);
  }
  for (let m0 = 0; m0 < full.nc; m0++) {
    const hand = split.collars?.[m0] ?? 0;
    for (const atB of [false, true]) {
      if (!(hand & (atB ? 2 : 1))) continue;
      const J = atB ? B(m0) : A(m0);
      const j = joints.get(keyOf(J[0], J[1], J[2]));
      if (!j) continue;
      // the field's limb up from the joint: this link, and on through the gentle joints of its chain (a tail's
      // or a tentacle's spline pieces) — its axis as a polyline, its girth at each point, the length along it
      const pts: number[][] = [J];
      const rs: number[] = [atB ? full.rb[m0] : full.ra[m0]];
      const at: number[] = [0];
      let m = m0, fromB = atB;
      for (let guard = 0; guard < 8; guard++) {
        const O = fromB ? A(m) : B(m);
        const P = pts[pts.length - 1];
        const L = Math.hypot(O[0] - P[0], O[1] - P[1], O[2] - P[2]);
        pts.push(O);
        rs.push(fromB ? full.ra[m] : full.rb[m]);
        at.push(at[at.length - 1] + L);
        if (at[at.length - 1] >= HAND_RUN * rs[0]) break;
        const kO = keyOf(O[0], O[1], O[2]);
        const next = (fieldEndsAt.get(kO) ?? []).filter((o) => o !== m);
        if (next.length !== 1 || (fieldEndsAt.get(kO) ?? []).length !== 2 || tubeSet.has(next[0])) break;
        const n = next[0];
        // (the same limb's chain — a trunk's cones are a chain of their own — and round)
        if (full.ia[n] === full.ib[n] || full.an[n] || full.ch[n] !== full.ch[m]) break;
        const nFromB = keyOf(full.bx[n], full.by[n], full.bz[n]) === kO;
        const O2 = nFromB ? A(n) : B(n);
        const u1 = [O[0] - P[0], O[1] - P[1], O[2] - P[2]], u2 = [O2[0] - O[0], O2[1] - O[1], O2[2] - O[2]];
        const c = (u1[0] * u2[0] + u1[1] * u2[1] + u1[2] * u2[2]) / ((Math.hypot(u1[0], u1[1], u1[2]) * Math.hypot(u2[0], u2[1], u2[2])) || 1);
        if (Math.acos(Math.max(-1, Math.min(1, c))) >= SWEEP_BEND) break;
        m = n;
        fromB = nFromB;
      }
      const Ltot = at[at.length - 1];
      const rJ = rs[0];
      if (rJ <= 1e-6 || Ltot < HAND_LINK * rJ) continue;
      const seg = (d: number) => {
        let i = 0;
        while (i < at.length - 2 && d > at[i + 1]) i++;
        return { i, f: Math.min(1, Math.max(0, (d - at[i]) / Math.max(at[i + 1] - at[i], 1e-9))) };
      };
      const lin = (d: number) => {
        const { i, f } = seg(d);
        return rs[i] + (rs[i + 1] - rs[i]) * f;
      };
      // the hold: the tucked end (where a slimmed one comes back within a hair of the limb's girth) and the
      // cells over which the skin's normals still bend round it
      const L0 = at[1];
      const tk = tuckEnd(rJ, rs[1], L0);
      let held = tk.t * L0;
      if (tk.r < lin(held) * 0.99) {
        for (let i = 1; i <= 40; i++) {
          held = (i / 40) * L0;
          if (tk.r + ((rs[1] - tk.r) * held) / L0 >= 0.98 * lin(held)) break;
        }
      }
      const e = Math.min(held + HAND_HOLD_CELLS * cell + HAND_EASE * rJ, HAND_REACH * Ltot);
      const h = Math.min(held + HAND_HOLD_CELLS * cell, HAND_HOLD_SHARE * e);
      const w = (d: number) =>
        d <= h ? 1 + HAND_PROUD * smooth(d / h) : 1 + HAND_PROUD + (HAND_SINK - 1 - HAND_PROUD) * smooth(Math.min(1, (d - h) / (e - h)));
      const rAt = (d: number) => lin(d) * w(d);
      const K = HAND_RINGS;
      const segs = segsFor((1 + HAND_PROUD) * Math.max(rJ, lin(e)), cell);
      const base = pos.length / 3;
      // (the frame carried along without twist, as a run's rings are)
      const dirAt = (d: number) => {
        const { i } = seg(d);
        const a = pts[i], b2 = pts[i + 1];
        const l = Math.hypot(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]) || 1;
        return [(b2[0] - a[0]) / l, (b2[1] - a[1]) / l, (b2[2] - a[2]) / l];
      };
      let e1 = perp(dirAt(0));
      for (let i = 0; i <= K; i++) {
        const d = (e * i) / K;
        const { i: si, f } = seg(d);
        const c = [0, 1, 2].map((x) => pts[si][x] + (pts[si + 1][x] - pts[si][x]) * f);
        const v = dirAt(d); // up the field's limb, from the joint
        const dd = e1[0] * v[0] + e1[1] * v[1] + e1[2] * v[2];
        let q1 = [e1[0] - v[0] * dd, e1[1] - v[1] * dd, e1[2] - v[2] * dd];
        const ql = Math.hypot(q1[0], q1[1], q1[2]);
        q1 = ql > 1e-6 ? [q1[0] / ql, q1[1] / ql, q1[2] / ql] : perp(v);
        e1 = q1;
        const e2 = [v[1] * e1[2] - v[2] * e1[1], v[2] * e1[0] - v[0] * e1[2], v[0] * e1[1] - v[1] * e1[0]];
        const hh = 1e-4 * e;
        const dr = (rAt(Math.min(e, d + hh)) - rAt(Math.max(0, d - hh))) / (Math.min(e, d + hh) - Math.max(0, d - hh)); // girth per length up v
        // (the girth growing up the limb leans the face down it: −v)
        const sn = Math.max(-0.95, Math.min(0.95, dr / Math.sqrt(1 + dr * dr))), cs = Math.sqrt(1 - sn * sn);
        const r = rAt(d);
        for (let q = 0; q < segs; q++) {
          const ph = (2 * Math.PI * q) / segs;
          const dx = e1[0] * Math.cos(ph) + e2[0] * Math.sin(ph), dy = e1[1] * Math.cos(ph) + e2[1] * Math.sin(ph), dz = e1[2] * Math.cos(ph) + e2[2] * Math.sin(ph);
          pos.push(c[0] + dx * r, c[1] + dy * r, c[2] + dz * r);
          nrm.push(dx * cs - v[0] * sn, dy * cs - v[1] * sn, dz * cs - v[2] * sn);
          mem.push(1);
        }
      }
      const tris: number[] = [];
      for (let i = 0; i < K; i++) {
        for (let q = 0; q < segs; q++) {
          const q1 = (q + 1) % segs;
          tris.push(i * segs + q, i * segs + q1, (i + 1) * segs + q, i * segs + q1, (i + 1) * segs + q1, (i + 1) * segs + q);
        }
      }
      piece(base, [...j.ins, ...j.outs], 0.03 * j.r, tris);
    }
  }
  for (const [k, j] of joints) {
    if (!j.knob || !split.fieldEnds.has(k)) continue;
    for (let m = 0; m < full.nc; m++) {
      if (tubeSet.has(m) || full.ia[m] === full.ib[m] || keyOf(full.bx[m], full.by[m], full.bz[m]) !== k) continue;
      const a = A(m), u = dirOf(m), L = lenOf(m);
      const e = Math.min(KNOB_EASE_FIELD * full.rb[m], 0.45 * L);
      if (e <= 1e-6) continue;
      const rAt = (d: number) => {
        const lin = full.rb[m] + ((full.ra[m] - full.rb[m]) * d) / L;
        return lin * (KNOB_COLLAR + (HOOF_KNOB - KNOB_COLLAR) * smooth(1 - d / e));
      };
      const K = 10;
      const segs = segsFor(HOOF_KNOB * full.rb[m], cell);
      const base = pos.length / 3;
      const e1 = perp(u);
      const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
      for (let i = 0; i <= K; i++) {
        const d = e * (1 - i / K); // from the top of the collar down to the joint
        const c = [a[0] + u[0] * (L - d), a[1] + u[1] * (L - d), a[2] + u[2] * (L - d)];
        const hh = 1e-4 * e;
        const dr = (rAt(Math.max(0, d - hh)) - rAt(Math.min(e, d + hh))) / (Math.min(e, d + hh) - Math.max(0, d - hh)); // girth per length along u
        const sn = Math.max(-0.95, Math.min(0.95, -dr / Math.sqrt(1 + dr * dr))), cs = Math.sqrt(1 - sn * sn);
        const r = rAt(d);
        for (let q = 0; q < segs; q++) {
          const ph = (2 * Math.PI * q) / segs;
          const dx = e1[0] * Math.cos(ph) + e2[0] * Math.sin(ph), dy = e1[1] * Math.cos(ph) + e2[1] * Math.sin(ph), dz = e1[2] * Math.cos(ph) + e2[2] * Math.sin(ph);
          pos.push(c[0] + dx * r, c[1] + dy * r, c[2] + dz * r);
          nrm.push(dx * cs + u[0] * sn, dy * cs + u[1] * sn, dz * cs + u[2] * sn);
          mem.push(1);
        }
      }
      const tris: number[] = [];
      for (let i = 0; i < K; i++) {
        for (let q = 0; q < segs; q++) {
          const q1 = (q + 1) % segs;
          tris.push(i * segs + q, i * segs + q1, (i + 1) * segs + q, i * segs + q1, (i + 1) * segs + q1, (i + 1) * segs + q);
        }
      }
      piece(base, j.outs, 0.03 * j.r, tris);
    }
  }

  // --- the balls: every joint not swept through (a podomere joint's, its links' pinched girth) ---
  for (const j of joints.values()) {
    if (j.smooth || j.tip) continue;
    const jr = j.pinch ? PODO_WAIST * j.r : j.r;
    const k0 = j.pinch ? PODO_DARK : 1;
    const segs = segsFor(jr, cell);
    const bands = Math.max(3, Math.ceil(segs / 2));
    const base = pos.length / 3;
    const [cx, cy, cz] = j.c;
    pos.push(cx, cy + jr, cz);
    nrm.push(0, 1, 0);
    mem.push(k0);
    for (let i = 1; i < bands; i++) {
      const th = (Math.PI * i) / bands;
      const y = Math.cos(th), rr = Math.sin(th);
      for (let k = 0; k < segs; k++) {
        const ph = (2 * Math.PI * k) / segs;
        const x = rr * Math.cos(ph), z = rr * Math.sin(ph);
        pos.push(cx + x * jr, cy + y * jr, cz + z * jr);
        nrm.push(x, y, z);
        mem.push(k0);
      }
    }
    pos.push(cx, cy - jr, cz);
    nrm.push(0, -1, 0);
    mem.push(k0);
    const last = 1 + (bands - 1) * segs;
    const ring = (i: number, k: number) => 1 + (i - 1) * segs + (k % segs);
    const tris: number[] = [];
    for (let k = 0; k < segs; k++) tris.push(0, ring(1, k), ring(1, k + 1));
    for (let i = 1; i < bands - 1; i++) {
      for (let k = 0; k < segs; k++) tris.push(ring(i, k), ring(i + 1, k), ring(i + 1, k + 1), ring(i, k), ring(i + 1, k + 1), ring(i, k + 1));
    }
    for (let k = 0; k < segs; k++) tris.push(last, ring(bands - 1, k + 1), ring(bands - 1, k));
    piece(base, j.pinch ? [] : [...j.ins, ...j.outs], 0.03 * jr, tris);
  }

  // THE SHADE of a tube where the field hands it on. The joint's ball meets the field's limb, tucked in
  // under it, in a crease no limb has: probed from the ball, the field's own end overhung it (and its
  // vertices under the field's skin, probed from inside the limb, were black — hidden themselves, they
  // shade the visible part of every triangle they corner), so the ball wore a dark ring where it came
  // out of the skin: the top of a sock, a third of the way up a deer's leg, the skin just above it
  // unshaded. Near such a joint a tube is never darker than the polygonized skin round the joint.
  const handovers: { c: number[]; r: number; shade: number }[] = [];
  for (const [k, j] of joints) {
    if (!split.fieldEnds.has(k) || !skin) continue;
    let sum = 0, n = 0;
    const lo = j.r * 1.05, hi = j.r * 2.5;
    for (let v = 0; v < skin.ao.length; v++) {
      const dx = skin.positions[v * 3] - j.c[0], dy = skin.positions[v * 3 + 1] - j.c[1], dz = skin.positions[v * 3 + 2] - j.c[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < lo * lo || d2 > hi * hi) continue;
      sum += skin.ao[v];
      n++;
    }
    if (n > 0) handovers.push({ c: j.c, r: j.r, shade: sum / n });
  }
  const tubeShade = (x: number, y: number, z: number, nx: number, ny: number, nz: number): number => {
    const own = aoAt(x, y, z, nx, ny, nz);
    for (const h of handovers) {
      const vx = x - h.c[0], vy = y - h.c[1], vz = z - h.c[2];
      if (vx * vx + vy * vy + vz * vz <= HANDOVER_SHADE * HANDOVER_SHADE * h.r * h.r) return Math.max(own, h.shade);
    }
    return own;
  };

  // keep only the vertices a triangle still uses
  const nV = pos.length / 3;
  const remap = new Int32Array(nV).fill(-1);
  let n = 0;
  for (const v of idx) if (remap[v] < 0) remap[v] = n++;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const ao = new Float32Array(n);
  for (let v = 0; v < nV; v++) {
    const w = remap[v];
    if (w < 0) continue;
    for (let a = 0; a < 3; a++) {
      positions[w * 3 + a] = pos[v * 3 + a];
      normals[w * 3 + a] = nrm[v * 3 + a];
    }
    ao[w] = tubeShade(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) * mem[v];
  }
  return { positions, normals, ao, indices: Uint32Array.from(idx, (v) => remap[v]) };
}

/** a unit vector at right angles to unit u */
function perp(u: readonly number[]): number[] {
  const a = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const d = a[0] * u[0] + a[1] * u[1] + a[2] * u[2];
  const v = [a[0] - u[0] * d, a[1] - u[1] * d, a[2] - u[2] * d];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
