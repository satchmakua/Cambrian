/**
 * The jawed mouth family (mouth overhaul) — herbivore · maw · fanged · underbite as ONE parametric
 * build over the mouth line, replacing four hand-placed primitive assemblies.
 *
 * Everything anchors to the surface-projected mouth line (`mouthLine.ts`): lips are variable-radius
 * tubes swept along the upper/lower curves (they wrap the corners as one closed loop — the thing a
 * top+bottom "sandwich" can never do), gum ridges run just inside the lips, teeth are ONE
 * InstancedMesh per row whose roots interpolate the same curves (floating is impossible by
 * construction), and a dark wet interior sheet spans the opening. On the carved smooth skin the
 * sheet recesses into the real cavity; on the capsule kit it sits a hair proud as a dark backdrop.
 *
 * Geometry is authored NODE-RELATIVE (world minus the mouth node's rest position, no rotation), so
 * the feature group's per-frame translation carries the whole mouth with the animated head. The
 * pure `buildJawed` does all of it headlessly (tested like every sibling variant); the component
 * is a thin wrapper that adds materials. (The mandible used to idle open/shut; the idle
 * animation pass was removed — creatures hold the rest pose grow() produced.)
 */
import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coatMain } from '../palette';
import { faceMaskOf } from '../face';
import { tailRootRatio } from '../feet';
import type { Phenotype } from '../../engine/grow';
import type { Vec3 } from '../../engine/genome';
import type { Carve } from '../bodyField';
import { norm3 } from '../bodyField';
import type { MeshFeature } from '../meshData';
import { buildMouthLine, hash01, mouthSpec, runSeamBack, type MouthSample, type SkinSurface } from '../mouthLine';
import { isSwimmer } from '../eyeSeat';
import { sweepTube, type SweepPoint } from '../sweep';
import { bluntGeometry, fangGeometry, setToothInstances, toothRow, type ToothProfile, type ToothXform } from '../teeth';
import { INTERIOR, LIP } from './palette';
import { interiorBowl, muzzleSkirt, relRow, bakeBodySpace } from './shared';
import { JawContext, hingeOf, poseJaw } from './jaw';

export type JawedVariant = 'herbivore' | 'maw' | 'fanged' | 'underbite';

/** how far a jaw hangs open at rest (0 = lips meeting) */
const REST_SHUT = 0;
/**
 * Below this much opening the lower jaw is not drawn at all: a shut mouth is ONE seam — the upper
 * lip's line. The mouth is built agape and the lower jaw swung shut on its hinge, but the lower lip
 * is a longer curve than the upper (it runs round under the chin), so swung up it never lay along
 * it: it crossed it in an X at the corners, doubled it into a thick bar, or stood out past the snout
 * like a pair of whiskers; and the mandible behind it hung under the jaw as a loose strip.
 */
export const JAW_SHOWN = 0.08;
/** …and a mammal's teeth only show once its mouth has opened this far (over a shut lip the canines'
 *  tips were stray pegs hanging off the mouth line) */
export const TEETH_SHOWN = 0.12;

/** Is the lower jaw (its lip, its mass, its tooth row) drawn at this much opening? */
export const jawDrawn = (open: number): boolean => open > JAW_SHOWN;
/** Is the upper tooth row drawn? A reptile's or a shark's always, along its seam; a mammal's once the mouth opens. */
export const teethDrawn = (muzzled: boolean, open: number): boolean => !muzzled || open > TEETH_SHOWN;

interface JawedParams {
  upper: ToothProfile | null;
  lower: ToothProfile | null;
  lipR: (u: number) => number; // upper lip tube radius (× r) at |t| = u
  lowerLipR: (u: number) => number;
  /** upper-jaw (muzzle) and lower-jaw (mandible) MASS radii, × r — the volume behind the lips.
   *  Without these a mouth is only two thin tubes drawn on a smooth head: anatomically placed but
   *  reading as scratched-on lines. The masses give the jaw a silhouette to sit in. */
  muzzleR: number;
  jawR: number;
  /** how far the mouth's front centre projects off the skull, × r — this is what makes a SNOUT */
  project: number;
  /** blunt (grazer molars/incisors) vs the default pointed fang — the visible tooth-type variety */
  blunt?: boolean;
}

