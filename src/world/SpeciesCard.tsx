/**
 * The species card: one species read from the world's records — how its body has changed since its
 * founder (in portraits, words and trait trends), where it lives, what it eats and what eats it, and
 * what its members die of, over time.
 */
import { useMemo } from 'react';
import { speciesProfile, type Relation, type SpeciesProfile } from '../sim/evolution';
import { dayNumber, type TrendSample } from '../sim/world';
import { usePortrait } from '../viewer/portrait';
import { getWorld } from './worldStore';

function hueCss(h: number, l = 58): string {
  return `hsl(${Math.round(h * 360)} 62% ${l}%)`;
}

const DIET: Record<string, string> = {
  herbivore: 'a grazer',
  omnivore: 'an omnivore',
  carnivore: 'a hunter',
  filter: 'a filter feeder',
  nectar: 'a nectar feeder',
};
const HOME: Record<string, string> = { land: 'on land', water: 'in the water', amphibious: 'in and out of the water' };

interface Row {
  key: keyof TrendSample;
  label: string;
  /** how a value is written */
  fmt: (v: number) => string;
  /** a share (0..1) drawn on a fixed 0..1 scale, not its own range */
  share?: boolean;
  title: string;
}
const ROWS: Row[] = [
  { key: 'n', label: 'number', fmt: (v) => String(Math.round(v)), title: 'how many were alive' },
  { key: 'mass', label: 'size', fmt: (v) => v.toFixed(2), title: 'average body mass' },
  { key: 'sprint', label: 'speed', fmt: (v) => v.toFixed(1), title: 'average sprint speed (bu/s)' },
  { key: 'vision', label: 'sight', fmt: (v) => v.toFixed(0), title: 'average sight radius (bu)' },
  { key: 'attack', label: 'bite', fmt: (v) => v.toFixed(1), title: 'average bite (damage a second)' },
  { key: 'armour', label: 'armour', fmt: (v) => `${Math.round(v * 100)}%`, share: true, title: 'average share of a bite shrugged off' },
  { key: 'drift', label: 'drift', fmt: (v) => v.toFixed(2), title: "how far its bodies have drifted from its founder's (a new species branches at 0.32)" },
  { key: 'hunters', label: 'hunters', fmt: (v) => `${Math.round(v * 100)}%`, share: true, title: 'the share of its members that hunt' },
  { key: 'coat', label: 'old coat', fmt: (v) => `${Math.round(v * 100)}%`, share: true, title: "the share still wearing its founder's coat" },
];

const SW = 132, SH = 22;

