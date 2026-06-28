import { useMemo } from 'react';
import { grow } from '../engine/grow';
import { CreatureViewer } from '../viewer/CreatureViewer';
import { useStore } from './store';

export function App() {
  const genome = useStore((s) => s.genome);
  const reseed = useStore((s) => s.reseed);
  const phenotype = useMemo(() => grow(genome), [genome]);

  return (
    <div className="app">
      <CreatureViewer phenotype={phenotype} />
      <header className="hud">
        <h1>Cambrian</h1>
        <p className="tag">grow · mutate · select — M0 walking skeleton</p>
        <dl className="stats">
          <div>
            <dt>seed</dt>
            <dd>{hex(genome.seed)}</dd>
          </div>
          <div>
            <dt>nodes</dt>
            <dd>{phenotype.nodes.length}</dd>
          </div>
          <div>
            <dt>edges</dt>
            <dd>{phenotype.edges.length}</dd>
          </div>
        </dl>
        <button onClick={reseed}>Re-roll jitter</button>
      </header>
    </div>
  );
}

function hex(n: number): string {
  return '0x' + (n >>> 0).toString(16).padStart(8, '0');
}