// house tooth-profile shapes: u = |t| (0 front → 1 corner). Exported so the tests measure the
// REAL table instead of a copy that silently desyncs on retune.
export const JAWED_PARAMS = {
  herbivore: {
    upper: { count: 10, len: (u: number) => 0.52 - 0.10 * u, width: 0.62, curl: 0.05, jitterLen: 0.1, jitterRock: 0.06, sink: 0.4, margin: 0.3, salt: 2 },
    lower: null,
    lipR: (u: number) => 0.17 - 0.06 * u * u,
    lowerLipR: (u: number) => 0.18 - 0.06 * u * u,
    muzzleR: 0.42,
    jawR: 0.40,
    project: 0.55,
    blunt: true,
  },
  maw: {
    upper: { count: 13, len: (u: number) => 0.30 + 0.14 * u, width: 0.3, curl: 0.22, jitterLen: 0.22, jitterRock: 0.12, sink: 0.32, margin: 0.16, salt: 2 },
    lower: { count: 13, len: (u: number) => 0.26 + 0.12 * u, width: 0.3, curl: 0.2, jitterLen: 0.22, jitterRock: 0.12, sink: 0.32, margin: 0.16, salt: 5 },
    lipR: (u: number) => 0.13 - 0.04 * u * u,
    lowerLipR: (u: number) => 0.14 - 0.05 * u * u,
    muzzleR: 0.36,
    jawR: 0.40,
    project: 0.50,
    blunt: true,
  },
  fanged: {
    // canine spikes at the corner third — the crocodile read; tips clear the closed lip line
    upper: { count: 12, len: (u: number) => 0.28 + 0.15 * u + 0.5 * spike(u, 0.62), width: 0.26, curl: 0.3, jitterLen: 0.2, jitterRock: 0.12, sink: 0.3, margin: 0.14, salt: 2 },
    lower: { count: 12, len: (u: number) => 0.24 + 0.13 * u + 0.32 * spike(u, 0.38), width: 0.26, curl: 0.26, jitterLen: 0.2, jitterRock: 0.12, sink: 0.3, margin: 0.14, salt: 5 },
    lipR: (u: number) => 0.115 - 0.035 * u * u,
    lowerLipR: (u: number) => 0.12 - 0.04 * u * u,
    muzzleR: 0.34,
    jawR: 0.38,
    project: 0.72,
  },
  underbite: {
    // a jutting lower row of long up-raked tusks past a modest upper lip (deep-sea / ogre)
    upper: { count: 10, len: (u: number) => 0.09 + 0.04 * u, width: 0.34, curl: 0.18, jitterLen: 0.16, jitterRock: 0.1, sink: 0.34, margin: 0.22, salt: 2 },
    lower: { count: 10, len: (u: number) => 0.46 + 0.34 * u * u, width: 0.2, curl: -0.34, jitterLen: 0.24, jitterRock: 0.14, sink: 0.26, margin: 0.2, salt: 5 },
    lipR: (u: number) => 0.11 - 0.035 * u * u,
    lowerLipR: (u: number) => 0.19 - 0.06 * u * u,
    muzzleR: 0.28,
    jawR: 0.50,
    project: 0.52,
  },
} satisfies Record<JawedVariant, JawedParams>;

// A MAMMAL's mouth (a muzzled spec — furred, jawed) shuts. Its lips are a thin dark line along the
// muzzle, the jaw wears the coat, and only the teeth a closed mammal mouth really shows survive: a
// carnivore's canines over the lip, a grazer's or rodent's front incisors. The full rows of a
// reptile's grin were what made every cat and dog read as a frog in a fur suit.
const CANINE = { jitterLen: 0.08, jitterRock: 0.05, sink: 0.3, salt: 2 };
export const MUZZLED_TEETH: Record<JawedVariant, { upper: ToothProfile | null; lower: ToothProfile | null }> = {
  fanged: {
    upper: { ...CANINE, count: 2, len: () => 0.62, width: 0.3, curl: 0.12, margin: 0.62 },
    lower: { ...CANINE, count: 2, len: () => 0.34, width: 0.32, curl: 0.12, margin: 0.5, salt: 5 },
  },
  maw: { upper: { ...CANINE, count: 2, len: () => 0.36, width: 0.34, curl: 0.1, margin: 0.62 }, lower: null },
  herbivore: { upper: { ...CANINE, count: 2, len: () => 0.3, width: 0.62, curl: 0.04, margin: 0.9 }, lower: null },
  underbite: { upper: null, lower: { ...CANINE, count: 2, len: () => 0.5, width: 0.3, curl: -0.2, margin: 0.55, salt: 5 } },
};

