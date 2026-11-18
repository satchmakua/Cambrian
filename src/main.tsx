import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ScreenBoundary } from './ui/ScreenBoundary';
import { gpuInfo } from './ui/gpu';
import { useSettings } from './ui/settings';
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

// Where the browser draws without a graphics card, the game starts at the Low quality (if the player
// lets it adjust: see settings). Decided here, before the first canvas exists: lowering the options
// under a canvas that is already up compiles every shader a second time.
if (gpuInfo().software) useSettings.getState().autoLower('software');

const root = document.getElementById('app');
if (!root) throw new Error('#app mount point not found');

// (the page's static shell — the name and "Loading" — is replaced by this first render)
createRoot(root).render(
  <StrictMode>
    <ScreenBoundary>
      <App />
    </ScreenBoundary>
  </StrictMode>,
);
