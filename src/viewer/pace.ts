/**
 * Frame pace: the rules by which a stage is let loop, held still, and measured again.
 *
 * Pure: a state and the events that move it (`paceStep`), so the rules are tested without a browser.
 * `FramePace` feeds it the frames it sees and draws the frames it asks for.
 *
 *   probing   the stage is drawn when something changes, and no more. Its first frame is not judged
 *             (it compiles the shaders); then frames are drawn and timed. One smooth frame: 'live'.
 *             Cheap but not smooth, twice: 'live' (and the game's stage lowers the graphics).
 *             Every one dear — or one so dear that a second opinion is not worth its seconds: 'still'.
 *   live      the loop runs. Frames arriving slowly, several running, send it back to be measured.
 *   still     a picture, redrawn on a drag or a change. It is measured again when what is drawn
 *             changes (lower graphics), and now and then besides — at longer and longer intervals —
 *             so a machine that was only busy for a moment gets its turntable back.
 *
 * Only the FIRST verdict after a stage is mounted may lower the graphics (`first`): a stage that has
 * been seen to loop was slowed by something passing — a wake from sleep, another program — and a
 * setting changed for that would stay changed for good.
 */

export type Pace = 'probing' | 'live' | 'still';

/**
 * What a screen's 3D is doing, for the loading screen in front of it (ui/LoadingGate): building its
 * shaders (and drawing a first frame whole with them), measuring its frames — or ready to be seen.
 * `still`: the stage will be a picture, not a turntable; `lowered`: the graphics were lowered for it;
 * `slow`: its frames were measured slow at the options it opens with (nothing lower left to try).
 */
export interface StageStatus {
  step: 'shaders' | 'measuring' | 'ready';
  still: boolean;
  lowered: boolean;
  slow?: boolean;
}

/** The valley plays smoothly with its frames this far apart or less (ms, the median: 24 frames a
 *  second). Slower, its loading screen lowers the graphics, if the game may, and measures again. */
export const WORLD_SMOOTH_MS = 42;

/** The median of these frame intervals (ms); 0 for none. */
export function medianFrameMs(dts: readonly number[]): number {
  if (dts.length === 0) return 0;
  const s = [...dts].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const PACE = {
  /** a timed frame at or under this (ms) is cheap enough to loop: ten frames a second */
  slowMs: 100,
  /** …and at or under this (ms) the loop turns smoothly: thirty frames a second. Between the two the
   *  stage loops, and the game's own stage lowers the graphics, if it may (CreatureViewer) */
  smoothMs: 33,
  /** timed frames, at most: the stage goes still only if every one of them was slow */
  probes: 2,
  /** …but one over this (ms) is a verdict by itself: a frame of seconds needs no second one */
  sureMs: 1000,
  /** a timed frame at or under this (ms) leaves room to draw more (the menu backdrop's fur) */
  roomyMs: 12,
  /** the wait after the unjudged frame, and between timed frames (ms) */
  settleMs: 300,
  /** the page is quiet when this many frames running came less than `calmMs` apart */
  calmRun: 5,
  calmMs: 50,
  /** …and a frame is timed after this long (ms) whether or not it ever is: a page busy for good (the
   *  graphics process building another canvas's shaders) would otherwise leave the stage unmeasured,
   *  and the loading screen up, for as long as that lasts */
  calmWaitMs: 3000,
  /** live: frames this far apart (ms), this many running, send the stage back to be measured */
  gapMs: 250,
  gapRun: 3,
  /** …but not again so soon after a measurement that found the stage cheap (ms) */
  restMs: 10000,
  /** still: measured again after this long (ms), then twice as long each time, up to `retryMaxMs` */
  retryMs: 10000,
  retryMaxMs: 300000,
};

/** What the timed frames so far say: smooth once is 'live'; cheap but not smooth is 'live' once it has
 *  been timed `probes` times (one dear frame may be something else in the way, and the verdict may
 *  lower the graphics); slow `probes` times, or once beyond doubt, is 'still'; else time another
 *  ('probing'). */
export function judgePace(costs: readonly number[]): Pace {
  if (costs.length === 0) return 'probing';
  const best = Math.min(...costs);
  if (best <= PACE.smoothMs) return 'live';
  if (costs.length < PACE.probes && best <= PACE.sureMs) return 'probing';
  return best <= PACE.slowMs ? 'live' : 'still';
}

export interface PaceState {
  pace: Pace;
  /** what is being drawn, as far as its cost goes (the graphics options) */
  stage: string;
  /** this stage's first frame — the one that compiles — has been drawn, and was not judged */
  primed: boolean;
  /** the timed frames of the measurement under way (kept while the stage is paused: a visit to a
   *  menu's panel does not start it over) */
  costs: readonly number[];
  /** no verdict yet since the stage was mounted: the only one that may lower the graphics */
  first: boolean;
  /** the last verdict's cheapest timed frame, ms */
  cost: number;
  /** live: slow frames running, and the time before which they are not counted */
  slowRun: number;
  restUntil: number;
  /** still: when it is measured again, and how long the wait after that will be */
  retryAt: number;
  retryMs: number;
}

export type PaceEvent =
  /** the unjudged first frame has been drawn */
  | { type: 'primed' }
  /** a frame was drawn and timed: `ms` */
  | { type: 'timed'; ms: number; now: number }
  /** the loop drew a frame `dt` ms after the last (`hidden`: the tab is not on screen) */
  | { type: 'frame'; dt: number; now: number; hidden: boolean }
  /** what is drawn changed */
  | { type: 'stage'; stage: string }
  /** a still stage's timer came round */
  | { type: 'retry'; now: number };

export function paceStart(stage: string): PaceState {
  return { pace: 'probing', stage, primed: false, costs: [], first: true, cost: 0, slowRun: 0, restUntil: 0, retryAt: 0, retryMs: PACE.retryMs };
}

export function paceStep(s: PaceState, e: PaceEvent): PaceState {
  switch (e.type) {
    case 'primed':
      return s.pace === 'probing' && !s.primed ? { ...s, primed: true } : s;
    case 'timed': {
      if (s.pace !== 'probing') return s;
      const costs = [...s.costs, e.ms];
      const verdict = judgePace(costs);
      if (verdict === 'probing') return { ...s, costs };
      const done = { ...s, pace: verdict, costs: [], first: false, cost: Math.min(...costs), slowRun: 0 };
      if (verdict === 'live') return { ...done, restUntil: e.now + PACE.restMs, retryMs: PACE.retryMs };
      return { ...done, retryAt: e.now + s.retryMs, retryMs: Math.min(s.retryMs * 2, PACE.retryMaxMs) };
    }
    case 'frame': {
      if (s.pace !== 'live') return s;
      // (a hidden tab's frames come seconds apart by the browser's own doing)
      const run = e.hidden || e.now < s.restUntil || e.dt <= PACE.gapMs ? 0 : s.slowRun + 1;
      if (run >= PACE.gapRun) return { ...s, pace: 'probing', costs: [], slowRun: 0 };
      return run === s.slowRun ? s : { ...s, slowRun: run };
    }
    case 'stage': {
      if (e.stage === s.stage) return s;
      // (a looping stage is watched as it is; any other is measured from the start, its first frame
      // compiling again)
      if (s.pace === 'live') return { ...s, stage: e.stage };
      return { ...s, stage: e.stage, pace: 'probing', primed: false, costs: [], retryMs: PACE.retryMs };
    }
    case 'retry':
      return s.pace === 'still' && e.now >= s.retryAt ? { ...s, pace: 'probing', costs: [] } : s;
  }
}
