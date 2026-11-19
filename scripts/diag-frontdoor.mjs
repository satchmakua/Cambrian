#!/usr/bin/env node
/**
 * Front-door diagnostics: why does the page lock up before the menu can be used?
 *
 * Opens the game in a real browser, and measures what happens from navigation to a usable menu:
 * what loads (requests, bytes, the slowest), when the menu's buttons appear, how long the main thread
 * is blocked and by what (long tasks, a CPU profile), and what WebGL is asked to do (the graphics
 * adapter, shader programs and their source size, the time spent inside each kind of GL call).
 *
 *   node scripts/diag-frontdoor.mjs [url] [seconds]
 *
 *   url       default http://localhost:5173/
 *   seconds   how long to watch after navigation (default 45)
 *
 * Environment:
 *   DIAG_CHANNEL    which browser: 'chrome' (the installed Chrome, the default), 'msedge', or 'bundled'
 *                   (Playwright's own Chromium)
 *   DIAG_HEADLESS   '1' to run without a window (a headless browser may have no GPU: prefer a window)
 *   DIAG_OUT        where to write the full report (default ./diag-frontdoor-report.json)
 *   PLAYWRIGHT_MODULE  path to a Playwright entry file, if it is not installed in this project
 *
 * Needs Playwright or playwright-core (`npm i --no-save playwright-core` downloads no browser).
 * Read-only: it changes nothing in the game or its saved state (it uses a fresh browser profile).
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tried = [];
  for (const name of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try {
      return require(name);
    } catch (e) {
      tried.push(`${name}: ${String(e.message).split('\n')[0]}`);
    }
  }
  console.error('Playwright is not installed. Run:  npm i --no-save playwright-core\n' + tried.join('\n'));
  process.exit(2);
}

const url = process.argv[2] || 'http://localhost:5173/';
const seconds = Number(process.argv[3] || 45);
const channel = process.env.DIAG_CHANNEL || 'chrome';
const headless = process.env.DIAG_HEADLESS === '1';
const out = process.env.DIAG_OUT || 'diag-frontdoor-report.json';

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless, ...(channel === 'bundled' ? {} : { channel }) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleLines = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(`${m.type()}: ${m.text().slice(0, 400)}`);
});
page.on('pageerror', (e) => consoleLines.push('PAGEERROR: ' + String(e).slice(0, 600)));

// --- what loads -------------------------------------------------------------------------------
const requests = new Map();
const failed = [];
page.on('request', (r) => requests.set(r, { url: r.url(), start: Date.now() }));
page.on('requestfailed', (r) => failed.push(`${r.url().slice(0, 160)} — ${r.failure()?.errorText}`));
page.on('requestfinished', async (r) => {
  const rec = requests.get(r);
  if (!rec) return;
  rec.ms = Date.now() - rec.start;
  try {
    const s = await r.sizes();
    rec.bytes = s.responseBodySize + s.responseHeadersSize;
  } catch {
    rec.bytes = 0;
  }
});

// --- what the page does ------------------------------------------------------------------------
await page.addInitScript(() => {
  const D = (window.__diag = { long: [], paints: {}, frames: [], gl: {}, shaders: 0, shaderBytes: 0, biggestShader: 0, programs: 0, renderer: '', vendor: '', contexts: 0, draws: 0, tris: 0, lost: 0 });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) D.long.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ entryTypes: ['longtask'] });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) D.paints[e.name] = Math.round(e.startTime);
    }).observe({ entryTypes: ['paint'] });
  } catch {}
  // time spent inside each kind of WebGL call (a blocking shader compile shows up here)
  const TIMED = ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'useProgram', 'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'texImage2D', 'texSubImage2D', 'bufferData', 'readPixels', 'finish', 'getError', 'clear', 'getUniformLocation'];
  const wrap = (proto) => {
    if (!proto) return;
    for (const name of TIMED) {
      const f = proto[name];
      if (typeof f !== 'function') continue;
      proto[name] = function (...a) {
        const t = performance.now();
        const r = f.apply(this, a);
        const dt = performance.now() - t;
        const g = (D.gl[name] ??= { n: 0, ms: 0, max: 0, maxAt: 0 });
        g.n++;
        g.ms += dt;
        if (dt > g.max) {
          g.max = dt;
          g.maxAt = Math.round(t);
        }
        if (name.startsWith('draw')) {
          D.draws++;
          const count = name.startsWith('drawElements') ? a[1] : a[2];
          const inst = name.endsWith('Instanced') ? a[a.length - 1] : 1;
          D.tris += (count / 3) * inst;
        }
        return r;
      };
    }
    const ss = proto.shaderSource;
    proto.shaderSource = function (s, src) {
      D.shaders++;
      D.shaderBytes += src.length;
      D.biggestShader = Math.max(D.biggestShader, src.length);
      return ss.call(this, s, src);
    };
    const cp = proto.createProgram;
    proto.createProgram = function () {
      D.programs++;
      return cp.call(this);
    };
  };
  wrap(window.WebGL2RenderingContext?.prototype);
  wrap(window.WebGLRenderingContext?.prototype);
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, attrs) {
    const c = gc.call(this, kind, attrs);
    if (c && /webgl/.test(kind)) {
      D.contexts++;
      try {
        const e = c.getExtension('WEBGL_debug_renderer_info');
        if (e) {
          D.renderer = c.getParameter(e.UNMASKED_RENDERER_WEBGL);
          D.vendor = c.getParameter(e.UNMASKED_VENDOR_WEBGL);
        }
        D.parallelCompile = !!c.getExtension('KHR_parallel_shader_compile');
        D.maxTexture = c.getParameter(c.MAX_TEXTURE_SIZE);
      } catch {}
      this.addEventListener('webglcontextlost', () => D.lost++);
    }
    return c;
  };
  let last = performance.now();
  const tick = () => {
    const n = performance.now();
    if (D.frames.length < 3000) D.frames.push(Math.round(n - last));
    last = n;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
await cdp.send('Profiler.start');

const t0 = Date.now();
const marks = {};
const nav = page
  .goto(url, { waitUntil: 'load', timeout: seconds * 1000 })
  .then(() => (marks.load = Date.now() - t0))
  .catch((e) => (marks.loadError = String(e.message).split('\n')[0]));
page.once('domcontentloaded', () => (marks.domContentLoaded = Date.now() - t0));
// the menu is usable when one of its buttons is on the page
const menu = page
  .waitForSelector('button', { timeout: seconds * 1000 })
  .then(() => (marks.firstButton = Date.now() - t0))
  .catch(() => (marks.firstButton = null));

// is the main thread answering? ask it something small every two seconds
const pulse = [];
const end = t0 + seconds * 1000;
while (Date.now() < end) {
  const asked = Date.now();
  let answer;
  try {
    answer = await Promise.race([
      page.evaluate(() => document.readyState + '|' + document.querySelectorAll('button').length + '|' + (document.body?.innerText || '').length),
      new Promise((_, rej) => setTimeout(() => rej(new Error('no answer in 10 s')), 10000)),
    ]);
  } catch (e) {
    answer = String(e.message).split('\n')[0];
  }
  pulse.push({ at: asked - t0, took: Date.now() - asked, answer });
  await new Promise((r) => setTimeout(r, 2000));
}
await Promise.race([Promise.all([nav, menu]), new Promise((r) => setTimeout(r, 3000))]);

let profileTop = [];
try {
  const { profile } = await Promise.race([cdp.send('Profiler.stop'), new Promise((_, rej) => setTimeout(() => rej(new Error('profiler did not stop')), 20000))]);
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    const file = n.callFrame.url.split('?')[0].split('/').slice(-2).join('/');
    const key = `${n.callFrame.functionName || '(anonymous)'} ${file}:${n.callFrame.lineNumber}`;
    self.set(key, (self.get(key) || 0) + profile.timeDeltas[i]);
  }
  profileTop = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [Math.round(v / 1000), k]);
} catch (e) {
  profileTop = [[0, 'profile unavailable: ' + String(e.message)]];
}

let inPage = null;
try {
  inPage = await Promise.race([
    page.evaluate(() => {
      const D = window.__diag;
      const c = document.querySelector('canvas');
      return {
        ...D,
        canvas: c ? [c.width, c.height, c.clientWidth, c.clientHeight] : null,
        dpr: window.devicePixelRatio,
        screen: [screen.width, screen.height],
        cores: navigator.hardwareConcurrency,
        memoryGB: navigator.deviceMemory,
        userAgent: navigator.userAgent,
        buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 20),
        text: (document.body?.innerText || '').slice(0, 300),
      };
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('the page did not answer in 20 s')), 20000)),
  ]);
} catch (e) {
  inPage = { error: String(e.message).split('\n')[0] };
}
await page.screenshot({ path: out.replace(/\.json$/, '') + '.png', timeout: 15000 }).catch(() => {});
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]);

// --- the report ---------------------------------------------------------------------------------
const reqs = [...requests.values()];
const done = reqs.filter((r) => r.ms !== undefined);
const report = {
  url,
  seconds,
  browser: { channel, headless },
  host: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 2 ** 30) },
  marks,
  requests: {
    count: reqs.length,
    finished: done.length,
    unfinished: reqs.length - done.length,
    megabytes: +(done.reduce((s, r) => s + (r.bytes || 0), 0) / 2 ** 20).toFixed(2),
    slowest: done.sort((a, b) => b.ms - a.ms).slice(0, 12).map((r) => `${r.ms} ms  ${Math.round((r.bytes || 0) / 1024)} KB  ${r.url.slice(0, 120)}`),
    failed: failed.slice(0, 20),
  },
  pulse,
  page: inPage,
  profileTop,
  console: consoleLines.slice(0, 40),
};
writeFileSync(out, JSON.stringify(report, null, 1));

const P = inPage && !inPage.error ? inPage : null;
const frames = P ? P.frames : [];
const sorted = [...frames].sort((a, b) => a - b);
const pct = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);
const longTotal = P ? P.long.reduce((s, l) => s + l[1], 0) : null;
const stuck = pulse.filter((p) => p.took > 1000 || /no answer/.test(p.answer));
const line = (s = '') => console.log(s);
line('===== CAMBRIAN FRONT-DOOR REPORT =====');
line(`url: ${url}   watched: ${seconds} s   browser: ${channel}${headless ? ' (headless)' : ''}`);
line(`host: ${report.host.platform} ${report.host.release} · ${report.host.cpu} · ${report.host.cores} cores · ${report.host.memoryGB} GB`);
if (P) {
  line(`user agent: ${P.userAgent}`);
  line(`graphics: ${P.renderer || '(no WebGL context was created)'}  [${P.vendor}]`);
  line(`  parallel shader compile: ${P.parallelCompile}   WebGL contexts: ${P.contexts}   contexts lost: ${P.lost}`);
  line(`screen: ${P.screen.join('x')}  devicePixelRatio: ${P.dpr}  canvas: ${P.canvas ? P.canvas.join(' / ') : 'none'}`);
}
line(`timeline (ms from navigation): DOMContentLoaded ${marks.domContentLoaded ?? '—'} · load ${marks.load ?? marks.loadError ?? '—'} · first button ${marks.firstButton ?? 'NEVER'}` + (P ? ` · first paint ${P.paints['first-paint'] ?? '—'} · first contentful paint ${P.paints['first-contentful-paint'] ?? '—'}` : ''));
line(`requests: ${report.requests.count} (${report.requests.unfinished} never finished) · ${report.requests.megabytes} MB · failed ${failed.length}`);
for (const s of report.requests.slowest.slice(0, 6)) line('  ' + s);
for (const f of failed.slice(0, 6)) line('  FAILED ' + f);
line(`main thread: ${stuck.length} of ${pulse.length} pulses slow or unanswered` + (longTotal !== null ? ` · long tasks ${P.long.length}, ${longTotal} ms in total, longest ${Math.max(0, ...P.long.map((l) => l[1]))} ms` : ''));
for (const p of stuck.slice(0, 8)) line(`  at ${p.at} ms: took ${p.took} ms (${p.answer})`);
if (P) {
  line(`frames: ${frames.length} · median ${pct(0.5)} ms · 95th ${pct(0.95)} ms · worst ${pct(1)} ms`);
  line(`shaders: ${P.shaders} sources, ${Math.round(P.shaderBytes / 1024)} KB, largest ${Math.round(P.biggestShader / 1024)} KB · programs ${P.programs}`);
  line(`draws: ${P.draws} calls, ${Math.round(P.tris)} triangles` + (frames.length ? ` (${Math.round(P.draws / frames.length)} calls and ${Math.round(P.tris / frames.length)} triangles a frame)` : ''));
  line('time inside WebGL calls (ms total / calls / longest single call, when):');
  for (const [name, g] of Object.entries(P.gl).sort((a, b) => b[1].ms - a[1].ms).slice(0, 10)) line(`  ${name.padEnd(22)} ${String(Math.round(g.ms)).padStart(7)} / ${String(g.n).padStart(6)} / ${Math.round(g.max)} ms at ${g.maxAt}`);
} else {
  line(`page state: ${inPage?.error}`);
}
line('CPU profile, top self time (ms):');
for (const [ms, k] of profileTop.slice(0, 14)) line(`  ${String(ms).padStart(7)}  ${k}`);
line(`console errors and warnings: ${consoleLines.length}`);
for (const c of consoleLines.slice(0, 10)) line('  ' + c);
if (P) line(`page shows: buttons [${P.buttons.join(' | ')}]`);
line(`full report: ${out}`);
line('===== END REPORT =====');
process.exit(0);