// A REPTILE's or an amphibian's mouth (a sealed spec — scaled, plated or bare skin, on a body with
// no fins) is shut too: the snout IS the head, so the jaw barely projects, the lip is a thin dark
// seam, and the teeth are a crocodile's small interlocking rows along that seam — or none at all,
// for the lizard and the frog. A fish's and a shark's shut the same way: their old projecting grin of
// cream teeth over a sausage lip read as a Muppet.
const SEALED_ROW = { jitterLen: 0.14, jitterRock: 0.08, sink: 0.42 };
export const SEALED_TEETH: Record<JawedVariant, { upper: ToothProfile | null; lower: ToothProfile | null }> = {
  fanged: {
    upper: { ...SEALED_ROW, count: 9, len: (u: number) => 0.2 + 0.08 * u + 0.18 * spike(u, 0.55), width: 0.2, curl: 0.12, margin: 0.2, salt: 2 },
    lower: { ...SEALED_ROW, count: 8, len: (u: number) => 0.17 + 0.07 * u + 0.12 * spike(u, 0.32), width: 0.2, curl: 0.12, margin: 0.24, salt: 5 },
  },
  maw: { upper: null, lower: null },
  herbivore: { upper: null, lower: null },
  underbite: { upper: null, lower: { ...SEALED_ROW, count: 2, len: () => 0.42, width: 0.26, curl: -0.2, margin: 0.5, salt: 5 } },
};

/** A jawed mouth that shuts as a seam: any that isn't a furred muzzle (a lizard, a croc, a frog, a
 *  snake, a fish, a shark). */
export function sealedMouth(_phenotype: Phenotype, muzzled: boolean): boolean {
  return !muzzled;
}

/** Is a shut seam drawn across the face? Not on a slug's (a slime body's): its mouth lies under its
 *  head, and a crease across the front of its dome was a line painted on a pickle. */
export function seamShown(p: Phenotype, sealed: boolean): boolean {
  return !(sealed && p.genomeRef.covering.type === 'slime');
}

/** a smooth bump of width ~0.16 centered at u = c — one emphasized canine position */
function spike(u: number, c: number): number {
  const d = (u - c) / 0.16;
  return Math.max(0, 1 - d * d);
}

export interface JawedBuild {
  r: number;
  aim: Vec3; // the mouth's forward aim (node-relative frame)
  /** the node-relative, PROJECTED lip curves every piece is anchored to (tests verify against
   *  these: after projection the muzzle stands off the raw skull by design, so the anti-floating
   *  guarantee is "rooted in the mouth line", not "within sink-depth of the skull") */
  upper: MouthSample[];
  lower: MouthSample[];
  muzzle: THREE.BufferGeometry; // upper-jaw mass above the lip line
  upperFold: THREE.BufferGeometry; // overhanging upper lip that hides the tooth roots
  jawMass: THREE.BufferGeometry; // mandible mass below the lip line
  upperLip: THREE.BufferGeometry;
  lowerLip: THREE.BufferGeometry;
  upperTeeth: ToothXform[];
  lowerTeeth: ToothXform[];
  interior: THREE.BufferGeometry;
  /** a muzzled mouth's nose pad (node-relative), else null */
  nose: THREE.BufferGeometry | null;
  /** a short muzzle's whisker pads (node-relative, baked body space: they wear the coat), else null */
  pads: THREE.BufferGeometry | null;
  /** …and its two nostrils, dark commas on the pad's front */
  nostrils: THREE.BufferGeometry | null;
  muzzled: boolean;
  /** a reptile's / amphibian's seam mouth (see sealedMouth) */
  sealed: boolean;
}

