#!/usr/bin/env node
/**
 * Headless screenshot harness — render exact creatures/views from the running dev server.
 *
 *   npm run dev                      # in another terminal (http://localhost:5180)
 *   node scripts/shoot.mjs out/ "seed=3&morph=felid&skin=hybrid&bare=1&spin=0&view=side" ...
 *
 * Each argument after the output dir is a URL query string (see src/main.tsx for the dev params:
 * seed, morph, sym, skin, view=front|side, head=1, bare=1, spin=0, studio=1, bestiary=1). One PNG is
 * written per query, named after it. Env: BASE (server URL), W/H (viewport), WAIT (ms to settle),
 * PLAYWRIGHT_MODULE (path to a playwright install if it isn't resolvable from here).
 *
 * WebGL in headless Chromium runs on SwiftShader (software GL) — slow but deterministic.
 */
import fs from 'node:fs';
import path from 'node:path';

const pw = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright').catch(() => {
  console.error('playwright not found — `npm i -D playwright`, or set PLAYWRIGHT_MODULE to its entry file');
  process.exit(1);
});
const { chromium } = pw.default ?? pw;

const [outdir, ...queries] = process.argv.slice(2);
if (!outdir || queries.length === 0) {
  console.error('usage: node scripts/shoot.mjs <outdir> <query> [query ...]');
  process.exit(1);
}
fs.mkdirSync(outdir, { recursive: true });
const base = process.env.BASE ?? 'http://localhost:5180/';
const w = Number(process.env.W ?? 640);
const h = Number(process.env.H ?? 480);
const wait = Number(process.env.WAIT ?? 2500);

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

for (const q of queries) {
  const url = base + (base.includes('?') ? '&' : '?') + q;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(wait);
  const name = q.replace(/[^a-z0-9=_-]+/gi, '_').slice(0, 120) + '.png';
  await page.screenshot({ path: path.join(outdir, name) });
  console.log('shot', name);
}
if (errors.length) console.log('console errors:\n' + errors.slice(0, 10).join('\n'));
await browser.close();
