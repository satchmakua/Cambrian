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
