/**
 * Wing geometry — pure three.js BufferGeometry builders (no React), unit-testable headlessly.
 *
 * The old wing was one flat triangle fan drawn outward from the wing's TIP node: a kite. Real wings
 * are built from the shoulder and come in two very different constructions:
 *
 *   - FEATHERED (birds, feathered chimeras): at rest a bird's wing is FOLDED along the flank — one
 *     domed leaf painted in feather tiers: shingled coverts over the shoulder, secondaries along the
 *     lower edge (with a contrasting speculum band), and dark primaries stacked to the tip, reaching
 *     back past the hip. Spread, the same tiers open into an aerofoil with fingered primary tips —
 *     level in flight, and held RAISED at rest by a four-legged body (see wingCarriage).
 *   - MEMBRANE (dragons, wyverns, bats): spread and raised — a stout arm bone to the wrist, four
 *     finger bones fanning from it, and skin panels stretched between the fingers whose trailing
 *     edges sag in scallops between the tips and billow slightly out of plane, plus the hind panel
 *     back to the flank and a small thumb claw at the wrist.
 *
 * Everything is built in the creature's BODY frame (+Z forward, +Y up, ±X the side), relative to the
 * shoulder, so posture is controlled directly instead of inheriting whatever aim the part grew with.
 */
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { projectToSurface } from './bodyField';
import { surfacePrims, type SkinSurface } from './mouthLine';

export type WingKind = 'feathered' | 'membrane';

export interface WingBone {
  a: THREE.Vector3;
  b: THREE.Vector3;
  r0: number; // radius at a
  r1: number; // radius at b
  /** inside the body (a folded wing's upper arm): it shapes the skin, but isn't drawn */
  buried?: boolean;
}

