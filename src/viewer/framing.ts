/**
 * Framing — where a creature sits and how big it is, for any view that has to put a camera on one
 * (the Studio's plates, the litter's thumbnails, the portraits). Pure.
 */
import type { Phenotype } from '../engine/grow';
import { buildMeshData } from './meshData';
import { finBounds } from './wings';

export interface Framing {
  center: [number, number, number];
  ext: [number, number, number]; // bounds extents (x width, y height, z length)
  size: number; // longest extent
  groundY: number; // ground plane in centred space
  face: { pt: [number, number, number]; r: number } | null; // face focus in centred space
  radial: boolean; // arrayed about the vertical (a sea star, an urchin, an octopus): its face is its crown
}

export function framingOf(p: Phenotype): Framing {
  let { min, max } = p.bounds;
  // …and out to its fins, which are drawn from their nodes rather than grown as nodes (see finBounds).
  // (A wing lies folded along the body; a feathered tail's fan and a frill stay within reach of it.)
  if (p.nodes.some((n) => n.terminal === 'fin')) {
    const feathered = p.genomeRef.covering.type === 'feathers';
    const fins = buildMeshData(p).features.filter((f) => f.type === 'fin' && f.kind !== 'wing' && f.kind !== 'frill' && !(feathered && f.kind === 'tail'));
    const reach = finBounds(p, fins);
    if (reach) {
      min = [Math.min(min[0], reach.min[0]), Math.min(min[1], reach.min[1]), Math.min(min[2], reach.min[2])];
      max = [Math.max(max[0], reach.max[0]), Math.max(max[1], reach.max[1]), Math.max(max[2], reach.max[2])];
    }
  }
  const center: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const ext: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const size = Math.max(ext[0], ext[1], ext[2], 0.6);
  const faceNodes = p.nodes.filter((n) => n.terminal === 'mouth' || n.terminal === 'eye');
  let face: Framing['face'] = null;
  if (faceNodes.length) {
    const acc = [0, 0, 0];
    for (const n of faceNodes) for (let a = 0; a < 3; a++) acc[a] += n.pos[a];
    const pt: [number, number, number] = [
      acc[0] / faceNodes.length - center[0],
      acc[1] / faceNodes.length - center[1],
      acc[2] / faceNodes.length - center[2],
    ];
    let r = 0.2;
    for (const n of faceNodes) {
      r = Math.max(r, Math.hypot(n.pos[0] - center[0] - pt[0], n.pos[1] - center[1] - pt[1], n.pos[2] - center[2] - pt[2]) + n.radius);
    }
    face = { pt, r };
  }
  return { center, ext, size, groundY: -ext[1] / 2, face, radial: p.genomeRef.symmetry === 'radial' };
}

/** The three-quarter portrait's line of sight onto a face: from in front, a touch high and to one side. */
export const FACE_VIEW: readonly [number, number, number] = (() => {
  const v = [0.42, 0.22, 0.88];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l] as const;
})();

/** …and onto a radial body: from above and to the side, over the arms, at its middle (see faceCamera).
 *  (Straight down onto its face — a sea star's mouth under its disc, an urchin's under its spines — the
 *  plate showed a meaningless close-up of the crown, a hole among spines.) */
export const CROWN_VIEW: readonly [number, number, number] = (() => {
  const v = [0.42, 0.62, 0.66];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l] as const;
})();
/** how far back a crown's portrait stands, × the body's size: the whole of it in frame */
const CROWN_REACH = 1.15;

/**
 * Where a camera stands to look at a creature's face from `want` away along FACE_VIEW — or further
 * back, until it is out of the creature's bounds. A radial body's face is its middle — a sea star's
 * mouth under its disc, an urchin's under its spines — so it is looked down on along CROWN_VIEW, from
 * far enough back to take in the whole of it. (From in front at a head's distance the camera stood
 * inside an arm, or among the spines.)
 */
export function faceCamera(framing: Framing, want: number): { at: [number, number, number]; from: [number, number, number] } {
  const f = framing.radial
    ? { pt: [0, 0, 0] as [number, number, number], r: framing.size * 0.5 }
    : (framing.face ?? { pt: [0, 0, framing.ext[2] / 2] as [number, number, number], r: framing.size * 0.25 });
  const view = framing.radial ? CROWN_VIEW : FACE_VIEW;
  const margin = framing.size * 0.08;
  // the least distance along the view at which it leaves the box (it may leave through any face)
  let out = Infinity;
  for (let a = 0; a < 3; a++) {
    if (view[a] <= 1e-6) continue;
    out = Math.min(out, (framing.ext[a] / 2 - f.pt[a] + margin) / view[a]);
  }
  const d = Math.max(want, out, framing.radial ? framing.size * CROWN_REACH : 0);
  return { at: f.pt, from: [f.pt[0] + view[0] * d, f.pt[1] + view[1] * d, f.pt[2] + view[2] * d] };
}

/**
 * How far off a camera stands from a body it shows in more than one pose (as grown, and lying at
 * rest): by the largest of them. A view framed on whichever pose was showing moved its camera each
 * time the pose changed — a snake set slithering, or stopped, threw away the angle it was being
 * looked at from.
 */
export function reachOf(...poses: Phenotype[]): number {
  return Math.max(...poses.map((p) => framingOf(p).size));
}
