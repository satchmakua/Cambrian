/**
 * The loading screen's rules: what it says in front of each screen, and when that screen is ready to
 * be let into (see LoadingGate). Pure, and tested headlessly.
 *
 *   breed    the stage's shaders built and a frame of it drawn whole, the litter of nine drawn in
 *            their skins, the stage's frames measured — and, where they were slow, the graphics
 *            lowered and measured again (CreatureViewer, PACE)
 *   world    the valley's shaders built and a frame drawn whole, its frame rate measured (and the
 *            graphics lowered and measured again, where it was under WORLD_SMOOTH_MS)
 *   studio   its views drawn whole
 */
import type { StageStatus } from '../viewer/pace';
import type { GameView } from './store';

export interface GateStep {
  label: string;
  state: 'done' | 'now' | 'next';
  /** a count or a word after the label ("4 of 9") */
  detail?: string;
}

/** What each screen has reported of itself (null: nothing yet). */
export interface GateReports {
  hero: StageStatus | null;
  litter: { drawn: number; total: number };
  world: StageStatus | null;
  studio: StageStatus | null;
}

export const NO_REPORTS: GateReports = { hero: null, litter: { drawn: 0, total: 0 }, world: null, studio: null };

/** The steps shown in front of `view`, and whether it is ready. */
export function gateSteps(view: GameView, r: GateReports): { steps: GateStep[]; ready: boolean } {
  const loaded: GateStep = { label: 'Loading the game', state: 'done' };
  const stage = (st: StageStatus | null): [GateStep, GateStep] => {
    const step = st?.step ?? 'shaders';
    return [
      { label: 'Building the shaders', state: step === 'shaders' ? 'now' : 'done' },
      { label: 'Checking the frame rate', state: step === 'ready' ? 'done' : step === 'measuring' ? 'now' : 'next', detail: st?.lowered ? 'graphics lowered' : undefined },
    ];
  };
  if (view === 'world') return { steps: [loaded, ...stage(r.world)], ready: r.world?.step === 'ready' };
  if (view === 'studio') return { steps: [loaded, stage(r.studio)[0]], ready: r.studio?.step === 'ready' };
  const { drawn, total } = r.litter;
  const litterDone = total > 0 && drawn >= total;
  const [built, rate] = stage(r.hero);
  return {
    steps: [loaded, built, { label: 'Drawing the litter', state: litterDone ? 'done' : 'now', detail: litterDone || total === 0 ? undefined : `${drawn} of ${total}` }, rate],
    ready: r.hero?.step === 'ready' && litterDone,
  };
}

/** The steps shown while the game's own code is still being fetched (before any screen can report). */
export function fetchingSteps(view: GameView): GateStep[] {
  const rest: GateStep[] = view === 'studio' ? [{ label: 'Building the shaders', state: 'next' }] : [{ label: 'Building the shaders', state: 'next' }, ...(view === 'breed' ? [{ label: 'Drawing the litter', state: 'next' as const }] : []), { label: 'Checking the frame rate', state: 'next' }];
  return [{ label: 'Loading the game', state: 'now' }, ...rest];
}

/** Did the stage find the drawing slow (the loading screen then says what draws it)? */
export function foundSlow(r: GateReports): boolean {
  return [r.hero, r.world].some((s) => !!s && (s.lowered || s.still || !!s.slow));
}