/** Pure, node-relative jawed-mouth build — everything derived from the surface mouth line. */
export function buildJawed(
  phenotype: Phenotype,
  idx: number,
  carves: readonly Carve[],
  recessed: boolean,
  variant: JawedVariant,
  surface: SkinSurface = 'kit',
): JawedBuild | null {
  const spec = mouthSpec(phenotype, idx);
  if (!spec) return null;
  const base: JawedParams = JAWED_PARAMS[variant];
  const muzzled = spec.muzzled;
  const sealed = sealedMouth(phenotype, muzzled);
  // a muzzled mouth sits ON a real snout (grow built one), so it barely projects; its lips are thin
  const params: JawedParams = muzzled
    ? {
        ...base,
        ...MUZZLED_TEETH[variant],
        project: base.project * 0.12,
        lipR: (u) => base.lipR(u) * 0.55,
        lowerLipR: (u) => base.lowerLipR(u) * 0.5,
        muzzleR: base.muzzleR * 0.5,
        jawR: base.jawR * 0.7,
      }
    : {
        // a reptile's, a frog's or a fish's: the jaw IS the snout — a dark seam along it, its small teeth.
        // (It lies IN the snout's surface: pushed forward even a fifth as far as a projecting muzzle's,
        // the rim stood off the head as a ledge — a second lip under a shark's snout, a nub on a
        // theropod's nose.)
        ...base,
        ...SEALED_TEETH[variant],
        project: base.project * 0.03,
        lipR: (u) => base.lipR(u) * 0.32,
        lowerLipR: (u) => base.lowerLipR(u) * 0.3,
        muzzleR: base.muzzleR * 0.55,
        jawR: base.jawR * 0.7,
      };
  const r = spec.r;
  const seed = phenotype.genomeRef.seed;
  const traced = buildMouthLine(phenotype, spec, carves, 17, surface);
  // a long-headed reptile's seam runs back along its jaw to the hinge under its eye (a fish's and a
  // slug's mouths are their own: see runSeamBack)
  const line = sealed && !isSwimmer(phenotype) && phenotype.genomeRef.covering.type !== 'slime' ? runSeamBack(phenotype, spec, traced, surface) : traced;
  // …and a row of teeth along it keeps its spacing: as many more as the seam is longer
  if (line !== traced) {
    const more = seamLength(line.upper) / Math.max(seamLength(traced.upper), 1e-6);
    const grow = (t: ToothProfile | null) => (t ? { ...t, count: Math.min(RUN_TEETH_MAX, Math.round(t.count * more)) } : null);
    params.upper = grow(params.upper);
    params.lower = grow(params.lower);
  }
  // A shut reptile's teeth hang OUTSIDE its closed jaw — a crocodile's grin, a dragon's: raked in toward
  // the throat like an open mouth's, every crown ran down from the seam into the shut lower jaw, under
  // the skin, and the animal had no teeth at all. (A snake shows none: its mouth shuts over them.)
  if (line !== traced) {
    const legged = phenotype.nodes.some((n) => n.part?.kind === 'leg');
    const out = (t: ToothProfile | null) => (t && legged ? { ...t, curl: -TEETH_OUT } : null);
    params.upper = out(params.upper);
    params.lower = out(params.lower);
  }
  const o = spec.node.pos; // node-relative frame origin

  // PROJECT the muzzle. The lip curves are traced onto the existing skull surface, so on their own
  // they can only ever be a decal on a smooth head — no snout. Pushing each sample out along the
  // aim, weighted to peak at the front centre and vanish at the corners, pulls the mouth forward
  // into an actual protruding muzzle while the corners stay welded where they were traced.
  const project = (row: MouthSample[]): MouthSample[] =>
    row.map((s) => {
      const w = Math.pow(Math.cos((s.t * Math.PI) / 2), 1.3); // 1 at the front centre → 0 at corners
      const d = params.project * r * w;
      const dir = norm3([
        spec.aim[0] * 0.8 + s.n[0] * 0.2,
        spec.aim[1] * 0.8 + s.n[1] * 0.2,
        spec.aim[2] * 0.8 + s.n[2] * 0.2,
      ]);
      return { ...s, p: [s.p[0] + dir[0] * d, s.p[1] + dir[1] * d, s.p[2] + dir[2] * d] as Vec3 };
    });
  const upperBase = relRow(line.upper, o); // where the curve was traced, ON the skull
  const lowerBase = relRow(line.lower, o);
  const upper = project(upperBase);
  const lower = project(lowerBase);

  // lips — swept along the true-lip curves, flattened onto the skin, thinning into the corners
  // (a reptile's seam along its jaw is a groove: its line sunk into the skin by SEAM_SINK of its own
  // thickness — laid on the skin, a dark wire ran along the face and stood off the head's outline)
  const sink = line !== traced ? SEAM_SINK : 0;
  const lipPts = (row: MouthSample[], lr: (u: number) => number = () => 0): SweepPoint[] =>
    row.map((s) => {
      const d = sink * r * lr(Math.abs(s.t));
      return { p: [s.p[0] - s.n[0] * d, s.p[1] - s.n[1] * d, s.p[2] - s.n[2] * d] as Vec3, n: s.n };
    });
  const upperLip = sweepTube(lipPts(upper, params.lipR), {
    radius: (u) => r * params.lipR(Math.abs(u * 2 - 1)),
    flatten: 0.45,
    radialSegments: 10,
  });
  const lowerLip = sweepTube(lipPts(lower, params.lowerLipR), {
    radius: (u) => r * params.lowerLipR(Math.abs(u * 2 - 1)),
    flatten: 0.45,
    radialSegments: 10,
  });

  // jaw MASSES — lofted from the projected rim back to the traced curve on the skull, so the snout
  // is a welded volume rather than a shell standing off the head. (Fat tubes near the rim left a
  // hollow behind deep projections: an adversarial probe saw through ~19% of the view sphere on
  // fanged mouths. Lofting removes the failure mode instead of tuning around it.)
  const muzzle = muzzleSkirt(upper, upperBase, r * params.muzzleR * 0.55);
  const jawMass = muzzleSkirt(lower, lowerBase, r * params.jawR * 0.55);

  // An OVERHANGING upper lip. Without it the upper tooth row sits exposed on the rim and you see
  // straight over the roots into the top of the mouth. This is a fatter fold, pushed forward off
  // the tooth line (+aim) and draping down (−away), so it covers the roots and closes that view —
  // a convex labial covering. The upper teeth then root a touch back (−aim), tucked behind it, so
  // only their downward tips show below the fold's edge.
  // (on a seam mouth — a reptile's, a shark's — the fold is the lip itself, lying on the snout: pushed
  // as far forward as a projecting muzzle's, it stood clear of the head, a shelf with teeth under it
  // — a brace hung on a shark's chin, a plank on a theropod's nose)
  const foldOut = r * (sealed ? 0.035 : 0.16);
  const foldPts: SweepPoint[] = upper.map((s) => ({
    p: [
      s.p[0] + spec.aim[0] * foldOut - s.away[0] * r * 0.05,
      s.p[1] + spec.aim[1] * foldOut - s.away[1] * r * 0.05,
      s.p[2] + spec.aim[2] * foldOut - s.away[2] * r * 0.05,
    ] as Vec3,
    n: s.n,
  }));
  const upperFold = sweepTube(foldPts, {
    radius: (u) => r * params.lipR(Math.abs(u * 2 - 1)) * 1.9,
    flatten: 0.62,
    radialSegments: 10,
  });

  // teeth — roots interpolate the same curves; the lower row interlocks into the upper's gaps.
  // Rows stay separate: the lower row belongs to the mandible group and swings with the gape.
  // The upper row is pulled back under the fold so its roots hide behind the overhang.
  const upperTucked: MouthSample[] = upper.map((s) => ({
    ...s,
    p: [s.p[0] - spec.aim[0] * r * 0.06, s.p[1] - spec.aim[1] * r * 0.06, s.p[2] - spec.aim[2] * r * 0.06] as Vec3,
  }));
  // (a slug has no teeth to show: a row of them along its seam was a zipper)
  const toothless = phenotype.genomeRef.covering.type === 'slime';
  const upperTeeth: ToothXform[] = params.upper && !toothless ? toothRow(upperTucked, params.upper, r, seed) : [];
  const lowerTeeth: ToothXform[] = params.lower && !toothless ? toothRow(lower, params.lower, r, seed, true) : [];


  // the interior — a sheet spanning the opening: recessed into the real carve on smooth skin,
  // a hair proud of the capsule kit as a dark throat backdrop (depth by shading, not geometry)
  // a real concave throat: now that the muzzle projects, the bowl has room to recede INTO it
  // without vanishing inside the skull, on the capsule kit as well as the carved smooth skin
  const interior = interiorBowl(upper, lower, [-spec.aim[0], -spec.aim[1], -spec.aim[2]],
    r * (recessed ? 0.95 : 0.62));


  // the jaw masses (and a mammal's lip fold) are skin: give them body-space coordinates so they can
  // wear the body's own covering material (pattern, countershading and relief continue across)
  for (const g of muzzled || sealed ? [muzzle, jawMass, upperFold] : [muzzle, jawMass]) bakeBodySpace(g, o);

  // the nose pad: a soft, flattened wedge seated on the muzzle tip, its broad face along the skin. Set
  // INTO the muzzle and flat, with two nostrils: a full ellipsoid perched proud of the tip read as a
  // glossy black olive stuck on the face.
  let nose: THREE.BufferGeometry | null = null;
  let nostrils: THREE.BufferGeometry | null = null;
  let pads: THREE.BufferGeometry | null = null;
  if (line.nose) {
    const n = norm3(line.nose.n);
    const upHint = norm3([spec.up[0] - n[0] * dot(spec.up, n), spec.up[1] - n[1] * dot(spec.up, n), spec.up[2] - n[2] * dot(spec.up, n)], [0, 1, 0]);
    const X = new THREE.Vector3(...upHint).cross(new THREE.Vector3(...n)).normalize();
    const Y = new THREE.Vector3(...n).cross(X).normalize();
    const Z = new THREE.Vector3(...n);
    const g = new THREE.SphereGeometry(1, 18, 12);
    // a short muzzle wears a small nose: a cat's is a little triangle, a dog's a broad pad (the same
    // pad on every muzzle gave a cat a dog's big black nose)
    const ns = noseScaleOf(snoutReach(phenotype, idx));
    // wider across the top than at the bottom: a rounded triangle, the classic mammal rhinarium (the
    // smaller, the more a triangle)
    const flare = 0.32 + 1.0 * Math.max(0, 1 - ns);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setX(i, pos.getX(i) * (1 + flare * y));
    }
    const frame = new THREE.Matrix4().makeBasis(X, Y, Z);
    const at = new THREE.Vector3(line.nose.p[0] - o[0], line.nose.p[1] - o[1], line.nose.p[2] - o[2]).addScaledVector(Z, -r * 0.02);
    const m = frame.clone().scale(new THREE.Vector3(r * 0.36 * ns, r * 0.22 * ns, r * 0.11 * ns));
    m.setPosition(at);
    g.applyMatrix4(m);
    g.computeVertexNormals();
    nose = g;
    // the nostrils: two small dark commas low on the pad's front, slanting out and down
    const holes: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const h = new THREE.SphereGeometry(1, 10, 6);
      const local = new THREE.Matrix4()
        .makeTranslation(side * r * 0.13 * ns, -r * 0.035 * ns, r * 0.085 * ns)
        .multiply(new THREE.Matrix4().makeRotationZ(side * 0.45))
        .multiply(new THREE.Matrix4().makeScale(r * 0.07 * ns, r * 0.036 * ns, r * 0.03 * ns));
      h.applyMatrix4(frame.clone().setPosition(at).multiply(local));
      holes.push(h);
    }
    nostrils = mergeGeometries(holes) ?? null;
    for (const h of holes) h.dispose();
    // a short muzzle's WHISKER PADS: two soft lobes either side of the mouth's middle, under the nose
    // (without them a cat's face was a plush ball with a nose on it: no muzzle at all)
    if (muzzled && snoutReach(phenotype, idx) < SNOUT_SHORT) {
      const lobes: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        const lobe = new THREE.SphereGeometry(1, 16, 12);
        const local = new THREE.Matrix4()
          .makeTranslation(side * r * PAD_SPREAD, -r * PAD_DROP, -r * 0.1)
          .multiply(new THREE.Matrix4().makeScale(r * 0.32, r * 0.26, r * 0.24));
        lobe.applyMatrix4(frame.clone().setPosition(at).multiply(local));
        lobes.push(lobe.toNonIndexed());
        lobe.dispose();
      }
      pads = mergeGeometries(lobes) ?? null;
      for (const l of lobes) l.dispose();
      if (pads) {
        pads.computeVertexNormals();
        bakeBodySpace(pads, o);
      }
    }
  }

  return { r, aim: spec.aim, upper, lower, muzzle, upperFold, jawMass, upperLip, lowerLip, upperTeeth, lowerTeeth, interior, nose, nostrils, pads, muzzled, sealed };
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** a lip row's length along its samples */
function seamLength(row: readonly MouthSample[]): number {
  let L = 0;
  for (let i = 1; i < row.length; i++) L += Math.hypot(row[i].p[0] - row[i - 1].p[0], row[i].p[1] - row[i - 1].p[1], row[i].p[2] - row[i - 1].p[2]);
  return L;
}
/** the most teeth a row run back along a jaw carries */
const RUN_TEETH_MAX = 22;
/** how far a shut reptile's teeth tilt out from its skin (rad) so their crowns clear the closed jaw */
export const TEETH_OUT = 0.32;
/** how deep a reptile's seam along its jaw lies in the skin (× its own thickness): a groove, not a wire */
export const SEAM_SINK = 0.55;

