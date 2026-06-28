import { useMemo } from 'react';
import { grow } from '../engine/grow';
import { CreatureViewer } from '../viewer/CreatureViewer';
import { OffspringGallery } from '../viewer/OffspringGallery';
import { useStore } from './store';

export function App() {
  const genome = useStore((s) => s.genome);
  const generation = useStore((s) => s.generation);
  const offspring = useStore((s) => s.offspring);
  const newCreature = useStore((s) => s.newCreature);
  const promote = useStore((s) => s.promote);
  const reroll = useStore((s) => s.reroll);

  const phenotype = useMemo(() => grow(genome), [genome]);

  return (
    <div className="app">
      <main className="stage-wrap">
        <CreatureViewer phenotype={phenotype} />
        <header className="hud">
          <h1>Cambrian</h1>
          <p className="tag">grow · mutate · select — M2 breeder loop</p>
          <dl className="stats">
            <div>
              <dt>generation</dt>
              <dd>{generation}</dd>
            </div>
            <div>
              <dt>seed</dt>
              <dd>{hex(genome.seed)}</dd>
            </div>
            <div>
              <dt>nodes</dt>
              <dd>{phenotype.nodes.length}</dd>
            </div>
          </dl>
          <button onClick={newCreature}>New random creature</button>
        </header>
      </main>
      <OffspringGallery offspring={offspring} generation={generation} onPick={promote} onReroll={reroll} />
    </div>
  );
}

function hex(n: number): string {
  return '0x' + (n >>> 0).toString(16).padStart(8, '0');
}
