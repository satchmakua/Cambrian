import { describe, it, expect } from 'vitest';
import { PACE, judgePace, paceStart, paceStep, type PaceEvent, type PaceState } from '../../src/viewer/pace';

const run = (s: PaceState, ...events: PaceEvent[]): PaceState => events.reduce(paceStep, s);
const timed = (ms: number, now = 0): PaceEvent => ({ type: 'timed', ms, now });
const frame = (dt: number, now: number, hidden = false): PaceEvent => ({ type: 'frame', dt, now, hidden });
/** a stage that has been measured cheap, at time 0 */
const live = () => run(paceStart('high'), { type: 'primed' }, timed(8));
const SLOW = PACE.gapMs + 50;
const RESTED = PACE.restMs + 1;

describe('frame pace: what the timed frames say', () => {
  it('a stage loops once a timed frame is cheap, and not before one is timed', () => {
    expect(judgePace([])).toBe('probing');
    expect(judgePace([4])).toBe('live');
    expect(judgePace([PACE.slowMs])).toBe('live');
  });

  it('one slow frame is not a verdict — something else may have been in the way: it is timed again', () => {
    expect(judgePace([PACE.slowMs + 1])).toBe('probing');
    expect(judgePace([900, 12])).toBe('live');
  });

  it('slow every time, the stage stays still', () => {
    const slow = Array.from({ length: PACE.probes }, () => 400);
    expect(judgePace(slow)).toBe('still');
    expect(judgePace(slow.slice(1))).toBe('probing');
  });

  it('a frame of seconds is a verdict by itself: a second one would hold the page as long again', () => {
    expect(judgePace([PACE.sureMs])).toBe('probing');
    expect(judgePace([PACE.sureMs + 1])).toBe('still');
    expect(judgePace([19000])).toBe('still');
  });
});

describe('frame pace: the stage from mount to verdict', () => {
  it('starts still, with its first verdict still to come', () => {
    const s = paceStart('high');
    expect(s).toMatchObject({ pace: 'probing', primed: false, first: true, costs: [] });
    expect(paceStep(s, { type: 'primed' }).primed).toBe(true);
  });

  it('a cheap frame sets it looping; that was its first verdict, and it rests before being watched', () => {
    const s = run(paceStart('high'), { type: 'primed' }, timed(8, 1000));
    expect(s).toMatchObject({ pace: 'live', first: false, cost: 8, restUntil: 1000 + PACE.restMs });
  });

  it('slow frames hold it still, and the first verdict is the one marked as such', () => {
    const one = run(paceStart('high'), { type: 'primed' }, timed(400));
    expect(one).toMatchObject({ pace: 'probing', first: true, costs: [400] });
    const two = paceStep(one, timed(300, 5000));
    expect(two).toMatchObject({ pace: 'still', first: false, cost: 300, costs: [], retryAt: 5000 + PACE.retryMs });
  });

  it('what was timed is kept while nothing is fed (a pause): the measuring goes on where it was', () => {
    const one = run(paceStart('high'), { type: 'primed' }, timed(400));
    // (a visit to a panel: no events at all — and none of these change it either)
    const back = run(one, frame(900, 100), { type: 'retry', now: 1e9 }, { type: 'stage', stage: 'high' }, { type: 'primed' });
    expect(back).toBe(one);
    expect(paceStep(back, timed(300)).pace).toBe('still');
  });
});

describe('frame pace: a looping stage', () => {
  it('slow frames, several running, send it back to be measured — and that is no longer a first verdict', () => {
    let s = live();
    for (let i = 0; i < PACE.gapRun - 1; i++) s = paceStep(s, frame(SLOW, RESTED));
    expect(s.pace).toBe('live');
    s = paceStep(s, frame(SLOW, RESTED));
    expect(s).toMatchObject({ pace: 'probing', first: false, primed: true, costs: [] });
    // found slow now, it is held still — the caller sees `first: false` and lowers nothing
    const still = run(s, timed(400, RESTED), timed(400, RESTED));
    expect(still).toMatchObject({ pace: 'still', first: false });
  });

  it('a quick frame in between starts the count again', () => {
    const s = run(live(), frame(SLOW, RESTED), frame(SLOW, RESTED), frame(16, RESTED), frame(SLOW, RESTED), frame(SLOW, RESTED));
    expect(s).toMatchObject({ pace: 'live', slowRun: 2 });
  });

  it('a hidden tab does not count: its frames come seconds apart by the browser\'s doing', () => {
    const s = run(live(), ...Array.from({ length: 10 }, () => frame(2000, RESTED, true)));
    expect(s).toMatchObject({ pace: 'live', slowRun: 0 });
  });

  it('nor do frames in the rest after a measurement that found it cheap', () => {
    const s = run(live(), ...Array.from({ length: 10 }, () => frame(SLOW, PACE.restMs - 1)));
    expect(s.pace).toBe('live');
    expect(run(s, ...Array.from({ length: PACE.gapRun }, () => frame(SLOW, RESTED))).pace).toBe('probing');
  });

  it('is watched as it is when the options change', () => {
    const s = paceStep(live(), { type: 'stage', stage: 'low' });
    expect(s).toMatchObject({ pace: 'live', stage: 'low' });
  });
});

describe('frame pace: a still stage', () => {
  const still = () => run(paceStart('high'), { type: 'primed' }, timed(400, 0), timed(400, 0));

  it('is measured from the start when what is drawn changes (lower graphics): its first frame compiles again', () => {
    const s = paceStep(still(), { type: 'stage', stage: 'low' });
    expect(s).toMatchObject({ pace: 'probing', stage: 'low', primed: false, costs: [], first: false });
  });

  it('is measured again when its wait is over, not before — without an unjudged frame: nothing new to compile', () => {
    const s = still();
    expect(paceStep(s, { type: 'retry', now: PACE.retryMs - 1 })).toBe(s);
    expect(paceStep(s, { type: 'retry', now: PACE.retryMs })).toMatchObject({ pace: 'probing', primed: true, costs: [] });
  });

  it('found slow again, it waits twice as long each time, up to a limit; found cheap, it loops', () => {
    let s = still();
    const waits: number[] = [];
    let now = 0;
    for (let i = 0; i < 7; i++) {
      waits.push(s.retryAt - now);
      now = s.retryAt;
      s = run(s, { type: 'retry', now }, timed(400, now), timed(400, now));
      expect(s.pace).toBe('still');
    }
    expect(waits).toEqual([10000, 20000, 40000, 80000, 160000, 300000, 300000]);
    now = s.retryAt;
    const back = run(s, { type: 'retry', now }, timed(9, now));
    expect(back).toMatchObject({ pace: 'live', retryMs: PACE.retryMs });
  });

  it('a stage that changes while it is being measured starts over, still on its first verdict', () => {
    const s = run(paceStart('high'), { type: 'primed' }, timed(400), { type: 'stage', stage: 'medium' });
    expect(s).toMatchObject({ pace: 'probing', primed: false, costs: [], first: true });
  });
});
