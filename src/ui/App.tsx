import { lazy, Suspense } from 'react';
import { useStore } from './store';
import { MainMenu } from './menu/MainMenu';
import { fetching } from './ScreenBoundary';

// The game's screens are fetched when a game is entered: with them come the 3D library and the
// creature renderer — three quarters of the code — and the menu must be usable before any of that
// has arrived. (The menu's own backdrop fetches the same code, after the menu is up.)
// (a fetch that fails is tried once more; one that keeps failing is shown by the screen boundary)
const Game = lazy(fetching(() => import('./GameScreens').then((m) => ({ default: m.Game }))));

// Dev/headless: ?bare=1 renders just the creature full-bleed (no UI chrome) for clean face shots.
const BARE = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('bare') === '1';

/** The app: the main menu, or — once a game is being played — its screens. */
export function App() {
  const view = useStore((s) => s.view);
  // The menu stands on its own. It is where a player lands when a screen has failed, and the failure
  // may be the creature being bred — one that cannot be grown, or drawn — so the way to the menu must
  // not pass through anything that needs it (the game's screens grow it before they draw anything).
  if (view === 'menu' && !BARE) return <MainMenu />;
  return (
    <Suspense fallback={<div className="screen-loading">Loading…</div>}>
      <Game />
    </Suspense>
  );
}

