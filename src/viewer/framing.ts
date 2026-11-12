/**
 * Framing — where a creature sits and how big it is, for any view that has to put a camera on one
 * (the Studio's plates, the litter's thumbnails, the portraits). Pure.
 */
import type { Phenotype } from '../engine/grow';

export interface Framing {
  center: [number, number, number];
  ext: [number, number, number]; // bounds extents (x width, y height, z length)
  size: number; // longest extent
  groundY: number; // ground plane in centred space
  face: { pt: [number, number, number]; r: number } | null; // face focus in centred space
}

export function framingOf(p: Phenotype): Framing {
  const { min, max } = p.bounds;
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
  return { center, ext, size, groundY: -ext[1] / 2, face };
}
