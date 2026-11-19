/**
 * The game's screens — the breeder, and (each fetched when first opened) the Studio and the valley —
 * with the in-game menu over them.
 *
 * They live apart from the app's root so the main menu can come up without them: this file brings
 * the 3D library and the creature renderer with it, and is fetched when a game is entered.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
// The valley and the Studio are loaded when they are first opened: neither is needed to draw the
// breeder.
// (a fetch that fails is tried once more; one that keeps failing is shown by the screen boundary)
const WorldView = lazy(fetching(() => import('../world/WorldView').then((m) => ({ default: m.WorldView }))));
const Studio = lazy(fetching(() => import('../viewer/Studio').then((m) => ({ default: m.Studio }))));
import { useStore, type GameView } from './store';
import { useWorldUi } from '../world/worldStore';
import { fetching } from './ScreenBoundary';
import { noGpu, settleGraphics, slowGpuHint } from './gpu';
import { typingIn } from './keys';
import { PauseMenu } from './menu/PauseMenu';
import { LoweredNotice, VALLEY_SLOW, useSlowMachine } from './menu/panels';
import { HARNESS } from './settings';
import { LoadingGate } from './LoadingGate';
import { NO_REPORTS, foundSlow, gateSteps, type GateReports } from './gate';
import type { StageStatus } from '../viewer/pace';

// Before any of these screens mounts a canvas: a browser drawing without a graphics card starts at
// the Low quality. (Here — run once, when this code arrives — and not at the page's start: see gpu.ts.)
settleGraphics();

// Dev/headless: ?bare=1 renders just the creature full-bleed (no UI chrome) for clean face shots.
const BARE = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('bare') === '1';

/** Each screen is shown from behind a loading screen, once it is ready to play (a capture harness's
 *  page goes without: it shoots the screen as it comes). */
const GATED = !BARE && !HARNESS;
/** how long a screen must have been ready, without a break, before the loading screen lifts (ms): a
 *  canvas can draw a first frame whole before what it shows has arrived in it */
const READY_HOLD_MS = 300;
/** …and where the drawing was found slow on built-in graphics, long enough to read the line saying
 *  what draws it (ms) */
const HINT_HOLD_MS = 4000;

