/**
 * The main menu — the game's front door.
 *
 * A creature turns on the stage behind it: the one being bred in the game the browser holds (what
 * Continue returns to), or, while a new game is being set up, the founder it would start from.
 *
 *   Continue      back into the game in progress, on the screen it was left on
 *   New game      set-up: a name, the first creature, the valley
 *   Load game     the save slots (and importing a save file)
 *   Settings      graphics, sound, game
 *   Controls      what the mouse and the keys do
 *   Quit          keeps the game and closes the window where a page may; else says it is safe to
 *
 * The buttons work before the stage does, and whatever it does: the stage's code (the 3D library, the
 * creature renderer) is fetched after the menu is up, it is not mounted at all where the browser
 * draws without a graphics card or the page was opened in safe mode (?safe=1) — the dark panel is
 * the menu then — and it holds still under every panel that does not show a creature on it.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { Genome } from '../../engine/genome';
import { grow } from '../../engine/grow';
import { coherence } from '../../engine/morphospace';
import { PartBoundary, fetching } from '../ScreenBoundary';
import { continueGame, quitGame, startNewGame } from '../game';
import { gpuInfo } from '../gpu';
import { SAFE, useSettings } from '../settings';
import { useStore } from '../store';
import { ControlsPanel, NewGamePanel, SavesPanel, SettingsPanel } from './panels';
import pkg from '../../../package.json';

type Screen = 'home' | 'new' | 'load' | 'settings' | 'controls' | 'bye';

const TITLES: Record<Exclude<Screen, 'home' | 'bye'>, string> = { new: 'New game', load: 'Load game', settings: 'Settings', controls: 'Controls' };

/** The menu's backdrop: one creature on the turntable — fetched once the menu is up. */
const Stage = lazy(fetching(() => import('./MenuStage')));

// Dev/headless: ?menu=1&forcestage=1 mounts the backdrop even where the browser draws in software, to
// see what the stage's own frame pacing makes of it.
const DEV_STAGE = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('forcestage') === '1';

/** Why the game lowered the graphics itself, as the menu says it. */
const LOWERED = { software: 'this browser is drawing without a graphics card', slow: 'the first frames were slow' } as const;

export function MainMenu() {
  const [screen, setScreen] = useState<Screen>(() => {
    // (dev: ?menu=1&screen=settings opens a sub-screen, for inspection captures)
    const q = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('screen') : null;
    return q === 'new' || q === 'load' || q === 'settings' || q === 'controls' || q === 'bye' ? q : 'home';
  });
  const hasGame = useStore((s) => s.hasGame);
  const game = useStore((s) => s.game);
  const current = useStore((s) => s.nodes[s.currentId]);
  const skinMode = useStore((s) => s.skinMode);
  const [preview, setPreview] = useState<Genome | null>(null);
  const notice = useSettings((s) => s.notice);
  const dismissNotice = useSettings((s) => s.dismissNotice);
  // (a stage drawn by the processor would hold the page for seconds a frame: the menu goes without)
  const backdrop = (!SAFE && !gpuInfo().software) || DEV_STAGE;
  const onPreview = useCallback((g: Genome) => setPreview(g), []);
  // the stage: the founder being chosen, else the creature of the game in progress
  const shown = screen === 'new' && preview ? preview : current.genome;
  // (what the game's creature is, for the Continue line — left unsaid if it cannot be worked out: the
  // menu must come up whatever that creature does. It is where a player lands when a screen has
  // failed, and the failure may be this very creature's)
  const kind = useMemo(() => {
    try {
      return coherence(grow(current.genome)).nearest;
    } catch {
      return '';
    }
  }, [current.genome]);

  // Esc backs out of a sub-screen
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && screen !== 'home') setScreen('home');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [screen]);

  if (screen === 'bye') {
    return (
      <div className="mainmenu bye">
        <div className="bye-card">
          <h1>Cambrian</h1>
          <p>Your game is saved in this browser.</p>
          <p className="muted">You can close this tab now.</p>
          <button className="plain" onClick={() => setScreen('home')}>Back to the menu</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`mainmenu${screen === 'home' ? '' : ' sub'}`}>
      <div className="mm-stage">
        {/* (a stage that cannot be fetched, grown or drawn is left dark; another creature — a founder
            being chosen, a game loaded — is tried afresh. It holds still under the panels that show
            no creature on it: they have the machine to themselves) */}
        {backdrop && (
          <PartBoundary resetKey={shown}>
            <Suspense fallback={null}>
              <Stage genome={shown} skinMode={skinMode} paused={screen !== 'home' && screen !== 'new'} />
            </Suspense>
          </PartBoundary>
        )}
      </div>
      <div className="mm-shade" />
      <div className={`mm-panel${screen === 'home' ? '' : ' wide'}`}>
        <header className="mm-title">
          <h1>Cambrian</h1>
          <p>Breed creatures. Release them. Watch what becomes of them.</p>
        </header>
        {screen === 'home' ? (
          <nav className="mm-list" aria-label="Main menu">
            {hasGame && (
              <button className="primary" autoFocus onClick={continueGame}>
                <b>Continue</b>
                <small>{game.name} · generation {current.generation} {kind}</small>
              </button>
            )}
            <button className={hasGame ? '' : 'primary'} autoFocus={!hasGame} onClick={() => setScreen('new')}><b>New game</b></button>
            <button onClick={() => setScreen('load')}><b>Load game</b></button>
            <button onClick={() => setScreen('settings')}><b>Settings</b></button>
            <button onClick={() => setScreen('controls')}><b>Controls</b></button>
            <button onClick={() => !quitGame() && setScreen('bye')}><b>Quit</b></button>
          </nav>
        ) : (
          <div className="mm-sub">
            <div className="mm-sub-head">
              <button className="plain back" onClick={() => setScreen('home')}>← Back</button>
              <h2>{TITLES[screen]}</h2>
            </div>
            <div className="mm-sub-body">
              {screen === 'new' && <NewGamePanel onPreview={onPreview} onStart={startNewGame} />}
              {screen === 'load' && <SavesPanel mode="load" />}
              {screen === 'settings' && <SettingsPanel />}
              {screen === 'controls' && <ControlsPanel />}
            </div>
          </div>
        )}
        {/* (the game lowered the graphics itself: said once, under the buttons so none of them moves
            when it is dismissed) */}
        {screen === 'home' && !SAFE && notice.lowered && !notice.seen && (
          <div className="mm-notice" role="status">
            <span>Graphics were set to Low because {LOWERED[notice.lowered]}.</span>
            <button
              className="plain"
              onClick={() => {
                dismissNotice();
                setScreen('settings');
              }}
            >
              Settings
            </button>
            <button className="plain" onClick={dismissNotice}>OK</button>
          </div>
        )}
        <footer className="mm-foot">
          v{pkg.version} · your game is kept in this browser as you play ·{' '}
          {SAFE ? (
            <>
              safe mode: the lowest graphics and no backdrop, for this visit · <a href={location.pathname}>leave safe mode</a>
            </>
          ) : (
            <a href="?safe=1" title="opens the game with the lowest graphics and no 3D backdrop, for one visit">safe mode</a>
          )}
        </footer>
      </div>
    </div>
  );
}