/** One trait over the species' life: a sparkline, and its first and latest values. */
function TrendRow({ row, trend, color }: { row: Row; trend: TrendSample[]; color: string }) {
  const vs = trend.map((x) => x[row.key] as number);
  const first = vs[0], last = vs[vs.length - 1];
  let lo = row.share ? 0 : Math.min(...vs), hi = row.share ? 1 : Math.max(...vs);
  // (a flat line sits in the middle, not on the floor)
  if (hi - lo < 1e-6) [lo, hi] = [lo - 1, hi + 1];
  const t0 = trend[0].t, t1 = trend[trend.length - 1].t;
  const d = vs
    .map((v, i) => {
      const x = trend.length > 1 ? ((trend[i].t - t0) / Math.max(1e-6, t1 - t0)) * SW : SW / 2;
      const y = SH - 2 - ((v - lo) / (hi - lo)) * (SH - 4);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join('');
  const change = !row.share && row.key !== 'drift' && first > 0 ? last / first - 1 : null;
  return (
    <div className="trend-row" title={row.title}>
      <span className="lbl">{row.label}</span>
      <svg viewBox={`0 0 ${SW} ${SH}`} width={SW} height={SH}>
        <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
      <span className="val">
        {row.fmt(last)}
        {change !== null && Math.abs(change) >= 0.05 && <i className={change > 0 ? 'up' : 'down'}>{change > 0 ? '▲' : '▼'}{Math.round(Math.abs(change) * 100)}%</i>}
      </span>
    </div>
  );
}

const CAUSES = [
  { key: 'starved', label: 'starved', color: '#d9a441' },
  { key: 'eaten', label: 'killed', color: '#d8584d' },
  { key: 'aged', label: 'old age', color: '#8f96a3' },
] as const;

/** Its dead, by cause: the totals, and each stretch between samples as a stacked bar. */
function Deaths({ p }: { p: SpeciesProfile }) {
  const total = p.causes.starvation + p.causes.predation + p.causes.oldAge;
  const counts = { starved: p.causes.starvation, eaten: p.causes.predation, aged: p.causes.oldAge };
  const bars = useMemo(() => {
    const t = p.trend;
    const out: { x: number; w: number; parts: number[] }[] = [];
    if (t.length < 2) return { out, max: 1 };
    const W = 260, step = W / (t.length - 1);
    let max = 1;
    for (let i = 1; i < t.length; i++) {
      const parts = CAUSES.map((c) => t[i][c.key] - t[i - 1][c.key]);
      max = Math.max(max, parts.reduce((a, b) => a + b, 0));
      out.push({ x: (i - 1) * step, w: Math.max(1, step - 1), parts });
    }
    return { out, max };
  }, [p.trend]);
  if (total === 0) return <p className="quiet">None of them has died yet.</p>;
  return (
    <div className="deaths">
      <div className="deaths-total">
        {CAUSES.map((c) => counts[c.key] > 0 && <i key={c.key} style={{ flex: counts[c.key], background: c.color }} title={`${counts[c.key]} ${c.label}`} />)}
      </div>
      <div className="deaths-key">
        {CAUSES.map((c) => (
          <span key={c.key}>
            <b style={{ background: c.color }} />
            {counts[c.key]} {c.label}
          </span>
        ))}
      </div>
      {bars.out.length > 1 && (
        <svg className="deaths-time" viewBox="0 0 260 34" width={260} height={34}>
          {bars.out.map((b, i) => {
            let y = 34;
            return (
              <g key={i}>
                {b.parts.map((n, k) => {
                  if (n <= 0) return null;
                  const h = (n / bars.max) * 32;
                  y -= h;
                  return <rect key={k} x={b.x} y={y} width={b.w} height={h} fill={CAUSES[k].color} />;
                })}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function Chips({ list, onPick }: { list: Relation[]; onPick: (id: number) => void }) {
  return (
    <>
      {list.map((r) => (
        <button key={r.id} className="chip" onClick={() => onPick(r.id)} title={`${r.count} killed`}>
          <b style={{ background: hueCss(r.hue) }} />
          {r.name} <span>×{r.count}</span>
        </button>
      ))}
    </>
  );
}

export function SpeciesCard({ id, at, onClose, onPick, onFollow }: { id: number; at: number; onClose: () => void; onPick: (id: number) => void; onFollow: (id: number) => void }) {
  // (read again on every snapshot of the world: `at` is its clock)
  const p = useMemo(() => speciesProfile(getWorld(), id), [id, at]);
  const changed = (p?.differs.length ?? 0) > 0;
  const now = usePortrait(p?.now, true);
  const founder = usePortrait(changed ? p?.founder : null, true);
  if (!p) return null;
  const color = hueCss(p.hue);
  const shown = ROWS.filter((r) => {
    // (a share that has never moved off where it started says nothing)
    if (!r.share || p.trend.length === 0) return true;
    const vs = p.trend.map((x) => x[r.key] as number);
    return Math.max(...vs) - Math.min(...vs) > 0.01;
  });
  return (
    <aside className="species-card">
      <div className="critter-head">
        <h3 style={{ borderColor: color }}>{p.name}</h3>
        <button onClick={onClose} title="close">✕</button>
      </div>
      <p className="doing">
        {p.extinctAt !== null ? <b className="gone">died out on day {dayNumber(p.extinctAt)}</b> : <b>{p.alive} alive</b>} · {p.born} born · founded day {dayNumber(p.founded)}
      </p>
      <div className="portraits">
        {changed && (
          <figure>
            {founder ? <img src={founder} alt="" /> : <div className="ph" />}
            <figcaption>its founder</figcaption>
          </figure>
        )}
        <figure>
          {now ? <img src={now} alt="" /> : <div className="ph" />}
          <figcaption>{changed ? 'now' : p.extinctAt !== null ? 'its last' : 'unchanged'}</figcaption>
        </figure>
      </div>
      {changed && <p>Since its founder: {p.differs.join(', ')}.</p>}
      {p.parent && (
        <p className="from">
          Branched off{' '}
          <button className="link" onClick={() => onPick(p.parent!.id)}>
            {p.parent.name}
          </button>
          .
        </p>
      )}
      {p.daughters.length > 0 && (
        <p className="from">
          Branches:{' '}
          {p.daughters.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ', '}
              <button className={`link${d.extinct ? ' gone' : ''}`} onClick={() => onPick(d.id)}>
                {d.name}
              </button>
            </span>
          ))}
        </p>
      )}

      <h4>Its life</h4>
      <p>
        {DIET[p.diet] ?? p.diet}, {p.flies ? 'flying, ' : ''}living {HOME[p.habitat]}
        {p.where.length > 0 && <> — {p.where.slice(0, 3).map((x) => `${x.biome} ${Math.round(x.share * 100)}%`).join(', ')}</>}.
      </p>
      {p.prey.length > 0 && (
        <div className="rel">
          <span className="lbl">has killed</span>
          <Chips list={p.prey} onPick={onPick} />
        </div>
      )}
      {p.predators.length > 0 && (
        <div className="rel">
          <span className="lbl">killed by</span>
          <Chips list={p.predators} onPick={onPick} />
        </div>
      )}

      <h4>Over time</h4>
      {p.trend.length < 2 ? (
        <p className="quiet">Its trends start a quarter day after it is founded.</p>
      ) : (
        <div className="trends">
          <div className="trend-span">
            day {dayNumber(p.trend[0].t)} → day {dayNumber(p.trend[p.trend.length - 1].t)}
          </div>
          {shown.map((r) => (
            <TrendRow key={r.key} row={r} trend={p.trend} color={r.key === 'n' ? color : '#cfd6e2'} />
          ))}
        </div>
      )}

      <h4>Deaths</h4>
      <Deaths p={p} />

      {p.alive > 0 && (
        <div className="critter-actions">
          <button onClick={() => onFollow(p.id)}>follow one</button>
        </div>
      )}
    </aside>
  );
}
