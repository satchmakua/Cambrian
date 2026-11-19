import { describe, it, expect } from 'vitest';
import { NO_REPORTS, fetchingSteps, foundSlow, gateSteps, type GateReports } from '../../src/ui/gate';
import type { StageStatus } from '../../src/viewer/pace';

const stage = (step: StageStatus['step'], more: Partial<StageStatus> = {}): StageStatus => ({ step, still: false, lowered: false, ...more });
const with_ = (r: Partial<GateReports>): GateReports => ({ ...NO_REPORTS, ...r });
const states = (view: Parameters<typeof gateSteps>[0], r: GateReports) => gateSteps(view, r).steps.map((s) => `${s.label}:${s.state}${s.detail ? ` (${s.detail})` : ''}`);

describe('the loading screen in front of the breeder', () => {
  it('is not ready before anything has reported — a screen that has said nothing is not let into', () => {
    expect(gateSteps('breed', NO_REPORTS).ready).toBe(false);
    expect(states('breed', NO_REPORTS)).toEqual(['Loading the game:done', 'Building the shaders:now', 'Drawing the litter:now', 'Checking the frame rate:next']);
  });

  it('waits for the stage and the whole litter: neither alone lets the player in', () => {
    const litter = { drawn: 9, total: 9 };
    expect(gateSteps('breed', with_({ hero: stage('ready') })).ready).toBe(false);
    expect(gateSteps('breed', with_({ hero: stage('ready'), litter: { drawn: 8, total: 9 } })).ready).toBe(false);
    expect(gateSteps('breed', with_({ hero: stage('measuring'), litter })).ready).toBe(false);
    expect(gateSteps('breed', with_({ hero: stage('ready'), litter })).ready).toBe(true);
  });

  it('says what is under way: the shaders, the litter counted in, the frames measured', () => {
    expect(states('breed', with_({ hero: stage('shaders'), litter: { drawn: 4, total: 9 } }))).toEqual([
      'Loading the game:done',
      'Building the shaders:now',
      'Drawing the litter:now (4 of 9)',
      'Checking the frame rate:next',
    ]);
    expect(states('breed', with_({ hero: stage('measuring'), litter: { drawn: 9, total: 9 } }))).toEqual([
      'Loading the game:done',
      'Building the shaders:done',
      'Drawing the litter:done',
      'Checking the frame rate:now',
    ]);
  });

  it('says so when the graphics were lowered for the frames measured', () => {
    const r = with_({ hero: stage('ready', { lowered: true }), litter: { drawn: 9, total: 9 } });
    expect(states('breed', r)[3]).toBe('Checking the frame rate:done (graphics lowered)');
    expect(foundSlow(r)).toBe(true);
  });
});

describe('the loading screen in front of the valley and the Studio', () => {
  it('the valley: its shaders, then its frame rate', () => {
    expect(gateSteps('world', with_({ world: stage('shaders') })).ready).toBe(false);
    expect(states('world', with_({ world: stage('measuring') }))).toEqual(['Loading the game:done', 'Building the shaders:done', 'Checking the frame rate:now']);
    expect(gateSteps('world', with_({ world: stage('ready') })).ready).toBe(true);
    // (the breeder's stage reported nothing here: what the valley says is all that counts)
    expect(gateSteps('world', with_({ hero: stage('shaders'), world: stage('ready') })).ready).toBe(true);
  });

  it('the Studio: its views drawn whole', () => {
    expect(states('studio', NO_REPORTS)).toEqual(['Loading the game:done', 'Building the shaders:now']);
    expect(gateSteps('studio', with_({ studio: stage('ready') })).ready).toBe(true);
  });

  it('a picture of a stage, or a lowered valley, is drawing found slow; a stage that turns is not', () => {
    expect(foundSlow(with_({ hero: stage('ready', { still: true }) }))).toBe(true);
    expect(foundSlow(with_({ world: stage('ready', { lowered: true }) }))).toBe(true);
    // (slow at the lowest it can go: let in — nothing more can be done here — and told what draws it)
    expect(foundSlow(with_({ world: stage('ready', { slow: true }) }))).toBe(true);
    expect(foundSlow(with_({ hero: stage('ready'), world: stage('ready') }))).toBe(false);
    expect(foundSlow(NO_REPORTS)).toBe(false);
  });
});

describe('while the game is fetched', () => {
  it('shows the steps still to come for the screen asked for, the fetch under way', () => {
    expect(fetchingSteps('breed').map((s) => `${s.label}:${s.state}`)).toEqual(['Loading the game:now', 'Building the shaders:next', 'Drawing the litter:next', 'Checking the frame rate:next']);
    expect(fetchingSteps('world').map((s) => s.label)).toEqual(['Loading the game', 'Building the shaders', 'Checking the frame rate']);
    expect(fetchingSteps('studio').map((s) => s.label)).toEqual(['Loading the game', 'Building the shaders']);
  });
});