/**
 * How far a muzzle runs out ahead of its braincase: the mouth's distance from its head section's first
 * node, in that node's radii — about 1.6 on a cat, 2 on a mouse or a weasel, 2.4 on a dog or a bear, 3
 * on a deer.
 */
export function snoutReach(p: Phenotype, mouthIdx: number): number {
  const parent = p.edges.find(([, b]) => b === mouthIdx)?.[0];
  if (parent === undefined) return SNOUT_LONG;
  const seg = p.nodes[parent].segment;
  const head = p.nodes.find((n) => n.kind === 'spine' && n.segment === seg);
  if (!head) return SNOUT_LONG;
  const m = p.nodes[mouthIdx].pos;
  return Math.hypot(m[0] - head.pos[0], m[1] - head.pos[1], m[2] - head.pos[2]) / Math.max(head.radius, 1e-6);
}
/** a muzzle reaching no further than this ahead of its braincase is a short one: a cat's */
export const SNOUT_SHORT = 1.85;
const SNOUT_LONG = 2.4;
/** a whisker pad's offset from the nose, sideways and down (×the mouth's radius) */
const PAD_SPREAD = 0.3;
const PAD_DROP = 0.3;

/** …and a long muzzle's nose pad against the mouth's size */
const NOSE_LONG = 1.5;
/** the nose pad's size against the mouth's, by the muzzle's reach: 0.75 on a cat's short muzzle, half
 *  as big again on a dog's or a bear's, where the pad covers most of the muzzle's front (at 0.6 a
 *  cat's was a pink speck; at the cat's size a bear's was a dot on the end of a hippo's snout) */
