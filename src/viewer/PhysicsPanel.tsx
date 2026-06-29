/**
 * Locomotion evolution (ROADMAP M6, stretch): evolve the current creature toward *moving*.
 * Each generation drops a litter into a lazy-loaded Rapier physics sim, drives their muscles,
 * and keeps whoever travels farthest — so a wiggling blob becomes a crawler. The path lands in
 * the lineage; the distance of the best walker is shown. The physics WASM only loads on first Run.
 */
import { useState } from 'react';

export function PhysicsPanel({
  running,
  distance,
  onRun,
}: {
  running: boolean;
  distance: number | null;
  onRun: (generations: number) => Promise<void>;
}) {
  const [gens, setGens] = useState(12);

  return (
    <div className="pressures physics">
      <div className="pressures-head">Evolve locomotion (physics)</div>
      <div className="physics-row">
        <label>
          gens
          <input
            type="number"
            min={1}
            max={40}
            value={gens}
            onChange={(e) => setGens(Math.max(1, Math.min(40, parseInt(e.target.value, 10) || 1)))}
            disabled={running}
          />
        </label>
        <button onClick={() => onRun(gens)} disabled={running}>
          {running ? 'Simulating…' : 'Evolve to walk ▶'}
        </button>
      </div>
      {distance != null && !running && (
        <div className="physics-result">best walker travelled {distance.toFixed(2)} bu</div>
      )}
    </div>
  );
}
