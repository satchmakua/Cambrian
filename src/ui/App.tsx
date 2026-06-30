import { useMemo } from 'react';
import { grow } from '../engine/grow';
import { coherence, describe } from '../engine/morphospace';
import { CreatureViewer } from '../viewer/CreatureViewer';
import { OffspringGallery } from '../viewer/OffspringGallery';
import { PressurePanel } from '../viewer/PressurePanel';
import { PhysicsPanel } from '../viewer/PhysicsPanel';
import { ShareBar } from '../viewer/ShareBar';
import { LineageTree } from '../viewer/LineageTree';
import { Menagerie } from '../viewer/Menagerie';
import { binKey, MENAGERIE_GRID } from '../viewer/archive';
import { downloadCreatureGlb } from '../viewer/exportGltf';
import { MORPHOTYPE_IDS } from '../engine/random';
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
  const setCoherence = useStore((s) => s.setCoherence);
  const runDirected = useStore((s) => s.runDirected);
  const menagerie = useStore((s) => s.menagerie);
  const loadCell = useStore((s) => s.loadCell);
  const skinMode = useStore((s) => s.skinMode);
  const setSkinMode = useStore((s) => s.setSkinMode);
  const morphoFilter = useStore((s) => s.morphoFilter);
  const setMorphoFilter = useStore((s) => s.setMorphoFilter);
  const physicsRunning = useStore((s) => s.physicsRunning);
  const physicsDistance = useStore((s) => s.physicsDistance);
  const runPhysics = useStore((s) => s.runPhysics);
  const playback = useStore((s) => s.playback);
  const playbackOn = useStore((s) => s.playbackOn);
  const togglePlayback = useStore((s) => s.togglePlayback);

  const current = nodes[currentId];
  const genome = current.genome;
  const generation = current.generation;
  const phenotype = useMemo(() => grow(genome), [genome]);
  const vibe = useMemo(() => coherence(phenotype), [phenotype]);
  const currentCell = useMemo(() => binKey(describe(phenotype)), [phenotype]);
  const menagerieCount = Object.keys(menagerie).length;
  // play the recorded gait only while it belongs to the creature on screen
  const activeGait = playbackOn && playback && playback.seed === genome.seed ? playback : null;

  return (
    <div className="app">
      <div className="top">
        <main className="stage-wrap">
          <CreatureViewer phenotype={phenotype} skinMode={skinMode} trajectory={activeGait} />
          <header className="hud">
            <h1>Cambrian</h1>
            <p className="tag">
              {vibe.score > 0.55 ? '≈ ' : '~ valley near '}
              {vibe.nearest} · {Math.round(vibe.score * 100)}%
            </p>
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
            <div className="roll-row">
              <button onClick={newCreature}>New random creature</button>
              <select
                className="morpho-filter"
                value={morphoFilter ?? ''}
                onChange={(e) => setMorphoFilter(e.target.value || null)}
                title="Bias new rolls to one morphotype"
              >
                <option value="">any kind</option>
                {MORPHOTYPE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
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
            <div className="modes">
              <span>skin</span>
              {(['capsules', 'smooth', 'hybrid'] as const).map((m) => (
                <button key={m} className={skinMode === m ? 'active' : ''} onClick={() => setSkinMode(m)}>
                  {m}
                </button>
              ))}
            </div>
          </header>
        </main>

        <aside className="gallery">
          <OffspringGallery offspring={offspring} generation={generation} onPick={promote} onReroll={reroll} />
          <PressurePanel
            pressure={pressure}
            onChange={setPressure}
            onRun={runDirected}
            coherence={genome.coherence ?? 1}
            onCoherence={setCoherence}
          />
          <PhysicsPanel
            running={physicsRunning}
            distance={physicsDistance}
            onRun={runPhysics}
            canReplay={!!(playback && playback.seed === genome.seed)}
            replaying={!!activeGait}
            onToggleReplay={togglePlayback}
          />
          <ShareBar
          genome={genome}
          onImport={importString}
          onExport={() => downloadCreatureGlb(phenotype, skinMode !== 'capsules', `cambrian-${hex(genome.seed)}.glb`)}
        />
        </aside>
      </div>

      <section className="bottom">
        <div className="lineage">
          <div className="lineage-head">Lineage — click a creature to revisit or branch a new line</div>
          <div className="lineage-scroll">
            <LineageTree nodes={nodes} currentId={currentId} onSelect={selectNode} />
          </div>
        </div>
        <div className="menagerie">
          <div className="lineage-head">
            Menagerie — {menagerieCount} / {MENAGERIE_GRID * MENAGERIE_GRID}
          </div>
          <div className="menagerie-scroll">
            <Menagerie entries={menagerie} currentKey={currentCell} onLoad={loadCell} />
          </div>
        </div>
      </section>
    </div>
  );
}

function hex(n: number): string {
  return '0x' + (n >>> 0).toString(16).padStart(8, '0');
}