export function noseScaleOf(reach: number): number {
  return Math.min(NOSE_LONG, Math.max(0.75, 0.75 + ((NOSE_LONG - 0.75) * (reach - 1.6)) / (SNOUT_LONG - 1.6)));
}

/**
 * How likely a nose is to be pink rather than near-black: the smaller the animal, the likelier —
 * better than even on a mouse, nothing on anything that stands as tall as a cat, a dog or a bear.
 * Judged from the body itself: how high its back stands above the lowest thing it has.
 */
/** …and a short muzzle's (a cat's) rose more often than not, whatever its size */
const SHORT_PINK = 0.65;

export function pinkNoseChance(p: Phenotype): number {
  let top = -Infinity;
  let floor = Infinity;
  for (const n of p.nodes) {
    floor = Math.min(floor, n.pos[1] - n.radius);
    if (n.kind === 'spine' && (n.segment ?? 0) === 0) top = Math.max(top, n.pos[1] + n.radius * (n.scale?.[1] ?? 1));
  }
  const height = top - floor;
  // …and a small animal with a brush of a tail (a weasel's) has a dark nose more often than not: a pink
  // button on a small furred face, with whiskers, is a rat's or a hamster's
  const tail = tailRootRatio(p);
  const brush = tail > BRUSH_TAIL && Number.isFinite(tail);
  return 0.7 * Math.min(1, Math.max(0, (2.0 - height) / 0.6)) * (brush ? 0.3 : 1);
}
/** a tail's root this thick against the trunk (×its radius) is a brush: a weasel's (~0.37), not a rat's
 *  (~0.12), a cat's (~0.2) or a dog's (~0.16) */
