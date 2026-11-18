/**
 * Frame pace — a stage draws on and on only where a frame is cheap.
 *
 * A canvas that redraws every frame is free on a graphics card and ruinous without one: a furred
 * creature drawn by the processor takes seconds a frame, back to back, and the page answers a click
 * only between them. Nothing in a renderer's name is proof either way, so the stage is measured:
 *
 *   probing   the stage is drawn when something changes, and no more. One frame is let through
 *             unjudged (the first compiles the shaders); then, once the page has gone quiet, one frame
 *             is drawn and timed. Cheap: 'live'. Dear twice running: 'still'.
 *   live      the loop runs: the turntable turns, the creature idles. Frames arriving slowly, several
 *             running, send it back to 'probing' — which finds out whether the stage was the cause.
 *   still     as 'probing', but nothing is timed: the creature is a picture that redraws on a drag
 *             or a change. It is measured afresh only if what is drawn changes (lower graphics).
 *
 * The timed frame ends by reading a pixel back, which the browser can answer only once everything
 * asked for is drawn: on a graphics card the drawing calls themselves return at once, and the work
 * is done later, out of sight of any clock in the page. Waiting for quiet first keeps other work (a
 * litter of thumbnails being built beside the stage) out of the measurement: a false 'still' would
 * lower a good machine's graphics.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

export type Pace = 'probing' | 'live' | 'still';

export const PACE = {
  /** a timed frame at or under this (ms) is cheap enough to loop: ten frames a second */
  slowMs: 100,
  /** timed frames, at most: the stage goes still only if every one of them was slow */
  probes: 2,
  /** the wait after the unjudged frame, and between timed frames (ms) */
  settleMs: 300,
  /** the page is quiet when this many frames running came less than `calmMs` apart */
  calmRun: 5,
  calmMs: 50,
  /** live: frames this far apart (ms), this many running, send the stage back to be measured */
  gapMs: 250,
  gapRun: 3,
  /** …but not again so soon after a measurement that found the stage cheap (ms) */
  restMs: 10000,
};

/** What the timed frames so far say: cheap once is 'live'; slow `probes` times is 'still'; else time
 *  another ('probing'). */
export function judgePace(costs: readonly number[]): Pace {
  if (costs.length === 0) return 'probing';
  if (Math.min(...costs) <= PACE.slowMs) return 'live';
  return costs.length >= PACE.probes ? 'still' : 'probing';
}

const PIXEL = new Uint8Array(4);

/**
 * Put inside a <Canvas> whose `frameloop` is 'always' only while `pace` is 'live'. `idle` holds the
 * measuring off (the stage is paused, or not yet drawn at all). `stage` names what is being drawn, as
 * far as its cost goes (the graphics options): a stage found slow is measured again when it changes.
 * `onPace` is told each verdict — with a frame's cost in ms when it is 'still'.
 */
export function FramePace({ pace, idle, stage, onPace }: { pace: Pace; idle: boolean; stage: string; onPace: (pace: Pace, ms?: number) => void }): null {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const drawn = useRef(0); // frames this canvas has drawn
  const slowRun = useRef(0);
  const restUntil = useRef(0);
  const judged = useRef(stage); // the stage the last 'still' was said of
  const tell = useRef(onPace);
  tell.current = onPace;

  // live: watch how far apart the frames come
  useFrame((_, dt) => {
    drawn.current++;
    if (pace !== 'live' || idle || document.hidden || performance.now() < restUntil.current) {
      slowRun.current = 0;
      return;
    }
    slowRun.current = dt * 1000 > PACE.gapMs ? slowRun.current + 1 : 0;
    if (slowRun.current >= PACE.gapRun) {
      slowRun.current = 0;
      tell.current('probing');
    }
  });

  // probing: one frame unjudged, then timed frames until they agree
  useEffect(() => {
    if (idle) return;
    if (pace === 'still' && judged.current !== stage) tell.current('probing');
    if (pace !== 'probing') return;
    let on = true;
    let raf = 0;
    let timer = 0;
    const costs: number[] = [];
    const from = drawn.current;

    const timed = () => {
      let verdict: Pace = 'live';
      try {
        const state = get();
        const t0 = performance.now();
        state.advance(t0, false);
        const gl = state.gl.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PIXEL);
        costs.push(performance.now() - t0);
        verdict = judgePace(costs);
      } catch {
        /* a stage that cannot be timed is left to run as it always did */
      }
      if (verdict === 'probing') timer = window.setTimeout(quiet, PACE.settleMs);
      else {
        if (verdict === 'live') restUntil.current = performance.now() + PACE.restMs;
        else judged.current = stage;
        tell.current(verdict, verdict === 'still' ? Math.min(...costs) : undefined);
      }
    };
    // (the page's own frames, counted until enough of them have come close together)
    const quiet = () => {
      let last = 0;
      let run = 0;
      const tick = (t: number) => {
        if (!on) return;
        run = last > 0 && t - last < PACE.calmMs ? run + 1 : 0;
        last = t;
        if (run >= PACE.calmRun) timed();
        else raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    // (the wait is counted from the frame after: a first frame that holds the page for seconds would
    // otherwise use it up while it is still being drawn)
    const unjudged = () => {
      if (!on) return;
      if (drawn.current > from) raf = requestAnimationFrame(() => (timer = window.setTimeout(quiet, PACE.settleMs)));
      else raf = requestAnimationFrame(unjudged);
    };
    invalidate();
    raf = requestAnimationFrame(unjudged);
    return () => {
      on = false;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // (a stage that changes while it is being measured is measured from the start: its first frame
    // compiles again)
  }, [pace, idle, stage, get, invalidate]);

  return null;
}
