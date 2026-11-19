import { describe, it, expect } from 'vitest';
import { gpuInfo, isSoftwareRenderer, noGpu, settleGraphics } from '../../src/ui/gpu';
import { DEFAULT_SETTINGS, PRESETS, useSettings } from '../../src/ui/settings';

describe('what draws the browser\'s WebGL', () => {
  it('knows a software renderer by its name', () => {
    for (const name of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'Google SwiftShader',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'softpipe',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple Software Renderer',
    ]) {
      expect(isSoftwareRenderer(name), name).toBe(true);
    }
  });

  it('and a graphics card by not being one', () => {
    for (const name of [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
      'Mesa Intel(R) Xe Graphics (TGL GT2)',
      'Adreno (TM) 640',
      // (a name the browser withholds says nothing either way: the frame pacing is the backstop)
      '',
      'WebKit WebGL',
    ]) {
      expect(isSoftwareRenderer(name), name).toBe(false);
    }
  });

  it('no WebGL at all counts as software (here: no document to ask), and is asked once', () => {
    const info = gpuInfo();
    expect(info).toEqual({ renderer: '', webgl: false, software: true });
    expect(gpuInfo()).toBe(info);
  });

  it('without a graphics card the game settles at Low before a first canvas — and again after a reset to the defaults', () => {
    const S = useSettings.getState();
    S.resetDefaults();
    expect(noGpu()).toBe(true);
    expect(settleGraphics()).toBe(true);
    expect(useSettings.getState().graphics).toEqual({ preset: 'low', ...PRESETS.low, auto: true });
    expect(useSettings.getState().notice).toEqual({ lowered: 'software', seen: false });
    // (what the Settings panel's button does: the defaults are High, which this browser cannot draw)
    S.dismissNotice();
    S.resetDefaults();
    expect(useSettings.getState().graphics).toEqual(DEFAULT_SETTINGS.graphics);
    settleGraphics();
    expect(useSettings.getState().graphics.preset).toBe('low');
    expect(useSettings.getState().notice).toEqual({ lowered: 'software', seen: false });
    // a player's own level is left alone
    S.setPreset('high');
    settleGraphics();
    expect(useSettings.getState().graphics.preset).toBe('high');
    S.resetDefaults();
  });
});