const BRUSH_TAIL = 0.3;

export function JawedMouth({
  f,
  phenotype,
  carves,
  recessed,
  variant,
  dark,
  skin,
  surface = 'kit',
}: {
  f: MeshFeature;
  phenotype: Phenotype;
  carves: readonly Carve[];
  recessed: boolean; // true when the smooth skin actually carved the cavity behind this mouth
  variant: JawedVariant;
  dark: number;
  skin?: THREE.Material; // the body's covering material — a mammal's jaw wears it
  surface?: SkinSurface; // which rendered skin to trace lips onto (kit vs blended smooth/hybrid)
}) {
  const built = useMemo(
    () => buildJawed(phenotype, f.idx, carves, recessed, variant, surface),
    [phenotype, f.idx, carves, recessed, variant, surface],
  );
  const pal = phenotype.genomeRef.palette;
  const coat = useMemo(() => coatMain(pal).getHex(), [pal]);
  // a wet nose: near-black, or on a small animal as often the dusky pink of a mouse's or a kitten's
  // (a pink nose on a bear or a wolf made a giant rodent of it — the bigger the body, the rarer)
  // (an ape has no wet rhinarium: its nose is the bare face's own skin, a shade darker)
  const ape = useMemo(() => faceMaskOf(phenotype), [phenotype]);
  const noseColor = useMemo(
    () =>
      ape
        ? new THREE.Color(ape.color).multiplyScalar(0.7).getHex()
        : hash01(phenotype.genomeRef.seed, 0x4e05) < Math.max(pinkNoseChance(phenotype), snoutReach(phenotype, f.idx) < SNOUT_SHORT ? SHORT_PINK : 0)
          ? new THREE.Color().setHSL(0.98, 0.32, 0.42).getHex()
          : 0x1c1416,
    [phenotype, ape],
  );

  const fang = useMemo(() => ((JAWED_PARAMS[variant] as JawedParams).blunt ? bluntGeometry() : fangGeometry()), [variant]);
  const muzzled = built?.muzzled ?? false;
  const sealed = built?.sealed ?? false;
  const shut = muzzled || sealed;
  const mats = useMemo(() => {
    // a mammal's lip line and a reptile's seam are a dark crease; a fish's rim a darker tone of its hide.
    // (A shut mouth's crease is a deep shade of the creature's own hide: near-black — its dark tone at
    // half strength — it was a line drawn in ink under the eyes, a smiley face from the front.)
    const lip = shut
      ? new THREE.Color(coat).multiplyScalar(0.42).lerp(new THREE.Color(dark).multiplyScalar(0.55), 0.45)
      : new THREE.Color(dark).lerp(new THREE.Color(LIP), 0.2).multiplyScalar(0.85);
    return {
      lip: new THREE.MeshStandardMaterial({ color: lip, roughness: 0.52 }),
      // the jaw masses wear the body's own dark skin tone so they read as part of the head — a
      // mammal's wear its coat (the chin and the lip fold are fur)
      jaw: new THREE.MeshStandardMaterial({ color: muzzled ? coat : dark, roughness: muzzled ? 0.85 : 0.62 }),
      nose: new THREE.MeshPhysicalMaterial({ color: noseColor, roughness: ape ? 0.7 : 0.38, clearcoat: ape ? 0 : 0.6, clearcoatRoughness: 0.35 }),
      nostril: new THREE.MeshStandardMaterial({ color: 0x050405, roughness: 0.9 }),
      interior: new THREE.MeshStandardMaterial({ color: INTERIOR, roughness: 0.3, side: THREE.DoubleSide }),
      teeth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }),
    };
  }, [dark, muzzled, shut, coat, noseColor, ape]);

  // dispose per lifetime: the per-creature geometries turn over with `built`, but the shared fang
  // and the materials must NOT be disposed on every phenotype swap while still in use
  useEffect(
    () => () => {
      if (built) {
        built.muzzle.dispose();
        built.upperFold.dispose();
        built.jawMass.dispose();
        built.upperLip.dispose();
        built.lowerLip.dispose();
        built.interior.dispose();
        built.nose?.dispose();
        built.pads?.dispose();
        built.nostrils?.dispose();
      }
    },
    [built],
  );
  useEffect(() => () => fang.dispose(), [fang]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);


  // the World articulates the lower jaw (closed at rest, chewing, biting); elsewhere it keeps the
  // built gape. The hinge is measured from the built lip curves.
  const jaw = useContext(JawContext);
  const lowerJaw = useRef<THREE.Group>(null);
  const hinge = useMemo(() => (built ? hingeOf(built.upper, built.lower, built.aim) : null), [built]);
  const throat = useRef<THREE.Mesh>(null);
  const jawMassRef = useRef<THREE.Mesh>(null);
  const upperRow = useRef<THREE.InstancedMesh | null>(null);
  useFrame(() => {
    if (!hinge || !lowerJaw.current) return;
    // no control (Breed / Studio still): the mouth is held shut
    const open = jaw ? jaw.open : REST_SHUT;
    poseJaw(lowerJaw.current, hinge, open);
    lowerJaw.current.visible = jawDrawn(open);
    if (throat.current) throat.current.visible = open > 0.35;
    // a shut mammal's chin is the skull's own: the lofted mandible only shows once the jaw drops
    // (held shut it hung under the chin as a pale band)
    if (jawMassRef.current) jawMassRef.current.visible = teethDrawn(muzzled, open);
    if (upperRow.current) upperRow.current.visible = teethDrawn(muzzled, open);
  });

  if (!built) return null;
  const coatMat = skin ?? mats.jaw;
  return (
    <group>
      {/* the throat stays with the skull; when the jaw nearly shuts there is no opening to show it
          through (and swinging it with the jaw pushed its upper edge out through the face) */}
      <mesh ref={throat} geometry={built.interior} material={mats.interior} />
      {/* (a seam's upper jaw mass is a sliver lying on the skin, a twentieth of a radius proud of it: drawn
          in the hide's own material it fought the skin for the same pixels, a dashed line along the mouth
          — a zipper. A seam's skull is its upper jaw.) */}
      {!sealed && <mesh geometry={built.muzzle} material={coatMat} castShadow />}
      {seamShown(phenotype, sealed) && <mesh geometry={built.upperLip} material={mats.lip} castShadow />}
      {/* (a mammal's mouth wears no fold: with only its canines/incisors there are no tooth roots to
          hide, and draped under the lip line in the coat it hung below the chin as a pale band; nor
          does a toothless seam — a frog's, a fish's — where it jutted ahead of the snout as a hook) */}
      {!muzzled && built.upperTeeth.length > 0 && <mesh geometry={built.upperFold} material={shut ? coatMat : mats.lip} castShadow />}
      {built.nose && <mesh geometry={built.nose} material={mats.nose} castShadow />}
      {built.pads && <mesh geometry={built.pads} material={coatMat} castShadow />}
      {built.nostrils && <mesh geometry={built.nostrils} material={mats.nostril} />}
      {built.upperTeeth.length > 0 && (
        <instancedMesh
          args={[fang, mats.teeth, built.upperTeeth.length]}
          frustumCulled={false}
          visible={!muzzled}
          ref={(m: THREE.InstancedMesh | null) => {
            upperRow.current = m;
            if (m) setToothInstances(m, built.upperTeeth);
          }}
        />
      )}
      {/* the lower jaw: lip, mass and tooth row — one group, so it can swing on its hinge (and it is
          only drawn once the mouth opens: see JAW_SHOWN) */}
      <group ref={lowerJaw} visible={false}>
            <mesh ref={jawMassRef} geometry={built.jawMass} material={coatMat} castShadow />
            <mesh geometry={built.lowerLip} material={mats.lip} castShadow />
            {built.lowerTeeth.length > 0 && (
              <instancedMesh
                args={[fang, mats.teeth, built.lowerTeeth.length]}
                frustumCulled={false}
                ref={(m: THREE.InstancedMesh | null) => {
                  if (m) setToothInstances(m, built.lowerTeeth);
                }}
              />
            )}
      </group>
    </group>
  );
}
