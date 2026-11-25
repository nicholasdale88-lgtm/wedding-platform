/* global process, console, document, window, PerformanceObserver, getComputedStyle */
// Before/after screenshots for a visual batch, and LCP on a throttled mid-range phone. Run by the Screens
// workflow (.github/workflows/screens.yml) against the built website:
//   BASE=http://localhost:5173 LABEL=before OUT=../../docs/screens/vs-phase1 node screens/capture.mjs
// Writes <label>-<page>-<width>.png and <label>-metrics.json into OUT.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_POSTER_HEAD, DEMO_POSTER_ROOT, wantsDemoPoster } from '../../web/poster.js';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const LABEL = process.env.LABEL ?? 'shot';
const OUT = process.env.OUT ?? 'screens-out';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const metrics = { label: LABEL, at: new Date().toISOString(), lcp: {}, overflow: {}, demo: {} };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' };
const DESK = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' };
const file = (name) => join(OUT, `${LABEL}-${name}.png`);

/** What the live site's middleware adds to /demo's HTML (vite preview doesn't run Pages Functions). */
async function likeTheLiveSite(ctx) {
  await ctx.route('**/demo*', async (route) => {
    const req = route.request();
    if (req.resourceType() !== 'document' || !wantsDemoPoster(req.url())) return route.continue();
    const res = await route.fetch();
    const html = (await res.text()).replace('</head>', `${DEMO_POSTER_HEAD}</head>`).replace('<div id="root">', `<div id="root">${DEMO_POSTER_ROOT}`);
    await route.fulfill({ response: res, body: html });
  });
}

async function settle(page, ms = 2500) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}
async function overflow(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const r = document.querySelector('[aria-label="Open invitation"]');
    return { doc: [d.scrollWidth, d.clientWidth], invite: r ? [r.scrollWidth, r.clientWidth] : null };
  });
}

// Viewport shots at 390 and 1280.
for (const [name, path] of [
  ['home', '/'],
  ['designs', '/designs'],
  ['try', '/try'],
  ['demo-closed', '/demo'],
]) {
  for (const [w, opts] of [
    [390, PHONE],
    [1280, DESK],
  ]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await settle(page);
    await page.screenshot({ path: file(`${name}-${w}`) });
    metrics.overflow[`${name}-${w}`] = await overflow(page);
    await ctx.close();
  }
}

// The sample invitation opened, at 390 and 1280: the card, Add to calendar, the decline row, the timeline.
for (const [w, opts] of [
  [390, PHONE],
  [1280, DESK],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await settle(page, 1200);
  await page.locator('[aria-label="Open invitation"]').click({ position: { x: 20, y: 300 } }).catch(() => undefined);
  await page.waitForTimeout(7000);
  await page.screenshot({ path: file(`demo-open-${w}`) });
  const spots = {
    calendar: '#inv-scroll >> text=/add to calendar/i',
    decline: '#inv-scroll >> text=/can.t make it/i',
    timeline: '#inv-scroll section[data-screen-label="03 Timeline"]',
  };
  const seen = {};
  for (const [spot, sel] of Object.entries(spots)) {
    const el = page.locator(sel).first();
    if (!(await el.count())) {
      seen[spot] = 'not found';
      continue;
    }
    await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(900);
    await page.screenshot({ path: file(`demo-${spot}-${w}`) });
    // What floats over it: the sample bar, the Music control, the scroll cue.
    seen[spot] = await el.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const target = { top: Math.max(r.top, 0), bottom: Math.min(r.bottom, window.innerHeight), left: r.left, right: r.right };
      const chrome = [...document.querySelectorAll('[data-sample-banner], button, #inv-cue')].filter((c) => {
        if (c.closest('#inv-scroll')) return false;
        const s = getComputedStyle(c);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
        return c.matches('[data-sample-banner], #inv-cue') || /music/i.test(c.textContent ?? '') || /music/i.test(c.getAttribute('aria-label') ?? '');
      });
      const over = chrome
        .map((c) => ({ c, b: c.getBoundingClientRect() }))
        .filter(({ b }) => b.width && b.top < target.bottom && b.bottom > target.top && b.left < target.right && b.right > target.left)
        .map(({ c }) => c.getAttribute('aria-label') || c.textContent?.trim().slice(0, 30) || c.tagName);
      return { box: [Math.round(r.top), Math.round(r.bottom)], coveredBy: over };
    });
  }
  metrics.demo[w] = seen;
  metrics.overflow[`demo-open-${w}`] = await overflow(page);
  await ctx.close();
}

// LCP on a mid-range phone (Lighthouse's mobile: 4x slower CPU, 1.6 Mbps, 150 ms), the median of three loads.
for (const [name, path] of [
  ['home', '/'],
  ['demo', '/demo'],
  ['designs', '/designs'],
]) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext(PHONE);
    await likeTheLiveSite(ctx);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__lcp = 0;
      window.__lcpEl = '';
      window.__lcpAll = [];
      document.addEventListener('DOMContentLoaded', () => {
        window.__poster = !!document.querySelector('[data-demo-poster]');
      });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = Math.round(e.startTime);
      }).observe({ type: 'paint', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__lcp = e.startTime;
          window.__lcpAll.push(`${Math.round(e.startTime)} ${e.element?.tagName ?? e.url}`);
          window.__lcpEl = `${e.element?.tagName ?? ''} ${(e.element?.textContent ?? e.url ?? '').trim().slice(0, 40)}`;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForTimeout(4000);
    runs.push(await page.evaluate(() => ({ ms: Math.round(window.__lcp), el: window.__lcpEl, all: window.__lcpAll, poster: window.__poster, fcp: window.__fcp })));
    await ctx.close();
  }
  runs.sort((a, b) => a.ms - b.ms);
  metrics.lcp[name] = { median: runs[1].ms, element: runs[1].el, runs: runs.map((r) => r.ms), detail: runs[1] };
}

await browser.close();
writeFileSync(join(OUT, `${LABEL}-metrics.json`), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
