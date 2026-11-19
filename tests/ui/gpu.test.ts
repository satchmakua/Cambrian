import { describe, it, expect } from 'vitest';
import { gpuInfo, isIntegratedRenderer, isSoftwareRenderer, noGpu, rendererName, settleGraphics, slowGpuHint } from '../../src/ui/gpu';
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

describe("a computer's built-in graphics", () => {
  // (measured on a laptop: Chrome drew on its processor's Radeon after its graphics process restarted, with
  // an RTX card in the same machine idle — and the creatures took seconds a frame there)
  const RADEON = 'ANGLE (AMD, AMD Radeon(TM) 610M (0x0000164E) Direct3D11 vs_5_0 ps_5_0, D3D11)';
  const RTX = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti Laptop GPU (0x00002F18) Direct3D11 vs_5_0 ps_5_0, D3D11)';

  it('knows Intel graphics and the Radeon inside an AMD processor from a graphics card', () => {
    for (const name of [
      RADEON,
      'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Mesa Intel(R) Xe Graphics (TGL GT2)',
    ]) {
      expect(isIntegratedRenderer(name), name).toBe(true);
    }
    for (const name of [
      RTX,
      'ANGLE (AMD, AMD Radeon RX 6800M (0x000073DF) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
      '',
    ]) {
      expect(isIntegratedRenderer(name), name).toBe(false);
    }
  });

  it('names a renderer as a person would', () => {
    expect(rendererName(RADEON)).toBe('AMD Radeon 610M');
    expect(rendererName(RTX)).toBe('NVIDIA GeForce RTX 5070 Ti Laptop GPU');
    expect(rendererName('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('Intel UHD Graphics 620');
    expect(rendererName('Mesa Intel(R) Xe Graphics (TGL GT2)')).toBe('Mesa Intel Xe Graphics (TGL GT2)');
  });

  it('where the drawing was found slow on built-in graphics, says what draws it and how to use a card instead', () => {
    const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
    const hint = slowGpuHint({ renderer: RADEON, webgl: true, software: false }, windows)!;
    expect(hint).toContain('AMD Radeon 610M');
    expect(hint).toContain('Windows Settings › System › Display › Graphics');
    expect(slowGpuHint({ renderer: RADEON, webgl: true, software: false }, 'Mozilla/5.0 (X11; Linux x86_64)')).toContain("system's graphics settings");
    // (a graphics card, a software renderer, or nothing asked yet: nothing to say)
    expect(slowGpuHint({ renderer: RTX, webgl: true, software: false }, windows)).toBeNull();
    expect(slowGpuHint({ renderer: 'Google SwiftShader', webgl: true, software: true }, windows)).toBeNull();
    expect(slowGpuHint(null, windows)).toBeNull();
  });
});
