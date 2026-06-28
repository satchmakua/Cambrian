import { useMemo } from 'react';
import { grow } from '../engine/grow';
import { CreatureViewer } from '../viewer/CreatureViewer';
import { OffspringGallery } from '../viewer/OffspringGallery';
import { PressurePanel } from '../viewer/PressurePanel';
import { ShareBar } from '../viewer/ShareBar';
import { LineageTree } from '../viewer/LineageTree';
import { useStore } from './store';

export function App() {
  const nodes = useStore((s) => s.nodes);
  const currentId = useStore((s) => s.currentId);
  const offspring = useStore((s) => s.offspring);
  const symmetryMode = useStore((s) => s.symmetryMode);
  const pressure = useStore((s) => s.pressure);
  const newCreature = useStore((s) => s.newCreature);
  const promote = useStore((s) => s.promote);
  const selectNode = useStore((s) => s.selectNode);
  const reroll = useStore((s) => s.reroll);
  const importString = useStore((s) => s.importString);
  const setSymmetryMode = useStore((s) => s.setSymmetryMode);
  const setPressure = useStore((s) => s.setPressure);
  const runDirected = useStore((s) => s.runDirected);

  const current = nodes[currentId];
  const genome = current.genome;
  const generation = current.generation;
  const phenotype = useMemo(() => grow(genome), [genome]);

  return (
    <div className="app">
      <div className="top">
        <main className="stage-wrap">
          <CreatureViewer phenotype={phenotype} />
          <header className="hud">
            <h1>Cambrian</h1>
            <p className="tag">grow · mutate · select — M3 lineage + sharing</p>
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
            <div className="modes">
              <span>symmetry</span>
              {(['auto', 'bilateral', 'radial'] as const).map((m) => (
                <button
                  key={m}
                  className={symmetryMode === m ? 'active' : ''}
                  onClick={() => setSymmetryMode(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </header>
        </main>

        <aside className="gallery">
          <OffspringGallery offspring={offspring} generation={generation} onPick={promote} onReroll={reroll} />
          <PressurePanel pressure={pressure} onChange={setPressure} onRun={runDirected} />
          <ShareBar genome={genome} onImport={importString} />
        </aside>
      </div>

      <section className="lineage">
        <div className="lineage-head">Lineage — click a creature to revisit or branch a new line</div>
        <div className="lineage-scroll">
          <LineageTree nodes={nodes} currentId={currentId} onSelect={selectNode} />
        </div>
      </section>
    </div>
  );
}

function hex(n: number): string {
  return '0x' + (n >>> 0).toString(16).padStart(8, '0');
}