export interface WingBuild {
  /** the membrane / feather surface (vertex-coloured for feathers) */
  surface: THREE.BufferGeometry;
  /** structural bones (membrane wings) — empty for feathered */
  bones: WingBone[];
  /** wrist position (thumb claw) for membrane wings */
  wrist: THREE.Vector3 | null;
  /** feathered sheets: each vertex's built height off the sheet's base plane (its dome / camber) —
   *  conformToSurface keeps it, so a wrapped wing stays domed instead of pressed flat */
  lift?: Float32Array;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// --- membrane ------------------------------------------------------------------------------------

/**
 * A spread membrane wing on side `side` (±1) with span `S`, relative to the shoulder at the origin.
 * `raise` (0..1) lifts the wing from a level glide to a high display.
 */
export function buildMembraneWing(side: number, S: number, raise = 0.6): WingBuild {
  const s = side >= 0 ? 1 : -1;
  // span axis: out, up and a little back; chord axis: back toward the trailing edge
  const u = v3(s, 0.35 + 0.5 * raise, -0.28).normalize();
  const c0 = v3(0, -0.2, -1);
  const c = c0.sub(u.clone().multiplyScalar(c0.dot(u))).normalize(); // orthogonal to the span
  const n = new THREE.Vector3().crossVectors(u, c).normalize(); // membrane normal (for billow)

  // A real arm: the humerus runs out and BACK to an elbow, the forearm forward and out again to the
  // wrist — the leading edge's M, where one straight bone from shoulder to wrist was a broom handle.
  const P0 = v3(0, 0, 0);
  const E = u.clone().multiplyScalar(0.27 * S).add(c.clone().multiplyScalar(0.09 * S)); // elbow
  const W = E.clone().add(u.clone().multiplyScalar(0.34 * S)).add(c.clone().multiplyScalar(-0.1 * S)); // wrist
  // the fingers root at staggered points along the hand (metacarpals), fanning from the wrist rather
  // than all springing from one point like umbrella ribs: angle from the span toward the chord, length
  const fingers: [number, number, number][] = [
    [0.1, 0.54, 0.0],
    [0.5, 0.5, 0.025],
    [0.92, 0.44, 0.05],
    [1.32, 0.36, 0.075],
  ];
  const roots = fingers.map(([, , back]) => W.clone().add(c.clone().multiplyScalar(back * S)));
  const tips = fingers.map(([th, L], i) =>
    roots[i].clone().add(u.clone().multiplyScalar(Math.cos(th) * L * S)).add(c.clone().multiplyScalar(Math.sin(th) * L * S)),
  );
  // the hind panel attaches back along the flank, a little below the shoulder
  const B = c.clone().multiplyScalar(0.5 * S).add(v3(0, -0.06 * S, 0));
  B.x = s * Math.max(s * B.x, 0.03 * S); // the hind panel meets ITS OWN flank, never across the midline
  // a little leading-edge skin (propatagium) from the shoulder out to the elbow
  const L0 = u.clone().multiplyScalar(0.14 * S).add(c.clone().multiplyScalar(-0.05 * S));

  const pos: number[] = [];
  const idx: number[] = [];
  const ROWS = 6;
  const COLS = 10;
  /** A skin panel fanning from hub H across the scalloped edge e0 → e1 (sagging toward H). */
  const panel = (H: THREE.Vector3, e0: THREE.Vector3, e1: THREE.Vector3, sag: number) => {
    const base = pos.length / 3;
    for (let i = 0; i <= COLS; i++) {
      const t = i / COLS;
      const edge = e0.clone().lerp(e1, t);
      // scallop: the free edge between two fingertips sags back toward the hub
      edge.lerp(H, sag * Math.sin(Math.PI * t));
      for (let j = 0; j <= ROWS; j++) {
        const r = j / ROWS;
        const p = H.clone().lerp(edge, r);
        // billow: the skin bellies out of plane between its bones
        p.add(n.clone().multiplyScalar(0.035 * S * Math.sin(Math.PI * r) * Math.sin(Math.PI * t)));
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const a = base + i * (ROWS + 1) + j;
        const b = a + ROWS + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  };
  panel(P0, L0, E, 0.0); // the leading-edge skin
  panel(roots[0], tips[0], tips[1], 0.12);
  panel(roots[1], tips[1], tips[2], 0.14);
  panel(roots[2], tips[2], tips[3], 0.14);
  panel(roots[3], tips[3], B, 0.2);
  panel(E, W, B, 0.0); // between the forearm and the flank
  panel(P0, E, B, 0.0); // the inner panel from the upper arm back to the flank

  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  surface.setIndex(idx);
  surface.computeVertexNormals();

  const bones: WingBone[] = [
    { a: P0, b: E, r0: 0.042 * S, r1: 0.032 * S }, // humerus
    { a: E, b: W, r0: 0.03 * S, r1: 0.022 * S }, // forearm
    ...tips.map((t, i) => ({ a: roots[i], b: t, r0: 0.02 * S * (1 - i * 0.12), r1: 0.005 * S })),
  ];
  return { surface, bones, wrist: W };
}

/** how far each finger tip of a folded membrane wing stands out from the flank (+) or in toward it (−),
 *  × the span: the gathered skin's pleats */
export const FOLD_PLEAT = [0.05, -0.02, 0.045, -0.01] as const;

/**
 * A FOLDED membrane wing on side `side` (±1), from a wing of span `S`, relative to the shoulder at the
 * origin: how a bat or a dragon holds its wings on the ground. The humerus runs back along the upper
 * flank to the elbow; the forearm comes forward and up again, so the wrist — and its thumb claw — stands
 * above the shoulder; the fingers run back and down the flank in a tight fan, the skin between them
 * pleated. (Held spread and raised all the time, a dragon walking the valley carried two poles on its
 * back, each a narrow strip of skin seen edge on.)
 */
/**
 * Where a membrane wing (a dragon's, a bat's) or a four-legged body's raised wing roots: at the
 * SHOULDERS — over the forelegs' root when the trunk carries two or more pairs of legs, else a little
 * ahead of the chest link's centre (a wyvern's wings are its arms) — at the upper corner of the trunk
 * there: out 0.55 of its half-width, up half its radius. The girth and height there are read between
 * the two trunk links either side. (Anchored on the trunk link nearest the grown wing root — the middle
 * of a three-link trunk, for most of them — the wrist stood behind the forelegs, the elbow behind the
 * hind legs, and the sail hung over the haunch and the root of the tail.)
 */
export function wingShoulder(p: Phenotype, side: number): [number, number, number] | null {
  const trunk = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0).sort((a, b) => a.pos[2] - b.pos[2]);
  if (!trunk.length) return null;
  const chest = trunk[trunk.length - 1];
  // the legs rooted on the trunk, by where they root
  const roots: number[] = [];
  for (const [a, b] of p.edges) {
    const A = p.nodes[a], B = p.nodes[b];
    if (B.part?.kind === 'leg' && A.kind === 'spine' && (A.segment ?? 0) === 0) roots.push(B.pos[2]);
  }
  const z = roots.length >= 4 ? Math.max(...roots) : chest.pos[2] + 0.2 * chest.radius;
  let i = 0;
  while (i < trunk.length - 2 && trunk[i + 1].pos[2] < z) i++;
  const a = trunk[i], b = trunk[Math.min(i + 1, trunk.length - 1)];
  const t = b === a ? 0 : Math.min(1, Math.max(0, (z - a.pos[2]) / (b.pos[2] - a.pos[2])));
  const lerp = (x: number, y: number) => x + (y - x) * t;
  const r = lerp(a.radius, b.radius);
  const rx = lerp(a.radius * (a.scale?.[0] ?? 1), b.radius * (b.scale?.[0] ?? 1));
  return [lerp(a.pos[0], b.pos[0]) + (side >= 0 ? 1 : -1) * rx * 0.55, lerp(a.pos[1], b.pos[1]) + r * 0.5, z];
}

/** a wing's open span off the trunk it has to carry (its length and girth), nudged by the wing's own
 *  thickness gene: the same at a typical 0.4, half again at 0.9 (see Wing in CreatureMesh) */
export function wingOpenSpan(p: Phenotype, tipRadius: number): { openS: number; trunkLen: number; girth: number; gene: number } {
  let z0 = Infinity, z1 = -Infinity, girth = 0;
  for (const n of p.nodes) {
    if (n.kind !== 'spine' || (n.segment ?? 0) !== 0) continue;
    z0 = Math.min(z0, n.pos[2] - n.radius);
    z1 = Math.max(z1, n.pos[2] + n.radius);
    girth = Math.max(girth, n.radius);
  }
  const trunkLen = Number.isFinite(z1 - z0) ? z1 - z0 : 1;
  const gene = Math.max(tipRadius, 0.06) / Math.max(girth, 0.1); // ~0.4–0.6 typical
  return { openS: Math.max(trunkLen * 1.15, girth * 3) * (0.55 + gene), trunkLen, girth, gene };
}

/** a folded membrane wing's span ×its open one: folded along the flank, its fingers reach further back */
export const MEMBRANE_FOLD = 1.35;

/** a WYVERN's wings are its arms (membrane wings on a trunk carrying ONE pair of legs): folded, the wing
 *  reaches back past the rump — its folded span at least ARM_FOLD of the trunk's length. (Sized off its
 *  short, reared trunk like a dragon's, seed 29's fold lay inside the outline of its flank — 2% of the
 *  side view, 9% of the front: two frills on its shoulders.) */
export const ARM_FOLD = 2.3;

/** a membrane wing's folded span: wingOpenSpan's, folded (MEMBRANE_FOLD) — and an arm-wing's floor */
export function foldedSpan(p: Phenotype, tipRadius: number): number {
  const { openS, trunkLen } = wingOpenSpan(p, tipRadius);
  let legRoots = 0;
  for (const [a, b] of p.edges) if (p.nodes[b].part?.kind === 'leg' && p.nodes[a].kind === 'spine' && (p.nodes[a].segment ?? 0) === 0) legRoots++;
  return Math.max(openS * MEMBRANE_FOLD, legRoots === 2 ? ARM_FOLD * trunkLen : 0);
}

export function buildFoldedMembraneWing(side: number, S: number): WingBuild {
  const s = side >= 0 ? 1 : -1;
  const out = v3(s, 0, 0); // the side: the folded wing's skin faces out from the flank
  const P0 = v3(0, 0, 0);
  const E = v3(0.05 * s * S, -0.06 * S, -0.2 * S); // the elbow, back along the flank
  // the wrist, forward and up again: the fold's peak, a little over the shoulder — the skin hangs DOWN
  // the flank from it (with the wrist a fifth of the span up, more of the fold stood over the back than
  // lay on the side: from the front, two sails)
  const W = v3(0.08 * s * S, 0.13 * S, 0.03 * S);
  // the fingers: from the hand, back and down in a fan (angle below the line back, length) — raked
  // down over the flank, so the folded skin hangs from the wrist like a cape, its top edge falling from
  // the wrist. (Run back nearly level — the first at 0.22 rad and 0.7 of the span long — the top finger
  // was a straight rod from the wrist to past the rump, the skin a flag hung from it.)
  const fingers: [number, number][] = [
    [0.42, 0.56],
    [0.66, 0.52],
    [0.9, 0.47],
    [1.12, 0.42],
  ];
  const back = v3(0, 0, -1), down = v3(0, -1, 0);
  const roots = fingers.map((_, i) => W.clone().add(v3(0, -0.012 * i * S, -0.018 * i * S)));
  // the skin between them is GATHERED: each tip stands out from the flank or in toward it by turns,
  // so the folded skin zig-zags like a closed fan (laid flat, it was one taut sheet: a sail, not a fold)
  const tips = fingers.map(([th, L], i) =>
    roots[i].clone().add(back.clone().multiplyScalar(Math.cos(th) * L * S)).add(down.clone().multiplyScalar(Math.sin(th) * L * S)).add(out.clone().multiplyScalar(FOLD_PLEAT[i] * S)),
  );
  // the hind panel meets the flank behind the elbow, low on it
  const B = v3(0.03 * s * S, -0.26 * S, -0.42 * S);

  const pos: number[] = [];
  const idx: number[] = [];
  const ROWS = 5;
  const COLS = 8;
  // a panel of skin from the hub H to the edge e0 → e1: its edge scalloped in by `sag`, its middle
  // bowed out from the flank by `bow` (a slack skin between two bones)
  const panel = (H: THREE.Vector3, e0: THREE.Vector3, e1: THREE.Vector3, sag: number, bow = 0) => {
    const base = pos.length / 3;
    for (let i = 0; i <= COLS; i++) {
      const t = i / COLS;
      const edge = e0.clone().lerp(e1, t);
      edge.lerp(H, sag * Math.sin(Math.PI * t));
      for (let j = 0; j <= ROWS; j++) {
        const u = j / ROWS;
        const p = H.clone().lerp(edge, u).add(out.clone().multiplyScalar(bow * S * Math.sin(Math.PI * t) * u));
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const a = base + i * (ROWS + 1) + j;
        const b = a + ROWS + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  };
  // (between the upper arm and the forearm, the folded leading edge — slack, bowed a little out from the
  // flank: an exact plane from the back up to the wrist, lit flat, it was a pale slab on the withers)
  panel(P0, E, W, 0.0, 0.025);
  panel(roots[0], tips[0], tips[1], 0.2, 0.02);
  panel(roots[1], tips[1], tips[2], 0.22, -0.015);
  panel(roots[2], tips[2], tips[3], 0.22, 0.02);
  panel(roots[3], tips[3], B, 0.26, 0.01);
  panel(E, roots[3], B, 0.0); // from the forearm back to the flank

  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  surface.setIndex(idx);
  surface.computeVertexNormals();
  // (slim: the leading edge of a folded wing, not a pole — at a thirtieth of the span, and then at a
  // fiftieth, the humerus of a big dragon's wing stood out of its shoulder as a round-ended peg)
  const bones: WingBone[] = [
    // (the upper arm of a folded wing lies in the shoulder's own flesh: drawn, lifted off the skin with
    // the rest, it stood out of the shoulder as a round-ended dowel)
    { a: P0, b: E, r0: 0.009 * S, r1: 0.008 * S, buried: true }, // humerus
    { a: E, b: W, r0: 0.008 * S, r1: 0.007 * S }, // forearm
    ...tips.map((t, i) => ({ a: roots[i], b: t, r0: 0.01 * S * (1 - i * 0.12), r1: 0.003 * S })),
  ];
  return { surface, bones, wrist: W };
}

// --- feathers ------------------------------------------------------------------------------------

/**
 * One feather: a slightly cupped lens in its own frame (+X along the shaft, +Y across the vane). Its
 * colour may change along it (`color` of t, 0 at the quill → 1 at the tip: a barred tail's bands),
 * over `seg` rows.
 */
function featherInto(
  pos: number[], col: number[], idx: number[],
  origin: THREE.Vector3, along: THREE.Vector3, across: THREE.Vector3, normal: THREE.Vector3,
  length: number, width: number, color: THREE.Color | ((t: number) => THREE.Color), lift: number, seg = 7,
): void {
  const base = pos.length / 3;
  const SEG = seg;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    // a feather is widest a third of the way along, rounded at the tip, narrow at the quill
    const w = width * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.08)) * (t < 0.12 ? t / 0.12 : 1);
    const c = typeof color === 'function' ? color(t) : color;
    for (const k of [-1, 0, 1]) {
      const p = origin.clone()
        .add(along.clone().multiplyScalar(t * length))
        .add(across.clone().multiplyScalar(k * w * 0.5))
        // the vane cups away from the body and the whole feather rides `lift` proud of the one below
        .add(normal.clone().multiplyScalar(lift + (k === 0 ? 0.25 : 0) * width * 0.25));
      pos.push(p.x, p.y, p.z);
      // the rachis (shaft) runs a touch lighter
      const shade = k === 0 ? 1.12 : 1.0;
      col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  for (let i = 0; i < SEG; i++) {
    const a = base + i * 3;
    const b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
}

// --- plumage as one continuous surface --------------------------------------------------------
//
// A wing used to be ~30 loose feather cards. Folded and wrapped onto the flank they collapsed onto one
// shell and z-fought into a clump at the hip; spread, they read as a pale paper comb. A real wing reads
// as ONE shaped surface whose feather TIERS are visible as bands with scalloped edges: shingled coverts
// over the leading edge, the secondaries (a speculum band near their tips) along the trailing edge,
// dark primaries at the hand ending in separated tips. So each wing is a single lofted sheet on a
// (along, across) grid, painted in tiers by vertex colour, with its outline cut to those tiers.

/** Smooth 0→1 between e0 and e1. */
function sstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** A scallop wave: 0 at each feather's tip centre, 1 in the notch between neighbours. */
function scallop(x: number, n: number): number {
  return 1 - Math.abs(Math.sin(Math.PI * x * n));
}

interface Tiers {
  base: THREE.Color; // coverts
  mid: THREE.Color; // secondaries
  spec: THREE.Color; // the speculum band
  dark: THREE.Color; // primaries
}
function tiersOf(base: THREE.Color, accent: THREE.Color): Tiers {
  return {
    base: base.clone(),
    mid: base.clone().multiplyScalar(0.66),
    spec: base.clone().lerp(accent, 0.7).multiplyScalar(0.85),
    dark: base.clone().multiplyScalar(0.28),
  };
}

/**
 * The plumage colour at a point of the sheet. `a` runs shoulder (0) → tip (1); `b` runs leading edge
 * (0) → trailing edge (1); `hand` is where the primaries take over along `a`.
 */
function plumageAt(t: Tiers, a: number, b: number, hand: number, nCov: number, nSec: number, nPrim: number, out: THREE.Color): void {
  // coverts: shingled over the leading edge, their lower boundary a row of rounded feather tips
  const covEdge = 0.4 + 0.07 * (1 - scallop(a, nCov));
  // (the coverts are the arm's: at the hand the primaries show nearly their whole length)
  const handW = sstep(hand - 0.05, hand + 0.05, a);
  const inCov = (1 - sstep(covEdge - 0.02, covEdge + 0.02, b)) * (1 - 0.8 * handW);
  // the secondaries below them, with the speculum band toward their tips
  const specBand = sstep(0.62, 0.7, b) * (1 - sstep(0.86, 0.94, b));
  out.copy(t.mid).lerp(t.spec, specBand * 0.85);
  out.lerp(t.base, inCov);
  // the hand: dark primaries take over toward the tip
  out.lerp(t.dark, handW * (1 - inCov));
  // shadow lines: just under each overlapping edge (the covert tips; between secondaries and between
  // primaries, running along their shafts)
  let shade = 1 - 0.32 * Math.exp(-(((b - covEdge - 0.035) / 0.03) ** 2));
  // …and the lesser coverts above them, two more shingled rows of smaller feathers, each row's tips a
  // half-step along from the row below (one row alone left the shoulder a flat pale slab: a clam's
  // shell, a beetle's wing-case from above)
  for (const [row, n, off] of [[0.16, 1.9, 0.5], [0.28, 1.45, 0]] as const) {
    const edge = row + 0.045 * (1 - scallop((a + off / (nCov * n)) % 1, nCov * n));
    shade *= 1 - 0.34 * (1 - handW) * Math.exp(-(((b - edge - 0.022) / 0.03) ** 2));
  }
  shade *= 1 - 0.22 * (1 - handW) * (1 - inCov) * scallop(a, nSec) ** 6;
  shade *= 1 - 0.28 * handW * scallop(b, nPrim * 0.5) ** 8;
  // a soft sheen down the middle of the sheet, darker at the trailing tips
  shade *= 0.94 + 0.12 * Math.sin(Math.PI * Math.min(1, b * 1.1));
  out.multiplyScalar(shade);
}

function sheet(nA: number, nB: number, at: (a: number, b: number, p: THREE.Vector3) => number, paint: (a: number, b: number, c: THREE.Color) => void): { geo: THREE.BufferGeometry; lift: Float32Array } {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const lift = new Float32Array((nA + 1) * (nB + 1));
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i <= nA; i++) {
    for (let j = 0; j <= nB; j++) {
      const a = i / nA, b = j / nB;
      lift[i * (nB + 1) + j] = at(a, b, p);
      pos.push(p.x, p.y, p.z);
      paint(a, b, c);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < nA; i++) {
    for (let j = 0; j < nB; j++) {
      const q = i * (nB + 1) + j;
      idx.push(q, q + nB + 1, q + 1, q + 1, q + nB + 1, q + nB + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, lift };
}

/**
 * A folded feathered wing on side `side` (±1), length `S` (shoulder → primary tips), relative to the
 * shoulder at the origin. `base` is the plumage colour; `accent` tints the speculum band. The sheet
 * is a teardrop leaf, domed a little away from the body (thickest at the shoulder); its trailing edge
 * is scalloped by the secondaries' tips and stepped where the primaries stack to the point.
 * `axis` lays the leaf along a line of its own (shoulder → wingtips) instead of level down the flank.
 */
export function buildFeatheredWing(side: number, S: number, base: THREE.Color, accent: THREE.Color, axis?: THREE.Vector3): WingBuild {
  const s = side >= 0 ? 1 : -1;
  // the folded wing lies along the flank: its long axis runs back and a little down, its plane
  // faces outward (normal ≈ +side X), tucked a touch toward the body at the tips
  const back = axis ? axis.clone().normalize() : v3(-0.12 * s, -0.12, -1).normalize();
  const normal = v3(s, 0.1, -0.05).normalize();
  // in-plane "down": world down with its normal and long-axis components removed (Gram–Schmidt)
  const down = v3(0, -1, 0);
  down.sub(normal.clone().multiplyScalar(down.dot(normal)));
  down.sub(back.clone().multiplyScalar(down.dot(back)));
  down.normalize();

  const L = S * 1.05;
  const H = S * 0.3;
  const HAND = 0.5;
  const t = tiersOf(base, accent);
  const { geo, lift } = sheet(
    72, 20,
    (a, b, p) => {
      // the leaf's depth: a rounded shoulder, deepest a third of the way back, tapering to the tip
      const depth = a < 0.32 ? 0.62 + 0.38 * Math.sin((Math.PI / 2) * (a / 0.32)) : Math.pow(1 - (a - 0.32) / 0.68, 0.8);
      // the trailing edge: secondaries' rounded tips, then the primaries' stepped tips
      const notch = a < HAND ? 0.07 * scallop(a, 9) : 0.16 * scallop((a - HAND) / (1 - HAND), 3.5) * sstep(HAND, HAND + 0.1, a);
      const top = -0.04 * S + 0.05 * S * a;
      const h = H * depth * (1 - notch * b * b);
      // domed away from the flank; the stacked coverts make the shoulder end thickest
      const dome = 0.045 * S * Math.sin(Math.PI * b) * (1 - 0.6 * a);
      p.copy(back).multiplyScalar(a * L).addScaledVector(down, top + b * h).addScaledVector(normal, dome);
      return dome;
    },
    (a, b, c) => plumageAt(t, a, b, HAND, 7, 9, 7, c),
  );
  return { surface: geo, bones: [], wrist: null, lift };
}

/** A wing part's style gene at or over this is the LONG cut of folded wing: a bird of prey's. */
export const LONG_WING = 0.6;

export interface WingFold {
  anchor: [number, number, number]; // the shoulder, body space
  axis: THREE.Vector3; // shoulder → wingtips
  S: number; // the leaf's length (buildFeatheredWing)
}

/**
 * Where a LONG folded wing lies: a bird of prey stands tall, and its wings run from the top of the
 * shoulders down the line of the back, their tips crossing over the tail. (A songbird's short leaf,
 * laid level along the flank from the middle of the trunk, stuck out behind an upright hawk like a
 * shelf, a hand's breadth above the tail it should have covered.) The leaf is rooted high on the
 * foremost trunk node and aimed at a point part-way down the tail fan — or just past the rump, on a
 * bird that has lost its tail. Null when there is no trunk to lie on.
 */
export function longWingFold(p: Phenotype, side: number): WingFold | null {
  const s = side >= 0 ? 1 : -1;
  const trunk = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0);
  if (trunk.length === 0) return null;
  const rump = trunk[0];
  const chest = trunk[trunk.length - 1];
  let girth = 0.3;
  let z0 = Infinity, z1 = -Infinity;
  for (const n of trunk) {
    girth = Math.max(girth, n.radius);
    z0 = Math.min(z0, n.pos[2] - n.radius);
    z1 = Math.max(z1, n.pos[2] + n.radius);
  }
  const rx = chest.radius * (chest.scale?.[0] ?? 1);
  const anchor: [number, number, number] = [chest.pos[0] + s * rx * 0.8, chest.pos[1] + chest.radius * 0.5, chest.pos[2] + chest.radius * 0.1];
  // the tips: 0.3 of the way down the tail fan (sized and drooped as TailFan draws it), tucked in
  // toward the midline so the two wings all but meet over it
  const fan = p.nodes.find((n) => n.kind === 'terminal' && n.part?.kind === 'tail');
  const tip = v3(s * rump.radius * 0.32, 0, 0);
  if (fan) {
    const droop = 0.2 + (p.genomeRef.seed % 5) * 0.06;
    const reach = 0.3 * Math.max((z1 - z0) * 0.55, girth * 1.6);
    const back = v3(0, -droop, -1).normalize();
    tip.y = fan.pos[1] + back.y * reach + rump.radius * 0.12;
    tip.z = fan.pos[2] + back.z * reach;
  } else {
    tip.y = rump.pos[1];
    tip.z = rump.pos[2] - rump.radius * 1.5;
  }
  const axis = tip.sub(v3(anchor[0], anchor[1], anchor[2]));
  const len = axis.length();
  if (len < 1e-4) return null;
  return { anchor, axis: axis.divideScalar(len), S: len / 1.05 };
}

/**
 * A SPREAD feathered wing — the flight posture — on side `side` (±1), span `S` (shoulder → wingtip),
 * relative to the shoulder at the origin, in the body frame. The wing plane is near-horizontal and
 * swept a little back: coverts shingled along the leading edge, the secondaries' scalloped trailing
 * edge along the arm (the speculum band among them), and dark primaries at the hand opening into
 * separated finger tips. Cambered a little, like a real aerofoil. The flap is a rotation of the
 * whole build about the body axis at the shoulder.
 *
 * `raise` (0..1) lifts the wing from that level glide to the one a standing griffin holds up and
 * half open over its back (see wingCarriage): the arm climbs out and back from the shoulder, the hand
 * curves back behind it, and the flight feathers hang down and back from the arm so the wing shows
 * its face to the side. (Raised as a flat level sheet it was a plank, and a line from in front.)
 */
export function buildSpreadFeatheredWing(side: number, S: number, base: THREE.Color, accent: THREE.Color, raise = 0): WingBuild {
  const s = side >= 0 ? 1 : -1;
  const u = v3(s * (1 - 0.35 * raise), 0.06 + raise, -0.14 - 0.35 * raise).normalize(); // span: out, a touch up and back
  const c0 = v3(0, -0.8 * raise, -1);
  const c = c0.sub(u.clone().multiplyScalar(c0.dot(u))).normalize(); // chord: back, ⟂ span
  const n = new THREE.Vector3().crossVectors(u, c).multiplyScalar(s).normalize(); // up, either side

  const HAND = 0.52;
  const FINGERS = 5;
  const t = tiersOf(base, accent);
  const { geo, lift } = sheet(
    80, 18,
    (a, b, p) => {
      // planform: a broad arm, then the hand narrowing to a rounded tip
      const chord = a < HAND ? 0.36 - 0.04 * a : 0.34 * Math.pow(Math.max(0, 1 - (a - HAND) / (1 - HAND)), 0.55) + 0.05 * (1 - a);
      // the trailing edge: the secondaries' scallops, then deep notches between the primary fingers
      const f = (a - 0.62) / 0.38;
      const notch = a < HAND ? 0.06 * scallop(a / HAND, 9) : a > 0.62 ? 0.5 * Math.pow(scallop(f, FINGERS * 0.5), 2.2) * sstep(0.62, 0.7, a) : 0;
      const sweep = -0.05 * Math.sin(Math.PI * a); // the leading edge bows forward
      const cb = chord * (1 - notch * sstep(0.35, 1, b));
      const camber = 0.035 * S * Math.sin(Math.PI * b) * (1 - 0.5 * a);
      const arc = 0.24 * raise * a * a; // a raised wing's hand curves back from the wrist
      const droop = 0.1 * raise * a * a; // …and its tip arches over, outward and down
      p.copy(u).multiplyScalar(a * S).addScaledVector(c, (sweep + arc + b * cb) * S).addScaledVector(n, camber - droop * S);
      return camber;
    },
    (a, b, col) => plumageAt(t, a, b, HAND, 10, 9, FINGERS * 2, col),
  );
  return { surface: geo, bones: [], wrist: null, lift };
}

/** How a wing is carried at rest. */
export type WingCarriage = 'spread' | 'folded' | 'raised';

/**
 * A membrane wing stands spread. A feathered wing FOLDS along the flank of a body that walks on two
 * legs (a bird's: the leaf reaches back past the hip and the trunk ends there) — but a body on four
 * legs has a haunch and a hind leg where that leaf would lie: wrapped over them a griffin's wings were
 * a pair of boxy saddlebags strapped round its hips, and it did not read as winged at all. It carries
 * them RAISED instead, held up and half open from the shoulder.
 */
export function wingCarriage(feathered: boolean, legPairs: number): WingCarriage {
  if (!feathered) return 'spread';
  return legPairs >= 2 ? 'raised' : 'folded';
}

/**
 * A bird's tail at rest: its long rectrices CLOSED, stacked all but wholly over each other, pointing
 * back from the tail tip (in the body frame, origin at the tail node), shingled at the root by the
 * coverts that run it on from the rump. Replaces the fish caudal fin a feathered creature's tail used
 * to end in.
 *
 * (Spread ±31°, as a bird spreads its tail only to land or display, it was a comb of separate blades
 * from above, alternately light and dark; and with nothing over its root it jutted from under the rump
 * as a thin flat plank — the thirteenth look's hawk.)
 */
/** how far a resting tail's feathers fan either side of its middle (rad): closed, a long blade with a
 *  rounded end */
export const TAIL_SPREAD = 0.13;
/** how far a tail's outer feathers lift to either side (rad): a shallow trough */
const TAIL_TROUGH = 0.3;
/** how far the upper tail coverts reach down the tail (of its length); the under ones reach 0.9 of it */
export const COVERT_REACH = 0.32;

/** where a tail fan's root sits on its body: the rump node's centre (relative to the tail node) and girth */
export interface TailRump {
  at: THREE.Vector3;
  r: number;
}

/**
 * The colour of a tail feather along its length (t: 0 at the quill, 1 at the tip). A BARRED tail (a
 * banded bird's: a hawk's, a kestrel's) wears four narrow dark bars, a broad dark band before its tip
 * and a pale tip; any other darkens toward its end, its tip fringed pale.
 */
export function tailBandAt(t: number, tail: THREE.Color, bar: THREE.Color, pale: THREE.Color, barred: boolean): THREE.Color {
  if (t > 0.94) return tail.clone().lerp(pale, barred ? 1 : 0.35);
  if (barred) {
    if (t > 0.8) return bar;
    if (t > 0.28 && (t - 0.28) % 0.13 < 0.05) return bar;
    return tail;
  }
  return tail.clone().lerp(bar, 0.45 * sstep(0.45, 0.9, t));
}

export function buildTailFan(S: number, base: THREE.Color, accent: THREE.Color, droop = 0.25, barred = false, rump?: TailRump): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const N = 9;
  const normal = v3(0, 1, -droop).normalize();
  // the rectrices a shade darker than the coat, their bars in the markings' colour, darker still
  const tail = base.clone().lerp(accent, 0.15).multiplyScalar(0.8);
  const bar = accent.clone().lerp(base, 0.2).multiplyScalar(0.42);
  const pale = base.clone().lerp(new THREE.Color(0.95, 0.92, 0.84), 0.6);
  const colourAt = (t: number) => tailBandAt(t, tail, bar, pale, barred);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const ang = (t - 0.5) * 2 * TAIL_SPREAD;
    // …in a shallow trough, the outer feathers lifted to either side as a resting tail's layers lie:
    // laid flat, from the side or any low angle the tail was its own edge, a twig in the rump
    const rise = TAIL_TROUGH * Math.abs(t - 0.5) * 2;
    const along = v3(Math.sin(ang), -droop + rise * 0.35, -Math.cos(ang)).normalize();
    const tilt = v3(-Math.sign(t - 0.5) * Math.sin(rise), Math.cos(rise), -droop).normalize();
    const across = new THREE.Vector3().crossVectors(tilt, along).normalize();
    const fnormal = new THREE.Vector3().crossVectors(along, across).normalize();
    // outer feathers a little shorter (a rounded end), the central pair longest
    const len = S * (0.86 + 0.14 * Math.cos((t - 0.5) * Math.PI));
    // stack from the outside in so the central feathers lie on top
    const lift = 0.006 * S * (N / 2 - Math.abs(i - (N - 1) / 2));
    featherInto(pos, col, idx, v3(0, 0, 0), along, across, fnormal.dot(normal) < 0 ? fnormal.negate() : fnormal, len, S * 0.22, colourAt, lift, 30);
  }
  // the coverts: a hood of short feathers over the tail's root and one under it, each coming out of the
  // coat near where a line from its end on the tail meets the rump's round (above it, or below), so the
  // back's outline runs on down the coverts to the tail and the belly's under it — in the coat's own
  // colour, shingled in rows
  const d = v3(0, -droop, -1).normalize();
  const up = v3(0, 1, 0).addScaledVector(d, -d.y).normalize();
  const rumpAt = rump ? rump.at : d.clone().multiplyScalar(-0.55 * S);
  const rumpR = rump ? rump.r : 0.3 * S;
  const hood = (s: number, reach: number, w1: number, colour: THREE.Color, rest: number) => {
    // (its end rests ON the tail: on the stacked rectrices' top, or just under their lowest)
    const E = d.clone().multiplyScalar(reach * S).addScaledVector(up, rest * S);
    const rel = E.clone().sub(rumpAt);
    const dist = Math.max(rel.length(), rumpR * 1.05);
    const beta = Math.atan2(rel.y, -rel.z);
    // (tangent to the round, but no further round it than over the rump's top or its vent)
    const ang = beta + s * Math.min(Math.acos(rumpR / dist), s > 0 ? 1.4 : 0.55);
    const R = rumpAt.clone().add(v3(0, Math.sin(ang), -Math.cos(ang)).multiplyScalar(rumpR * 0.7));
    const dir = E.clone().sub(R).normalize();
    const n = v3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    const NA = 16, NB = 12;
    const base0 = pos.length / 3;
    const c = new THREE.Color();
    for (let i = 0; i <= NA; i++) {
      for (let j = 0; j <= NB; j++) {
        const a = i / NA, b = j / NB, bb = 2 * b - 1;
        // the trailing edge cut into the coverts' rounded tips
        const aa = a * (1 - 0.1 * scallop(b, 2.5));
        const w0 = rumpR * (s > 0 ? 0.62 : 0.5);
        const w = w0 + (w1 * S - w0) * aa;
        // domed across: a roof over the tail's root (a floor under it), its sides turned to the side
        const crown = rumpR * 0.2 * (1 - aa) * (1 - bb * bb);
        const p = R.clone().lerp(E, aa).add(v3(bb * w, 0, 0)).addScaledVector(n, s * crown);
        pos.push(p.x, p.y, p.z);
        // the coat's colour running into the tail's, a soft shadow under each row's tips
        c.copy(colour).lerp(tail, 0.45 * aa * aa);
        let shade = 1;
        for (const [row, k] of [[0.42, 3.5], [0.68, 3]] as const) {
          const edge = row + 0.05 * (1 - scallop(b + 0.5 / k, k));
          shade *= 1 - 0.3 * Math.exp(-(((a - edge - 0.025) / 0.03) ** 2));
        }
        c.multiplyScalar(shade);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < NA; i++) {
      for (let j = 0; j < NB; j++) {
        const q = base0 + i * (NB + 1) + j;
        idx.push(q, q + NB + 1, q + 1, q + 1, q + NB + 1, q + NB + 2);
      }
    }
  };
  hood(1, COVERT_REACH, 0.16, base.clone().multiplyScalar(0.96), 0.04);
  hood(-1, COVERT_REACH * 0.9, 0.13, base.clone().lerp(pale, 0.15), -0.005);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Shrink-wrap a surface onto a body: every vertex closer to (or inside) the body than `margin` is
 * pushed out along the field gradient until it rides `margin` above the skin. A flat leaf of folded
 * feathers cannot lie on a convex flank — wrapped, the wing hugs the body's curvature the way a real
 * folded wing does, its layers keeping their stacking order. `origin` is the geometry's offset in the
 * body frame (the field is in body space). Normals are recomputed.
 */
export function conformToSurface(
  geo: THREE.BufferGeometry,
  field: (x: number, y: number, z: number) => number,
  origin: readonly number[],
  margin: number,
  lift?: ArrayLike<number>,
): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const h = 1e-3;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) + origin[0], y = pos.getY(i) + origin[1], z = pos.getZ(i) + origin[2];
    // a vertex built `lift` off its sheet's plane rides that much higher than the margin
    const m = margin + (lift ? lift[i] : 0);
    for (let it = 0; it < 4; it++) {
      const d = field(x, y, z);
      if (d >= m) break;
      let gx = field(x + h, y, z) - field(x - h, y, z);
      let gy = field(x, y + h, z) - field(x, y - h, z);
      let gz = field(x, y, z + h) - field(x, y, z - h);
      const gl = Math.hypot(gx, gy, gz);
      if (gl < 1e-12) break;
      gx /= gl; gy /= gl; gz /= gl;
      const step = Math.min(m - d, 0.5);
      x += gx * step; y += gy * step; z += gz * step;
    }
    pos.setXYZ(i, x - origin[0], y - origin[1], z - origin[2]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// --- fins ---------------------------------------------------------------------------------------

export type FinKind = 'dorsal' | 'pectoral' | 'pelvic' | 'anal' | 'caudal';
/** a bony fish's tail: its base's half-depth (× the fin's depth) and how far back its fork's notch
 *  reaches (× its length) */
export const FISH_TAIL: readonly [number, number] = [0.16, 0.66];

/**
 * The cut of a body's fins, from the fin part's style gene:
 *   plain — the fin every finned body had (a raked sail, a swept paddle, an even fork);
 *   fish  — a bony fish's: a long low sail down the back, round paddles laid along the flank, a keel
 *           of an anal fin, a deeply forked tail;
 *   shark — a shark's: a tall raked blade, long swept planes, a tail whose upper lobe runs far past
 *           the lower.
 */
export type FinCut = 'plain' | 'fish' | 'shark';

export function finCutOf(style: number): FinCut {
  return style < 0.3 ? 'plain' : style < 0.6 ? 'fish' : 'shark';
}

/** How big this cut of fin is drawn (×its usual size), from the same gene: each band runs small → large. */
export function finScaleOf(style: number): number {
  const cut = finCutOf(style);
  if (cut === 'plain') return 0.8 + style * 0.6; // (as it always was)
  const u = cut === 'fish' ? (style - 0.3) / 0.3 : (style - 0.6) / 0.4;
  return 0.88 + 0.26 * Math.min(1, Math.max(0, u));
}

export interface FinBuild {
  membrane: THREE.BufferGeometry;
  rays: { a: THREE.Vector3; b: THREE.Vector3 }[];
}

/** Classify a fin by where it points (body frame) and what grew it. */
export function finKindOf(aim: THREE.Vector3, partKind: string | undefined): FinKind {
  if (partKind === 'tail') return 'caudal';
  if (aim.y > 0.55) return 'dorsal';
  // under the body: one on the midline is the anal fin, a pair set out to the sides the pelvics
  if (aim.y < -0.55) return Math.abs(aim.x) < 0.12 ? 'anal' : 'pelvic';
  return 'pectoral';
}

/** The direction a fin's chord runs: back along the body, squared off against the fin's aim (a
 *  caudal fin's chord stands vertical). */
export function finChord(kind: FinKind, aim: THREE.Vector3): THREE.Vector3 {
  let chord = kind === 'caudal' ? v3(0, 1, 0) : v3(0, 0, -1);
  chord.addScaledVector(aim, -chord.dot(aim));
  if (chord.lengthSq() < 1e-6) chord = v3(0, 1, 0).addScaledVector(aim, -aim.y);
  return chord.normalize();
}

/**
 * A fin built in the BODY frame: its span runs out along the fin's aim, its chord sweeps BACK along
 * the body (a caudal fin's chord stands vertical), and it is sized to the body's girth `g` — so a
 * pectoral fin is a swept paddle lying along the flank, a dorsal a raked sail, a caudal a forked
 * fan, never the old billboards whose chord inherited an arbitrary axis from the growth quaternion.
 * Origin at the fin root (on the skin); the root edge tucks a little into the body.
 */
export function buildFin(kind: FinKind, aimIn: THREE.Vector3, g: number, gene = 1, cut: FinCut = 'plain', root?: (along: number) => number): FinBuild {
  const aim = aimIn.clone().normalize();
  const chord = finChord(kind, aim);
  const normal = new THREE.Vector3().crossVectors(aim, chord).normalize();
  const k = Math.min(1.5, Math.max(0.6, gene));
  // [span, chord, sweep (how far back the tip rakes, ×chord)] per kind, × girth
  const PLAIN: Record<FinKind, [number, number, number]> = {
    dorsal: [1.45 * k, 1.9 * k, 0.75],
    pectoral: [1.25 * k, 1.05 * k, 0.6],
    pelvic: [0.75 * k, 0.8 * k, 0.5],
    anal: [0.75 * k, 0.8 * k, 0.5],
    caudal: [2.0 * k, 2.6 * k, 0],
  };
  const FISH: Record<FinKind, [number, number, number]> = {
    dorsal: [1.15 * k, 3.1 * k, 0.12], // a long low sail
    pectoral: [1.05 * k, 0.72 * k, 0.3], // a round paddle
    pelvic: [0.7 * k, 0.5 * k, 0.3],
    anal: [0.62 * k, 1.5 * k, 0.15], // a keel under the rear of the body
    caudal: [2.15 * k, 2.5 * k, 0],
  };
  const SHARK: Record<FinKind, [number, number, number]> = {
    dorsal: [1.85 * k, 1.5 * k, 0.72], // a tall raked blade
    pectoral: [1.85 * k, 1.05 * k, 0.85], // a long swept plane
    pelvic: [0.72 * k, 0.75 * k, 0.6],
    anal: [0.55 * k, 0.7 * k, 0.6],
    // (a shark's tail is what says shark: a crescent whose upper lobe sweeps up and back further than
    // the body is deep — at 2.7 girths, two thin spikes, it was a small fork on a long tube: a dolphin)
    caudal: [3.2 * k, 2.8 * k, 0],
  };
  const dims = cut === 'fish' ? FISH : cut === 'shark' ? SHARK : PLAIN;
  const H = dims[kind][0] * g;
  const C = dims[kind][1] * g;
  // (the plain fin's rake has always been scaled by the girth as well as by the chord — kept, so no
  // fin that existed changes; the new cuts rake by the stated share of their chord)
  const sweep = dims[kind][2] * (cut === 'plain' ? g : 1);
  // (`root`: how far the skin stands above or below the fin's root point, `along` its chord — a long
  // fin's base follows the back it grows from instead of running straight out over a falling one)
  const P = (along: number, out: number, bulge = 0) =>
    chord.clone().multiplyScalar(along).add(aim.clone().multiplyScalar(out + (root ? root(along) : 0))).add(normal.clone().multiplyScalar(bulge));
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // the outline, root-leading-edge → tip → trailing edge → root-trailing-edge
  const outline: THREE.Vector3[] = [];
  const N = 14;
  let hubAlong = C * 0.3;
  if (kind === 'caudal' && cut === 'shark') {
    // a shark's tail, a deep crescent (`across` runs down → up the tail's depth, `reach` back from the
    // root): the upper lobe's leading edge rises from the top of the tail stock, convex, up and far back
    // to its tip; the trailing edge comes down, hollow, to a notch low on the fin; the lower lobe is a
    // short blade under it, back to the bottom of the stock. (Drawn as an outline from the lower tip
    // through a notch right behind the root to the upper tip, every lobe was a sliver of a triangle off
    // the root: two thin spikes, a fork.)
    const rootTop = 0.16 * C, rootBot = -0.12 * C;
    const up = [0.7 * C, H], notch = [0.02 * C, 0.42 * H], low = [-0.36 * C, 0.5 * H];
    const edge = (a0: number, r0: number, a1: number, r1: number, n: number, bowA: number, bowR: number) => {
      for (let i = 1; i <= n; i++) {
        const t = i / n, b = Math.sin(Math.PI * t);
        outline.push(P(a0 + (a1 - a0) * t + bowA * b, r0 + (r1 - r0) * t + bowR * b));
      }
    };
    outline.push(P(rootTop, 0));
    edge(rootTop, 0, up[0], up[1], 7, 0.07 * C, 0); // the leading edge, convex
    edge(up[0], up[1], notch[0], notch[1], 6, 0, -0.14 * H); // the trailing edge, hollow
    edge(notch[0], notch[1], low[0], low[1], 4, 0, 0.04 * H); // the lower lobe's trailing edge
    edge(low[0], low[1], rootBot, 0, 4, -0.03 * C, 0); // …and its leading edge, back to the stock
  } else if (kind === 'caudal' && cut === 'fish') {
    // a bony fish's tail: a broad fan on a base as deep as the tail stock, its two lobes flaring from it
    // to rounded tips, the trailing edge between them notched in a shallow fork. (A fan from one point at
    // the stock, notched to a third of its length, was two needle spikes in a V: too spindly by far for
    // a stout fish.)
    const rootHalf = FISH_TAIL[0] * C;
    const notch = FISH_TAIL[1] * H;
    const edge = (a0: number, r0: number, a1: number, r1: number, n: number, bowA: number, bowR: number) => {
      for (let i = 1; i <= n; i++) {
        const t = i / n, b = Math.sin(Math.PI * t);
        outline.push(P(a0 + (a1 - a0) * t + bowA * b, r0 + (r1 - r0) * t + bowR * b));
      }
    };
    outline.push(P(rootHalf, 0));
    edge(rootHalf, 0, 0.5 * C, H, 5, 0.06 * C, -0.04 * H); // the upper lobe's leading edge, flaring
    edge(0.5 * C, H, 0.42 * C, 1.04 * H, 2, 0, 0.03 * H); // its rounded tip
    edge(0.42 * C, 1.04 * H, 0, notch, 4, 0, -0.06 * H); // the trailing edge in to the notch
    edge(0, notch, -0.42 * C, 1.04 * H, 4, 0, -0.06 * H); // …and out to the lower lobe
    edge(-0.42 * C, 1.04 * H, -0.5 * C, H, 2, 0, 0.03 * H);
    edge(-0.5 * C, H, -rootHalf, 0, 5, -0.06 * C, -0.04 * H); // the lower lobe's leading edge, back in
  } else if (kind === 'caudal') {
    // a forked tail: two lobes (up and down along the chord) reaching back along the aim
    const pit = 0.45;
    for (let i = 0; i <= N; i++) {
      const t = i / N; // −C/2 … +C/2 across the fork
      const across = (t - 0.5) * C;
      const lobe = Math.abs(t - 0.5) * 2; // 0 at the fork's notch → 1 at the lobe tips
      const reach = H * (pit + (1 - pit) * Math.pow(lobe, 0.8));
      outline.push(P(across, reach));
    }
  } else if (cut === 'fish' && (kind === 'dorsal' || kind === 'anal')) {
    // a sail along the body: up steeply at its front (the spines), running back a little lower, then
    // down to the body at its rear — its base two-fifths ahead of the node and three-fifths behind
    const root0 = -C * 0.4;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // (tallest a fifth of the way along and falling away behind: level-topped it was a flag)
      const h = H * smooth(0, 0.2, t) * (1 - 0.6 * Math.pow(t, 1.3)) * (1 - smooth(0.86, 1, t));
      outline.push(P(root0 + C * t + sweep * C * (h / H), h));
    }
    hubAlong = C * 0.1;
  } else if (cut === 'fish') {
    // a round paddle: a half-oval from the front of its root round to the back
    const root0 = -C * 0.2;
    for (let i = 0; i <= N; i++) {
      const phi = (Math.PI * i) / N;
      const h = H * Math.pow(Math.sin(phi), 0.8);
      outline.push(P(root0 + C * (0.5 - 0.5 * Math.cos(phi)) + sweep * C * (h / H), h));
    }
  } else if (cut === 'shark' && kind === 'dorsal') {
    // a blade: a long convex leading edge raked back to a rounded tip that hangs over the rear of
    // the base, and a hollow trailing edge down to a free corner
    const root0 = -C * 0.25;
    const root1 = C * 0.75;
    const tipAlong = root0 + sweep * C;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      if (t <= 0.55) {
        const u = t / 0.55;
        outline.push(P(root0 + (tipAlong - root0) * Math.pow(u, 1.5), H * Math.pow(Math.sin((u * Math.PI) / 2), 0.9)));
      } else {
        const u = (t - 0.55) / 0.45;
        outline.push(P(tipAlong + (root1 - tipAlong) * u - 0.1 * C * Math.sin(Math.PI * u), H * Math.pow(1 - u, 1.4)));
      }
    }
  } else {
    const root0 = -C * 0.15; // leading edge root (a touch forward of the node)
    const root1 = C * 0.85; // trailing edge root
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // leading edge: a gentle convex rake up to the tip; trailing edge: a concave sweep back down
      if (t <= 0.5) {
        const u = t / 0.5;
        outline.push(P(root0 + (sweep * C) * Math.pow(u, 1.4), H * Math.sin((u * Math.PI) / 2)));
      } else {
        const u = (t - 0.5) / 0.5;
        const tipAlong = root0 + sweep * C;
        const along = tipAlong + (root1 - tipAlong) * u;
        const out = H * (1 - u) * (1 - 0.35 * Math.sin(Math.PI * u));
        outline.push(P(along, out));
      }
    }
  }
  const hub = kind === 'caudal' ? P(0, -g * 0.15) : P(hubAlong, -g * 0.12); // tucked into the body
  const pos: number[] = [hub.x, hub.y, hub.z];
  for (const o of outline) pos.push(o.x, o.y, o.z);
  // a slightly cambered surface: ring of mid points between hub and outline, bowed along the normal
  const mids: number[] = [];
  for (const o of outline) {
    const m = hub.clone().lerp(o, 0.55).addScaledVector(normal, g * 0.03);
    mids.push(m.x, m.y, m.z);
  }
  const base = 1 + outline.length;
  pos.push(...mids);
  const idx: number[] = [];
  for (let i = 0; i < outline.length - 1; i++) {
    const mi = base + i, mj = base + i + 1, oi = 1 + i, oj = 2 + i;
    idx.push(0, mi, mj, mi, oi, oj, mi, oj, mj);
  }
  const membrane = new THREE.BufferGeometry();
  membrane.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  membrane.setIndex(idx);
  membrane.computeVertexNormals();
  const rays = outline.filter((_, i) => i % 2 === 1).map((o) => ({ a: hub.clone(), b: o.clone() }));
  return { membrane, rays };
}

/** The girth of a body's trunk: the radius of its stoutest trunk link. */
export function trunkGirth(p: Phenotype): number {
  let g = 0;
  for (const n of p.nodes) if (n.kind === 'spine' && (n.segment ?? 0) === 0) g = Math.max(g, n.radius);
  return g || 0.4;
}

/**
 * The girth a fin is sized to: the radius of the body link it grows from (walking up past the fin's
 * own chain). A caudal fin grows at the tail's tip, where the body is thin, and is sized to the trunk.
 * `radius` is the fin node's own, for a fin that hangs from no body link at all.
 */
export function finGirth(p: Phenotype, idx: number, kind: FinKind, radius: number): number {
  const parent = new Int32Array(p.nodes.length).fill(-1);
  for (const [a, b] of p.edges) parent[b] = a;
  let c = parent[idx];
  while (c >= 0 && p.nodes[c].kind !== 'spine') c = parent[c];
  const girth = c >= 0 ? p.nodes[c].radius : Math.max(radius, 0.2) * 2;
  if (kind === 'caudal') return Math.max(girth, trunkGirth(p) * 0.8);
  // …and a lesser fin of its kind — a shark's second dorsal, its gene half the first's — at its own share
  // of the biggest: sized by its trunk link alone, it stood 0.6–0.8 as tall as the first
  return girth * Math.min(1, radius / leadFin(p, kind, radius));
}

/** the biggest fin of this kind on the body, by its node's radius (its gene's size) */
function leadFin(p: Phenotype, kind: FinKind, radius: number): number {
  let lead = radius;
  for (const n of p.nodes) {
    if (n.terminal !== 'fin' || n.part?.kind !== 'fin') continue;
    const aim = v3(0, 0, 1).applyQuaternion(new THREE.Quaternion(n.quat[0], n.quat[1], n.quat[2], n.quat[3]));
    if (finKindOf(aim, n.part.kind) === kind) lead = Math.max(lead, n.radius);
  }
  return lead;
}

/** a fin as the mesh data lists it (see meshData's MeshFeature) */
export interface FinPart {
  idx: number;
  quat: readonly [number, number, number, number];
  style: number;
  radius: number;
  kind?: string;
}

/**
 * The box a body's fins reach to, in the body frame — null if it has none. A fin is DRAWN from its
 * node, not grown as nodes of its own: a fish's tail fan reaches most of a body's depth past the last
 * node of its tail, a sail stands a girth over the back. The body's own bounds stop short of them, so
 * a view framed on those cut the tail fin off at the edge of the plate.
 */
/**
 * Where a fin is seated off its node: a bony fish's pectoral stands on the skin (its node sits on its own
 * link's ellipsoid, inside the blended flank — three paddles in four were half and more under the skin;
 * rooted on the back of the head, under the gill cover, some wholly); any other fin stands where it is.
 */
export function finSeat(p: Phenotype, idx: number, kind: FinKind, cut: FinCut, surface: SkinSurface = 'hybrid'): THREE.Vector3 | null {
  if (cut !== 'fish' || kind !== 'pectoral') return null;
  const o = p.nodes[idx].pos;
  const s = projectToSurface(surfacePrims(p, surface), [], [o[0], o[1], o[2]]).p;
  return new THREE.Vector3(s[0] - o[0], s[1] - o[1], s[2] - o[2]);
}

export function finBounds(p: Phenotype, fins: readonly FinPart[]): { min: [number, number, number]; max: [number, number, number] } | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const f of fins) {
    const aim = v3(0, 0, 1).applyQuaternion(new THREE.Quaternion(f.quat[0], f.quat[1], f.quat[2], f.quat[3]));
    const kind = finKindOf(aim, f.kind);
    const fin = buildFin(kind, aim, finGirth(p, f.idx, kind, f.radius), finScaleOf(f.style), finCutOf(f.style));
    const seat = finSeat(p, f.idx, kind, finCutOf(f.style));
    if (seat) fin.membrane.translate(seat.x, seat.y, seat.z);
    const pos = fin.membrane.getAttribute('position') as THREE.BufferAttribute;
    const o = p.nodes[f.idx].pos;
    for (let i = 0; i < pos.count; i++) {
      const v = [o[0] + pos.getX(i), o[1] + pos.getY(i), o[2] + pos.getZ(i)];
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], v[k]);
        max[k] = Math.max(max[k], v[k]);
      }
    }
    fin.membrane.dispose();
  }
  return fins.length ? { min, max } : null;
}
