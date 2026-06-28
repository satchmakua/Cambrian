/**
 * Lineage — the family tree (DESIGN §6.2).
 *
 * Each creature you keep is a node recording its genome, its parent, and its
 * generation. Promoting an offspring adds a child node; revisiting an ancestor and
 * picking a different offspring branches the tree. These helpers are pure (the store
 * owns the actual node map + id counter, so ids stay deterministic — no Date.now).
 */
import type { Genome } from './genome';

export interface LineageNode {
  id: string; // a session-unique counter string ("0", "1", …)
  genome: Genome;
  parentId: string | null; // null for a root
  generation: number;
}

export type LineageNodes = Record<string, LineageNode>;

/** Direct children of `id`, ordered by creation (numeric id). */
export function childIdsOf(nodes: LineageNodes, id: string): string[] {
  return Object.values(nodes)
    .filter((n) => n.parentId === id)
    .map((n) => n.id)
    .sort((a, b) => Number(a) - Number(b));
}

/** Path from a node up to its root, root-first. */
export function pathToRoot(nodes: LineageNodes, id: string): string[] {
  const path: string[] = [];
  let cur: string | null = id;
  while (cur && nodes[cur]) {
    path.push(cur);
    cur = nodes[cur].parentId;
  }
  return path.reverse();
}

export function rootId(nodes: LineageNodes): string | null {
  const root = Object.values(nodes).find((n) => n.parentId === null);
  return root ? root.id : null;
}

export interface TreeLayout {
  pos: Record<string, { x: number; y: number }>; // x = generation depth, y = row
  cols: number; // max depth (x extent)
  rows: number; // number of leaf rows (y extent)
}

/**
 * A simple tidy layout: leaves take successive rows; an internal node centers on its
 * children; x is the depth from the root. Good enough for the mostly-linear lineages
 * the breeder produces, with clean branches.
 */
export function layoutTree(nodes: LineageNodes, root: string): TreeLayout {
  const pos: Record<string, { x: number; y: number }> = {};
  let nextRow = 0;
  let maxDepth = 0;

  const visit = (id: string, depth: number): void => {
    maxDepth = Math.max(maxDepth, depth);
    const kids = childIdsOf(nodes, id);
    if (kids.length === 0) {
      pos[id] = { x: depth, y: nextRow++ };
      return;
    }
    for (const k of kids) visit(k, depth + 1);
    const ys = kids.map((k) => pos[k].y);
    pos[id] = { x: depth, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };

  if (nodes[root]) visit(root, 0);
  return { pos, cols: maxDepth, rows: Math.max(1, nextRow) };
}
