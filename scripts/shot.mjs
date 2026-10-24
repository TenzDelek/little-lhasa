#!/usr/bin/env node
// Headless screenshot of the running game (dev server must be up, default http://localhost:5179).
//
//   node scripts/shot.mjs --spot templeGate --out shots/temple.png
//   node scripts/shot.mjs --x 12 --z -40 --az 2 --night --out shots/amala-night.png
//   node scripts/shot.mjs --spot maniLhakhang --cam chase --yaw 3.1 --out shots/chase.png
//   node scripts/shot.mjs --spot spawn --colliders --out shots/col.png
//
// Flags: --spot NAME | --x N --z N, --yaw RAD, --cam iso|chase, --az 0..3, --zoom 0..4, --night, --colliders,
//        --kit (kit showroom), --q "k=v&k2=v2" (extra page params), --w 1280 --h 800, --url http://localhost:5179, --out PATH (default shots/shot.png)
// Prints console errors / warnings from the page so you can catch shader or runtime problems.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
  opt[k] = v;
}
const base = opt.url ?? 'http://localhost:5179';
const q = new URLSearchParams({ shot: '1' });
for (const k of ['spot', 'x', 'z', 'yaw', 'cam', 'az', 'zoom']) if (opt[k] !== undefined) q.set(k, opt[k]);
if (opt.night) q.set('night', '1');
if (opt.colliders) q.set('colliders', '1');
if (opt.kit) q.set('kit', '1');
// --q "a=1&b=2" passes extra query parameters through to the page
if (opt.q) for (const [k, v] of new URLSearchParams(opt.q)) q.set(k, v);
const out = opt.out ?? 'shots/shot.png';
const w = Number(opt.w ?? 1280), h = Number(opt.h ?? 800);

const exe = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal'],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const url = `${base}/?${q}`;
try {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: Number(opt.timeout ?? 90000) });
  await page.waitForTimeout(Number(opt.wait ?? 400));
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  const backend = await page.evaluate(() => (navigator.gpu ? 'webgpu-capable' : 'webgl-fallback'));
  console.log(`saved ${out}  (${url}, ${backend})`);
} catch (e) {
  console.error(`FAILED ${url}: ${e.message}`);
  process.exitCode = 1;
} finally {
  const uniq = [...new Set(logs)].filter((l) => !l.includes('THREE.Clock') && !l.includes('React DevTools'));
  if (uniq.length) console.log('page console:\n' + uniq.slice(0, 40).join('\n'));
  await browser.close();
}
