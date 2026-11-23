import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ScreenBoundary } from './ui/ScreenBoundary';
import { useStore, type SkinMode } from './ui/store';
import type { SymmetryMode } from './engine/random';
import { decodeGenome } from './engine/share';
import './index.css';

// Dev/headless only: let a screenshot harness request an exact creature + view via URL params,
// e.g. /?seed=42&morph=felid&skin=hybrid&spin=0 — see scripts/shoot.mjs. No effect in prod.
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  if (q.has('seed') || q.has('morph')) {
    const seed = Number(q.get('seed') ?? '1') >>> 0;
    const morph = q.get('morph');
    const sym = (q.get('sym') as SymmetryMode) || 'auto';
    useStore.getState().devLoad(seed, morph, sym);
  }
  // ?g=CAM2:… — open an exact (e.g. evolved) creature from its share string
  const shared = q.get('g');
  if (shared) {
    try {
      useStore.getState().adopt(decodeGenome(shared));
    } catch (e) {
      console.warn('bad ?g= creature string', e);
    }
  }
  const skin = q.get('skin');
  if (skin === 'smooth' || skin === 'hybrid' || skin === 'capsules') {
    useStore.getState().setSkinMode(skin as SkinMode);
  }
  if (q.get('spin') === '0') {
    // freeze the auto-rotate at the canonical initial angle so A/B shots are reproducible
    const freeze = () => {
      const f = (window as unknown as { __cambrianFreeze?: (v?: boolean) => void }).__cambrianFreeze;
      if (f) f(true);
      else setTimeout(freeze, 100);
    };
    setTimeout(freeze, 200);
  }
}

// Dev only: ?lab=planet opens the planet lab in place of the game: the planet's feel prototype, today's
// creatures on a bare planet of a chosen size under a globe camera (lab/planet/PlanetLab.tsx). A build
// leaves it out altogether.
const PlanetLab = import.meta.env.DEV ? lazy(() => import('./lab/planet/PlanetLab')) : null;
const LAB = import.meta.env.DEV ? new URLSearchParams(location.search).get('lab') : null;

// (Nothing here asks what draws the browser's WebGL: the menu must be up first. See ui/gpu.ts.)

const root = document.getElementById('app');
if (!root) throw new Error('#app mount point not found');

// (the page's static shell — the name and "Loading" — is replaced by this first render)
createRoot(root).render(
  <StrictMode>
    {PlanetLab && LAB === 'planet' ? (
      <Suspense fallback={null}>
        <PlanetLab />
      </Suspense>
    ) : (
      <ScreenBoundary>
        <App />
      </ScreenBoundary>
    )}
  </StrictMode>,
);
