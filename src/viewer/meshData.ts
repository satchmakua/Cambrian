/**
 * Render data for a Phenotype (DESIGN §6.3). Pure data — no three.js.
 *
 * Exposes per-node positions/radii, the edges (capsules), which nodes are plain body
 * spheres vs. **features** (eyes/mouth/feet/claws/fins), and the bounds center/size.
 * CreatureMesh renders this and animates the node positions each frame (M5 motion).
 */
import type { Phenotype } from '../engine/grow';
import type { Terminal, PartKind } from '../engine/genome';

// Face organs that seat directly on a body surface: the capsule that would connect the body to one of
// these is the fat flesh tube that buried the face (the "boob-eye"). We never draw it — the organ sits
// proud on the surface (grow seats it) and renders its own geometry on top, so it can't be occluded.
const SURFACE_ORGANS = new Set<Terminal>(['eye', 'mouth', 'ear']);

export interface MeshNode {
  pos: [number, number, number];
  radius: number;
  scale?: [number, number, number]; // local-frame ellipsoid multipliers on radius (heads/flat bodies)
  quat?: [number, number, number, number]; // node orientation — only carried when `scale` is set
}

export interface MeshEdge {
  a: number; // node index
  b: number; // node index
  radius: number;
}

export interface MeshFeature {
  type: Exclude<Terminal, 'none'>;
  idx: number; // node index
  radius: number;
  quat: [number, number, number, number]; // node orientation; local +Z points outward
  kind?: PartKind; // which genome part this is (eye-vs-horn etc.)
  style: number; // 0..1 — selects the render variant
}

export interface MeshData {
  nodes: MeshNode[];
  edges: MeshEdge[];
  bodySpheres: number[]; // node indices drawn with the body material
  features: MeshFeature[];
  center: [number, number, number];
  size: [number, number, number]; // bounds dimensions
}

export function buildMeshData(p: Phenotype): MeshData {
  const nodes: MeshNode[] = p.nodes.map((n) => ({ pos: n.pos, radius: n.radius, scale: n.scale, quat: n.scale ? n.quat : undefined }));
  const edges: MeshEdge[] = [];
  for (const [a, b] of p.edges) {
    // never draw the connecting capsule into a seated face organ (see SURFACE_ORGANS) — that tube is
    // what buried the eyes/mouth. The organ's parent surface holds it; its own mesh renders on top.
    const tb = p.nodes[b].terminal;
    if (tb && SURFACE_ORGANS.has(tb)) continue;
    if (p.nodes[b].part?.kind === 'wing') continue; // wings render whole from the shoulder (wings.ts)
    edges.push({ a, b, radius: ((p.nodes[a].radius + p.nodes[b].radius) / 2) * 0.9 });
  }

  const bodySpheres: number[] = [];
  const features: MeshFeature[] = [];
  p.nodes.forEach((n, i) => {
    if (n.terminal && n.terminal !== 'none') {
      features.push({ type: n.terminal, idx: i, radius: n.radius, quat: n.quat, kind: n.part?.kind, style: n.part?.style ?? 0.5 });
    } else if (n.part?.kind !== 'wing') {
      bodySpheres.push(i);
    }
  });

  const { min, max } = p.bounds;
  return {
    nodes,
    edges,
    bodySpheres,
    features,
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}
