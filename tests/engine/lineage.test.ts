import { describe, it, expect } from 'vitest';
import { childIdsOf, pathToRoot, rootId, layoutTree, type LineageNodes } from '../../src/engine/lineage';
import { defaultGenome } from '../../src/engine/genome';

// a small tree:  0 → 1 → 2 (a chain), plus a branch 1 → 3
function fixture(): LineageNodes {
  const g = defaultGenome();
  return {
    '0': { id: '0', genome: g, parentId: null, generation: 0 },
    '1': { id: '1', genome: g, parentId: '0', generation: 1 },
    '2': { id: '2', genome: g, parentId: '1', generation: 2 },
    '3': { id: '3', genome: g, parentId: '1', generation: 2 },
  };
}

describe('lineage helpers', () => {
  it('finds the root and direct children', () => {
    const nodes = fixture();
    expect(rootId(nodes)).toBe('0');
    expect(childIdsOf(nodes, '1')).toEqual(['2', '3']);
    expect(childIdsOf(nodes, '2')).toEqual([]);
  });

  it('walks a path to the root (root-first)', () => {
    expect(pathToRoot(fixture(), '3')).toEqual(['0', '1', '3']);
  });

  it('lays the tree out with the root at depth 0 and branches on separate rows', () => {
    const layout = layoutTree(fixture(), '0');
    expect(layout.pos['0'].x).toBe(0);
    expect(layout.pos['2'].x).toBe(2);
    expect(layout.pos['3'].x).toBe(2);
    // the two leaves of the branch occupy different rows
    expect(layout.pos['2'].y).not.toBe(layout.pos['3'].y);
    // the parent of the branch centers between its children
    expect(layout.pos['1'].y).toBeCloseTo((layout.pos['2'].y + layout.pos['3'].y) / 2);
    expect(layout.rows).toBe(2);
  });

  it('lays out exactly as the simple recursive rule says, on any tree', () => {
    // the rule: leaves take successive rows in creation order; a parent centres on its children
    const reference = (nodes: LineageNodes, root: string) => {
      const pos: Record<string, { x: number; y: number }> = {};
      let row = 0;
      let depthMax = 0;
      const visit = (id: string, depth: number): void => {
        depthMax = Math.max(depthMax, depth);
        const kids = childIdsOf(nodes, id);
        if (kids.length === 0) {
          pos[id] = { x: depth, y: row++ };
          return;
        }
        for (const k of kids) visit(k, depth + 1);
        const ys = kids.map((k) => pos[k].y);
        pos[id] = { x: depth, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      };
      visit(root, 0);
      return { pos, cols: depthMax, rows: Math.max(1, row) };
    };
    const g = defaultGenome();
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
    for (let trial = 0; trial < 40; trial++) {
      const nodes: LineageNodes = { '0': { id: '0', genome: g, parentId: null, generation: 0 } };
      const n = 2 + Math.floor(rnd() * 60);
      for (let i = 1; i < n; i++) {
        // mostly a line, with branches off earlier creatures — what a breeder's tree looks like
        const parent = rnd() < 0.7 ? i - 1 : Math.floor(rnd() * i);
        nodes[String(i)] = { id: String(i), genome: g, parentId: String(parent), generation: nodes[String(parent)].generation + 1 };
      }
      expect(layoutTree(nodes, '0')).toEqual(reference(nodes, '0'));
    }
  });

  it('a lineage tens of thousands of generations long lays out at once (no deep recursion, one pass)', () => {
    const g = defaultGenome();
    const nodes: LineageNodes = { '0': { id: '0', genome: g, parentId: null, generation: 0 } };
    for (let i = 1; i < 30000; i++) nodes[String(i)] = { id: String(i), genome: g, parentId: String(i % 50 === 0 ? i - 20 : i - 1), generation: i };
    const t0 = Date.now();
    const layout = layoutTree(nodes, '0');
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(Object.keys(layout.pos).length).toBe(30000);
    expect(layout.rows).toBeGreaterThan(1);
  });

  it('a ring of parents ends a walk to the root, and is simply not laid out', () => {
    const g = defaultGenome();
    const nodes: LineageNodes = {
      '0': { id: '0', genome: g, parentId: null, generation: 0 },
      '1': { id: '1', genome: g, parentId: '2', generation: 1 },
      '2': { id: '2', genome: g, parentId: '1', generation: 2 },
    };
    expect(pathToRoot(nodes, '1').length).toBe(2);
    expect(Object.keys(layoutTree(nodes, '0').pos)).toEqual(['0']);
    expect(layoutTree(nodes, 'nobody')).toEqual({ pos: {}, cols: 0, rows: 1 });
  });

  it('lays a pure chain out flat on one row', () => {
    const g = defaultGenome();
    const chain: LineageNodes = {
      '0': { id: '0', genome: g, parentId: null, generation: 0 },
      '1': { id: '1', genome: g, parentId: '0', generation: 1 },
      '2': { id: '2', genome: g, parentId: '1', generation: 2 },
    };
    const layout = layoutTree(chain, '0');
    expect(layout.rows).toBe(1);
    expect([layout.pos['0'].y, layout.pos['1'].y, layout.pos['2'].y]).toEqual([0, 0, 0]);
  });
});
