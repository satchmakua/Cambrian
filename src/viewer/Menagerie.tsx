/**
 * The Menagerie (MORPHOLOGY §11.4) — a browsable MAP-Elites archive over morphospace.
 *
 * A GRID×GRID map: x = limb count, y = elongation. Each occupied cell is the most-coherent
 * specimen discovered in that region, drawn as a swatch in its own palette (lightweight SVG,
 * not more WebGL canvases — same call as the lineage tree). Click a cell to pull that
 * creature back as a fresh parent. The grid fills with divergent forms as you play.
 */
import { MENAGERIE_GRID, type Menagerie } from './archive';
import type { Palette } from '../engine/genome';

const CELL = 24;
const PAD_L = 18;
const PAD_B = 18;
const PAD = 6;

export function Menagerie({
  entries,
  currentKey,
  onLoad,
}: {
  entries: Menagerie;
  currentKey?: string;
  onLoad: (key: string) => void;
}) {
  const G = MENAGERIE_GRID;
  const width = PAD_L + G * CELL + PAD;
  const height = PAD + G * CELL + PAD_B;

  const cells = [];
  for (let by = 0; by < G; by++) {
    for (let bx = 0; bx < G; bx++) {
      const key = `${bx}:${by}`;
      const e = entries[key];
      const x = PAD_L + bx * CELL;
      const y = PAD + (G - 1 - by) * CELL; // elongation increases upward
      const isCurrent = key === currentKey;
      cells.push(
        <g
          key={key}
          className={`men-cell${e ? ' filled' : ''}${isCurrent ? ' current' : ''}`}
          onClick={e ? () => onLoad(key) : undefined}
        >
          {e && <title>{`${e.nearest} · ${Math.round(e.score * 100)}%`}</title>}
          <rect
            x={x + 1}
            y={y + 1}
            width={CELL - 2}
            height={CELL - 2}
            rx={4}
            fill={e ? hsl(e.genome.palette) : 'transparent'}
            stroke={isCurrent ? 'var(--accent)' : e ? '#0c0e13' : '#222632'}
            strokeWidth={isCurrent ? 2.5 : 1}
          />
        </g>,
      );
    }
  }

  return (
    <svg className="men-svg" width={width} height={height} role="grid" aria-label="Menagerie morphospace">
      {cells}
      <text className="men-axis" x={PAD_L + (G * CELL) / 2} y={height - 4} textAnchor="middle">
        limbs →
      </text>
      <text className="men-axis" x={10} y={PAD + (G * CELL) / 2} textAnchor="middle" transform={`rotate(-90 10 ${PAD + (G * CELL) / 2})`}>
        elongation →
      </text>
    </svg>
  );
}

function hsl(p: Palette): string {
  return `hsl(${Math.round(p.hueA * 360)} ${Math.round(p.sat * 100)}% ${Math.round(p.light * 100)}%)`;
}
