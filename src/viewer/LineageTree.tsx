/**
 * The family tree (DESIGN §7). Each kept creature is a dot, colored by its palette,
 * positioned by generation (x) with branches fanning out (y). Click a dot to revisit
 * or branch from that ancestor. Rendered as lightweight SVG — NOT 9 more WebGL
 * canvases — so a deep lineage stays cheap.
 */
import { useMemo } from 'react';
import { layoutTree, rootId, type LineageNodes } from '../engine/lineage';
import type { Palette } from '../engine/genome';

const DX = 60; // px per generation
const DY = 44; // px per row
const PAD = 22;
const R = 10;

export function LineageTree({
  nodes,
  currentId,
  onSelect,
}: {
  nodes: LineageNodes;
  currentId: string;
  onSelect: (id: string) => void;
}) {
  const root = rootId(nodes);
  const layout = useMemo(() => (root ? layoutTree(nodes, root) : null), [nodes, root]);
  if (!layout || !root) return null;

  const width = PAD * 2 + layout.cols * DX;
  const height = PAD * 2 + (layout.rows - 1) * DY;
  const ids = Object.keys(nodes);
  const px = (id: string) => PAD + layout.pos[id].x * DX;
  const py = (id: string) => PAD + layout.pos[id].y * DY;

  return (
    <svg className="lineage-svg" width={width} height={height} role="tree">
      {ids.map((id) => {
        const n = nodes[id];
        if (n.parentId == null) return null;
        return (
          <line key={`e${id}`} className="lineage-edge" x1={px(n.parentId)} y1={py(n.parentId)} x2={px(id)} y2={py(id)} />
        );
      })}
      {ids.map((id) => {
        const n = nodes[id];
        const current = id === currentId;
        return (
          <g
            key={id}
            className={`lineage-node${current ? ' current' : ''}`}
            transform={`translate(${px(id)},${py(id)})`}
            onClick={() => onSelect(id)}
            role="treeitem"
            aria-selected={current}
          >
            <title>{`gen ${n.generation} · ${hex(n.genome.seed)}`}</title>
            <circle r={R} fill={hsl(n.genome.palette)} stroke={current ? 'var(--accent)' : '#0c0e13'} strokeWidth={current ? 3 : 2} />
            <text className="lineage-label" y={R + 12}>
              {n.generation}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function hsl(p: Palette): string {
  return `hsl(${Math.round(p.hueA * 360)} ${Math.round(p.sat * 100)}% ${Math.round(p.light * 100)}%)`;
}
function hex(n: number): string {
  return '0x' + (n >>> 0).toString(16).padStart(8, '0');
}
