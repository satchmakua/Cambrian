/**
 * The tree of life — every species the world has known, as branches through time.
 *
 * Time runs left to right from the world's first day to now. Each species is a horizontal line from
 * the moment it was founded (released, or branched off its parent when a mutant drifted far enough
 * in morphospace) to now — or to a † where it went extinct; a branch joins its parent's line where it
 * split off. Rows are laid out depth-first so a lineage stays together. Click a living branch to fly
 * the camera to one of its members.
 */
import { useMemo } from 'react';
import type { TreeNode } from './worldStore';

const ROW = 15;
const LEFT = 6;
const LABEL = 118;

function hueCss(h: number, l = 58): string {
  return `hsl(${Math.round(h * 360)} 62% ${l}%)`;
}

export function TreeOfLife({ tree, now, onPick, onClose }: { tree: TreeNode[]; now: number; onPick: (speciesId: number) => void; onClose: () => void }) {
  const W = 560;
  const layout = useMemo(() => {
    // depth-first order: founders (no parent, or a parent the tree no longer knows) by founding time,
    // each followed by its descendants
    const kids = new Map<number | null, TreeNode[]>();
    const ids = new Set(tree.map((n) => n.id));
    for (const n of tree) {
      const p = n.parent !== null && ids.has(n.parent) ? n.parent : null;
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p)!.push(n);
    }
    for (const list of kids.values()) list.sort((a, b) => a.born - b.born || a.id - b.id);
    const order: { n: TreeNode; depth: number }[] = [];
    const walk = (p: number | null, depth: number) => {
      for (const n of kids.get(p) ?? []) {
        order.push({ n, depth });
        walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
    const row = new Map<number, number>();
    order.forEach((o, i) => row.set(o.n.id, i));
    return { order, row };
  }, [tree]);
  const span = Math.max(now, 1);
  const x = (t: number) => LEFT + (Math.max(0, t) / span) * (W - LEFT - LABEL);
  const H = layout.order.length * ROW + 26;
  const days = Math.floor(now / 240);
  const dayStep = Math.max(1, Math.ceil(days / 8));
  return (
    <section className="tree-of-life">
      <div className="tol-head">
        <h3>Tree of life <span>{layout.order.length} species · {tree.filter((n) => n.extinctAt !== null).length} extinct</span></h3>
        <button onClick={onClose} title="close">✕</button>
      </div>
      <div className="tol-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
          {/* day ticks */}
          {Array.from({ length: Math.floor(days / dayStep) + 1 }, (_, i) => i * dayStep).map((d) => (
            <g key={d}>
              <line x1={x(d * 240)} x2={x(d * 240)} y1={0} y2={H - 16} className="tol-tick" />
              <text x={x(d * 240) + 2} y={H - 4} className="tol-day">D{d + 1}</text>
            </g>
          ))}
          {layout.order.map(({ n }) => {
            const r = layout.row.get(n.id)!;
            const y = r * ROW + 10;
            const end = n.extinctAt ?? now;
            const color = hueCss(n.hue, n.extinctAt !== null ? 38 : 60);
            const pr = n.parent !== null ? layout.row.get(n.parent) : undefined;
            return (
              <g key={n.id} className={n.extinctAt !== null ? 'tol-extinct' : 'tol-live'} onClick={() => n.alive > 0 && onPick(n.id)}>
                {pr !== undefined && <line x1={x(n.born)} x2={x(n.born)} y1={pr * ROW + 10} y2={y} stroke={color} strokeWidth={1.2} strokeDasharray="2 2" />}
                <line x1={x(n.born)} x2={x(end)} y1={y} y2={y} stroke={color} strokeWidth={n.alive > 0 ? 2 + Math.min(4, Math.sqrt(n.alive) * 0.7) : 1.5} strokeLinecap="round" />
                <circle cx={x(n.born)} cy={y} r={2.6} fill={color} />
                {n.extinctAt !== null && <text x={x(end) + 3} y={y + 3.5} className="tol-dagger">†</text>}
                <text x={W - LABEL + 8} y={y + 3.5} className="tol-label" fill={color}>
                  {n.name} {n.alive > 0 ? `· ${n.alive}` : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