/** The game being played: whichever of its screens is up. */
export function Game() {
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
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const worldEpoch = useWorldUi((s) => s.epoch);
  const adopt = useStore((s) => s.adopt);

  const current = nodes[currentId];
  const genome = current.genome;
  const generation = current.generation;
  const phenotype = useMemo(() => grow(genome), [genome]);
  // every hook runs before the screen-switching returns below (rules of hooks)
  const vibe = useMemo(() => coherence(phenotype), [phenotype]);
  const currentCell = useMemo(() => binKey(describe(phenotype)), [phenotype]);

  // the in-game menu: Esc (or a screen's ☰) opens it over whichever screen is up
  // (dev: ?pause=1 opens it, for inspection captures)
  const [paused, setPaused] = useState(() => import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('pause') === '1');
  const [menuAt, setMenuAt] = useState<'home' | 'settings'>('home'); // the screen the menu opens on
  const openMenu = useCallback(() => {
    setMenuAt('home');
    setPaused(true);
  }, []);
  const openSettings = useCallback(() => {
    setMenuAt('settings');
    setPaused(true);
  }, []);
  const closeMenu = useCallback(() => setPaused(false), []);
  const slowMachine = useSlowMachine();
  // Where the browser draws without a graphics card every first frame holds the page for seconds:
  // the creature is drawn first, and the litter only after it — a click gets in between the two.
  // (and not under the open menu, which should have the machine to itself)
  const [litterOn, setLitterOn] = useState(() => !noGpu());
  const [heroShown, setHeroShown] = useState(false);
  const onHeroShown = useCallback(() => setHeroShown(true), []);
  useEffect(() => {
    if (litterOn || !heroShown || paused) return;
    const t = setTimeout(() => setLitterOn(true), 300);
    return () => clearTimeout(t);
  }, [litterOn, heroShown, paused]);
  // (the screens read this to stop drawing while the menu is over them — and it is taken down with
  // the game's screens when the player leaves for the main menu, whose own stage reads it too)
  const setMenuOpen = useStore((s) => s.setMenuOpen);
  useEffect(() => {
    setMenuOpen(paused);
    return () => setMenuOpen(false);
  }, [paused, setMenuOpen]);

  // The loading screen (gate.ts, LoadingGate): a screen is mounted behind it and let in only once it is
  // ready to play — its shaders built, its first frames drawn whole and measured (and the graphics
  // lowered and measured again, where they were slow). What the screens report is kept for the screen
  // being opened (a screen changed to, or a valley loaded, starts with nothing reported), and only
  // until it is let in: after that a pick's new shaders are the stage's own business.
  const gameView: GameView = view === 'menu' ? 'breed' : view;
  const gateKey = gameView === 'world' ? `world:${worldEpoch}` : gameView;
  const [reports, setReports] = useState<GateReports>(NO_REPORTS);
  const [reportsFor, setReportsFor] = useState(gateKey);
  if (reportsFor !== gateKey) {
    setReportsFor(gateKey);
    setReports(NO_REPORTS);
  }
  const [entered, setEntered] = useState<string | null>(null);
  const gated = GATED && entered !== gateKey;
  const { steps, ready } = gateSteps(gameView, reports);
  const hint = foundSlow(reports) ? slowGpuHint() : null;
  useEffect(() => {
    if (!gated || !ready) return;
    const t = setTimeout(() => setEntered(gateKey), hint ? HINT_HOLD_MS : READY_HOLD_MS);
    return () => clearTimeout(t);
  }, [gated, ready, gateKey, hint]);
  const listening = useRef(gated);
  listening.current = gated;
  const onHeroStatus = useCallback((hero: StageStatus) => listening.current && setReports((r) => ({ ...r, hero })), []);
  const onLitter = useCallback((drawn: number, total: number) => listening.current && setReports((r) => (r.litter.drawn === drawn && r.litter.total === total ? r : { ...r, litter: { drawn, total } })), []);
  const onWorldStatus = useCallback((world: StageStatus) => listening.current && setReports((r) => ({ ...r, world })), []);
  const onStudioStatus = useCallback((studio: StageStatus) => listening.current && setReports((r) => ({ ...r, studio })), []);
  // (nothing behind it can be clicked, focused or pressed with a key while it is up)
  const behind = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (behind.current) behind.current.inert = gated;
  }, [gated]);
  const gate = GATED ? (
    <LoadingGate
      key={gateKey}
      screen={gameView}
      steps={steps}
      open={!gated}
      hint={hint}
      onMenu={() => setView('menu')}
      onEnter={() => setEntered(gateKey)}
    />
  ) : null;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // (the open menu handles its own Esc; a key held down opens it once, not on every repeat; and the
      // loading screen has no menu behind it)
      if (e.key !== 'Escape' || e.repeat || paused || gated || typingIn(e.target)) return;
      openMenu();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [paused, gated, openMenu]);
  const pause = paused ? <PauseMenu onClose={closeMenu} start={menuAt} /> : null;

  if (BARE) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0f1116' }}>
        <CreatureViewer phenotype={phenotype} skinMode={skinMode} />
      </div>
    );
  }
  const screen = (s: JSX.Element) => (
    <>
      <div ref={behind} className="screen-behind">
        {s}
      </div>
      {pause}
      {gate}
    </>
  );
  if (view === 'world') {
    return screen(
      <Suspense fallback={<ScreenLoading />}>
        <WorldView
          key={worldEpoch}
          founder={genome}
          onExit={() => setView('breed')}
          onMenu={openMenu}
          onAdopt={(g) => {
            adopt(g);
            setView('breed');
          }}
          onStatus={onWorldStatus}
        />
      </Suspense>,
    );
  }
  if (view === 'studio') {
    return screen(
      <Suspense fallback={<ScreenLoading />}>
        <Studio genome={genome} skinMode={skinMode} onSkinMode={setSkinMode} onAdopt={adopt} onExit={() => setView('breed')} onMenu={openMenu} onStatus={onStudioStatus} />
      </Suspense>,
    );
  }
  const menagerieCount = Object.keys(menagerie).length;
  // play the recorded gait only while it belongs to the creature on screen
  const activeGait = playbackOn && playback && playback.seed === genome.seed ? playback : null;

  return screen(
    <div className="app">
      <div className="top">
        <main className="stage-wrap">
          <CreatureViewer phenotype={phenotype} skinMode={skinMode} trajectory={activeGait} onShown={onHeroShown} onStatus={onHeroStatus} />
          <header className="hud">
            <div className="title-row">
              <h1>Cambrian</h1>
              <nav className="view-tabs">
                <button className="active">Breed</button>
                <button onClick={() => setView('studio')} title="inspect this creature from every angle">Studio</button>
                <button onClick={() => setView('world')} title={slowMachine ? VALLEY_SLOW : 'release creatures into a living ecosystem'}>
                  World{slowMachine && <small> · slow here</small>}
                </button>
                <button className="menu-btn" onClick={openMenu} title="menu: save, load, settings, exit (Esc)" aria-label="Menu">☰</button>
              </nav>
            </div>
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
            {/* (the game lowered the graphics itself — perhaps a moment ago, on this very stage) */}
            <LoweredNotice onSettings={openSettings} />
          </header>
        </main>

        <aside className="gallery">
          {litterOn ? <OffspringGallery offspring={offspring} generation={generation} onPick={promote} onReroll={reroll} onProgress={onLitter} /> : <p className="gallery-hint">Preparing the litter…</p>}
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
    </div>,
  );
}

/** Shown for the moment a screen's code is fetched, the first time it is opened (behind the loading
 *  screen, where there is one). */
function ScreenLoading() {
  return <div className="screen-loading">Loading…</div>;
}

function hex(n: number): string {
  return '0x' + (n >>> 0).toString(16).padStart(8, '0');
}
