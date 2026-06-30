/**
 * Directed-evolution controls (DESIGN §7, M4): set a target with the sliders, choose a
 * number of generations, and Run — the engine fast-forwards toward the target and the
 * result (plus its path) lands in the lineage. 0 on a slider = "don't care".
 */
import { useState } from 'react';
import type { Pressure } from '../engine/pressures';
import type { CoveringType } from '../engine/genome';

// only the numeric [-1,1] axes render as sliders (coveringTarget is a separate categorical control)
type NumAxis = Exclude<keyof Pressure, 'coveringTarget'>;
const AXES: { key: NumAxis; label: string; lo: string; hi: string }[] = [
  { key: 'size', label: 'Size', lo: 'small', hi: 'big' },
  { key: 'limbCount', label: 'Limbs', lo: 'fewer', hi: 'more' },
  { key: 'bodyLength', label: 'Body', lo: 'stubby', hi: 'long' },
  { key: 'neck', label: 'Neck', lo: 'short', hi: 'long' },
  { key: 'wings', label: 'Wings', lo: 'none', hi: 'winged' },
  { key: 'aquatic', label: 'Locomotion', lo: 'legs', hi: 'fins' },
  { key: 'predator', label: 'Demeanor', lo: 'prey', hi: 'predator' },
  { key: 'novelty', label: 'Novelty', lo: 'familiar', hi: 'weird' },
];

const COVERINGS: CoveringType[] = ['skin', 'scales', 'fur', 'feathers', 'chitin', 'slime', 'plates'];

export function PressurePanel({
  pressure,
  onChange,
  onRun,
  coherence,
  onCoherence,
}: {
  pressure: Pressure;
  onChange: (patch: Partial<Pressure>) => void;
  onRun: (generations: number) => void;
  coherence: number;
  onCoherence: (coherence: number) => void;
}) {
  const [gens, setGens] = useState(30);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    // let "Running…" paint before the synchronous fast-forward
    setTimeout(() => {
      onRun(gens);
      setRunning(false);
    }, 16);
  };

  return (
    <div className="pressures">
      <div className="pressures-head">Directed evolution</div>
      {/* live structural-coherence dial (M24): 1 = a clean canonical body plan, 0 = let it wander */}
      <label className="axis coherence-steer">
        <span className="axis-label">
          Coherence<em>{coherence.toFixed(2)}</em>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={coherence}
          onChange={(e) => onCoherence(parseFloat(e.target.value))}
        />
        <span className="axis-ends">
          <i>wild</i>
          <i>canonical</i>
        </span>
      </label>
      {AXES.map((a) => {
        const v = pressure[a.key];
        return (
          <label key={a.key} className="axis">
            <span className="axis-label">
              {a.label}
              {v !== 0 && (
                <em>
                  {v > 0 ? '+' : ''}
                  {v.toFixed(1)}
                </em>
              )}
            </span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.1}
              value={v}
              onChange={(e) => onChange({ [a.key]: parseFloat(e.target.value) } as Partial<Pressure>)}
            />
            <span className="axis-ends">
              <i>{a.lo}</i>
              <i>{a.hi}</i>
            </span>
          </label>
        );
      })}
      <label className="axis covering-steer">
        <span className="axis-label">Skin{pressure.coveringTarget && <em>{pressure.coveringTarget}</em>}</span>
        <select
          value={pressure.coveringTarget ?? ''}
          onChange={(e) => onChange({ coveringTarget: (e.target.value || null) as CoveringType | null })}
        >
          <option value="">any</option>
          {COVERINGS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <div className="pressures-run">
        <label>
          gens
          <input
            type="number"
            min={1}
            max={120}
            value={gens}
            onChange={(e) => setGens(Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 1)))}
          />
        </label>
        <button onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run ▶'}
        </button>
      </div>
    </div>
  );
}
