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

/** Path from a node up to its root, root-first. (A lineage is a tree; were it ever handed a ring of
 *  parents, the walk stops after one lap instead of never.) */
export function pathToRoot(nodes: LineageNodes, id: string): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = id;
  while (cur && nodes[cur] && !seen.has(cur)) {
    seen.add(cur);
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
  if (!nodes[root]) return { pos, cols: 0, rows: 1 };

  // every node's children, found in one pass (asking each node in turn for its children was a pass
  // over the whole lineage per node: a second of work at a few thousand generations, on every pick)
  const kids = new Map<string, string[]>();
  for (const n of Object.values(nodes)) {
    if (n.parentId === null) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n.id);
    else kids.set(n.parentId, [n.id]);
  }
  for (const list of kids.values()) list.sort((a, b) => Number(a) - Number(b));

  // children first, then their parent — with a stack of our own rather than the call stack's (a
  // lineage is mostly one long line: ten thousand generations deep is ten thousand calls deep)
  const stack: { id: string; depth: number; next: number }[] = [{ id: root, depth: 0, next: 0 }];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const list = kids.get(top.id);
    if (list && top.next < list.length) {
      stack.push({ id: list[top.next++], depth: top.depth + 1, next: 0 });
      continue;
    }
    stack.pop();
    maxDepth = Math.max(maxDepth, top.depth);
    if (!list) {
      pos[top.id] = { x: top.depth, y: nextRow++ };
    } else {
      let lo = Infinity;
      let hi = -Infinity;
      for (const k of list) {
        lo = Math.min(lo, pos[k].y);
        hi = Math.max(hi, pos[k].y);
      }
      pos[top.id] = { x: top.depth, y: (lo + hi) / 2 };
    }
  }
  return { pos, cols: maxDepth, rows: Math.max(1, nextRow) };
}
