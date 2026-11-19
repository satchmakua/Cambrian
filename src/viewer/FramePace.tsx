/**
 * Frame pace — a stage draws on and on only where a frame is cheap.
 *
 * A canvas that redraws every frame is free on a graphics card and ruinous without one: a furred
 * creature drawn by the processor takes seconds a frame, back to back, and the page answers a click
 * only between them. Nothing in a renderer's name is proof either way, so the stage is measured: it
 * starts still, and loops only once a frame has been timed cheap. The rules are in `pace.ts`; this
 * component feeds them what the canvas does, and draws the frames they ask to time.
 *
 * The timed frame ends by reading a pixel back, which the browser can answer only once everything
 * asked for is drawn: on a graphics card the drawing calls themselves return at once, and the work
 * is done later, out of sight of any clock in the page. Waiting for quiet first keeps other work (a
 * litter of thumbnails being built beside the stage) out of the measurement: a false 'still' would
 * lower a good machine's graphics.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PACE, paceStart, paceStep, type Pace, type PaceEvent, type PaceState } from './pace';

/** What came with a change of pace: was it this stage's first verdict (the one that may lower the
 *  graphics), and the cheapest timed frame, ms. */
export interface PaceVerdict {
  first: boolean;
  ms: number;
}

const PIXEL = new Uint8Array(4);

/**
 * Put inside a <Canvas> whose `frameloop` is 'always' only while `pace` is 'live'. `idle` holds the
 * measuring off (the stage is paused, or not yet drawn at all) — what was measured so far is kept.
 * `stage` names what is being drawn, as far as its cost goes (the graphics options). `onPace` is told
 * each change, and `pace` is what it was last told ('probing' before it is told anything).
 */
export function FramePace({ pace, idle, stage, onPace }: { pace: Pace; idle: boolean; stage: string; onPace: (pace: Pace, verdict: PaceVerdict) => void }): null {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const drawn = useRef(0); // frames this canvas has drawn
  const state = useRef<PaceState | null>(null);
  if (!state.current) state.current = paceStart(stage);
  const tell = useRef(onPace);
  tell.current = onPace;
  const send = useCallback((e: PaceEvent) => {
    const prev = state.current!;
    const next = (state.current = paceStep(prev, e));
    if (next.pace !== prev.pace) tell.current(next.pace, { first: prev.first, ms: next.cost });
  }, []);

  // live: how far apart the frames come
  useFrame((_, dt) => {
    drawn.current++;
    if (!idle) send({ type: 'frame', dt: dt * 1000, now: performance.now(), hidden: document.hidden });
  });

  // what is drawn changed (before the measuring below, which then starts over)
  useEffect(() => send({ type: 'stage', stage }), [stage, send]);

  // probing: the first frame unjudged, then timed frames until they agree
  useEffect(() => {
    if (idle || pace !== 'probing') return;
    let on = true;
    let raf = 0;
    let timer = 0;
    const from = drawn.current;

    const timed = () => {
      let ms = 0; // (a stage that cannot be timed is left to run as it always did)
      try {
        const three = get();
        const t0 = performance.now();
        three.advance(t0, false);
        const gl = three.gl.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PIXEL);
        ms = performance.now() - t0;
      } catch {
        /* as above */
      }
      send({ type: 'timed', ms, now: performance.now() });
      if (on && state.current!.pace === 'probing') settle();
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
    const settle = () => (timer = window.setTimeout(quiet, PACE.settleMs));
    // (the wait is counted from the frame after: a first frame that holds the page for seconds would
    // otherwise use it up while it is still being drawn)
    const unjudged = () => {
      if (!on) return;
      if (drawn.current > from) {
        send({ type: 'primed' });
        raf = requestAnimationFrame(settle);
      } else raf = requestAnimationFrame(unjudged);
    };
    if (state.current!.primed) settle();
    else {
      invalidate();
      raf = requestAnimationFrame(unjudged);
    }
    return () => {
      on = false;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // (`stage`: a stage that changes while it is being measured is measured from the start)
  }, [pace, idle, stage, get, invalidate, send]);

  // still: measured again when its wait is over (and the tab is on screen to be measured)
  useEffect(() => {
    if (idle || pace !== 'still') return;
    let timer = 0;
    const wait = (ms: number) => {
      timer = window.setTimeout(() => {
        if (document.hidden) return wait(5000);
        send({ type: 'retry', now: performance.now() });
        // (a timer may fire a hair before its time by the page's clock: asked again, then)
        if (state.current!.pace === 'still') wait(50);
      }, ms);
    };
    wait(Math.max(0, state.current!.retryAt - performance.now()));
    return () => clearTimeout(timer);
  }, [pace, idle, send]);

  return null;
}
