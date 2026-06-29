/**
 * Render data for a Phenotype (DESIGN §6.3). Pure data — no three.js.
 *
 * Exposes per-node positions/radii, the edges (capsules), which nodes are plain body
 * spheres vs. **features** (eyes/mouth/feet/claws/fins), and the bounds center/size.
 * CreatureMesh renders this and animates the node positions each frame (M5 motion).
 */
import type { Phenotype } from '../engine/grow';
import type { Terminal, PartKind } from '../engine/genome';

export interface MeshNode {
  pos: [number, number, number];
  radius: number;
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
  const nodes: MeshNode[] = p.nodes.map((n) => ({ pos: n.pos, radius: n.radius }));
  const edges: MeshEdge[] = p.edges.map(([a, b]) => ({
    a,
    b,
    radius: ((p.nodes[a].radius + p.nodes[b].radius) / 2) * 0.9,
  }));

  const bodySpheres: number[] = [];
  const features: MeshFeature[] = [];
  p.nodes.forEach((n, i) => {
    if (n.terminal && n.terminal !== 'none') {
      features.push({ type: n.terminal, idx: i, radius: n.radius, quat: n.quat, kind: n.part?.kind, style: n.part?.style ?? 0.5 });
    } else {
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
