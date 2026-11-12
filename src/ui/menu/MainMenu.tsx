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
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Genome } from '../../engine/genome';
import { grow } from '../../engine/grow';
import { coherence } from '../../engine/morphospace';
import { CreatureViewer } from '../../viewer/CreatureViewer';
import { continueGame, quitGame, startNewGame } from '../game';
import { useStore } from '../store';
import { ControlsPanel, NewGamePanel, SavesPanel, SettingsPanel } from './panels';
import pkg from '../../../package.json';

type Screen = 'home' | 'new' | 'load' | 'settings' | 'controls' | 'bye';

const TITLES: Record<Exclude<Screen, 'home' | 'bye'>, string> = { new: 'New game', load: 'Load game', settings: 'Settings', controls: 'Controls' };

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
  const onPreview = useCallback((g: Genome) => setPreview(g), []);
  // the stage: the founder being chosen, else the creature of the game in progress
  const shown = screen === 'new' && preview ? preview : current.genome;
  const phenotype = useMemo(() => grow(shown), [shown]);
  const kind = useMemo(() => coherence(grow(current.genome)).nearest, [current.genome]);

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
        <CreatureViewer phenotype={phenotype} skinMode={skinMode} />
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
        <footer className="mm-foot">v{pkg.version} · your game is kept in this browser as you play</footer>
      </div>
    </div>
  );
}
