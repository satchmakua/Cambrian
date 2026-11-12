/**
 * The in-game menu (Esc, or the ☰ button on any screen): the game waits behind it.
 *
 *   Resume · Save game · Load game · Settings · Controls · Exit to main menu
 *
 * In the valley, time stops while the menu is open and picks up as it was when it closes.
 */
import { useEffect, useRef, useState } from 'react';
import { useWorldUi } from '../../world/worldStore';
import { exitToMenu } from '../game';
import { useStore } from '../store';
import { ControlsPanel, SavesPanel, SettingsPanel } from './panels';

type Screen = 'home' | 'save' | 'load' | 'settings' | 'controls';
const TITLES: Record<Exclude<Screen, 'home'>, string> = { save: 'Save game', load: 'Load game', settings: 'Settings', controls: 'Controls' };

export function PauseMenu({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>(() => {
    const q = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('screen') : null;
    return q === 'save' || q === 'load' || q === 'settings' || q === 'controls' ? q : 'home';
  });
  const game = useStore((s) => s.game);
  const view = useStore((s) => s.view);
  const unkept = useStore((s) => s.unkept);

  // the valley's clock stops while the menu is up
  const wasRunning = useRef(false);
  useEffect(() => {
    if (view !== 'world') return;
    wasRunning.current = useWorldUi.getState().running;
    useWorldUi.getState().setRunning(false);
    return () => {
      if (wasRunning.current) useWorldUi.getState().setRunning(true);
    };
  }, [view]);

  // Esc: back out of a sub-screen, else close (capture phase, so the game under the menu never sees it)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      if (e.repeat) return; // (held down: once is enough — a repeat would shut the menu it just backed out to)
      if (screen !== 'home') setScreen('home');
      else onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [screen, onClose]);

  return (
    <div className="pause" role="dialog" aria-modal="true" aria-label="Game menu" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`pause-card${screen === 'home' ? '' : ' wide'}`}>
        {screen === 'home' ? (
          <>
            <header>
              <h2>Paused</h2>
              <p>{game.name}</p>
              {unkept && (
                <p className="mm-warn" role="status">
                  The browser has run out of room to keep this game by itself. Save it to a slot (or export it) so nothing bred since is lost.
                </p>
              )}
            </header>
            <nav className="mm-list" aria-label="Game menu">
              <button className="primary" autoFocus onClick={onClose}><b>Resume</b></button>
              <button onClick={() => setScreen('save')}><b>Save game</b></button>
              <button onClick={() => setScreen('load')}><b>Load game</b></button>
              <button onClick={() => setScreen('settings')}><b>Settings</b></button>
              <button onClick={() => setScreen('controls')}><b>Controls</b></button>
              <button
                onClick={() => {
                  onClose();
                  exitToMenu();
                }}
              >
                <b>Exit to main menu</b>
              </button>
            </nav>
          </>
        ) : (
          <div className="mm-sub">
            <div className="mm-sub-head">
              <button className="plain back" onClick={() => setScreen('home')}>← Back</button>
              <h2>{TITLES[screen]}</h2>
            </div>
            <div className="mm-sub-body">
              {screen === 'save' && <SavesPanel mode="save" />}
              {screen === 'load' && <SavesPanel mode="load" onLoaded={onClose} />}
              {screen === 'settings' && <SettingsPanel />}
              {screen === 'controls' && <ControlsPanel />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
