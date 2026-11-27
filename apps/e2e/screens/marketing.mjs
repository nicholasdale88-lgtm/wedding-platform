/* global process, console, document, window */
// Before/after screenshots of the marketing pages (send-10: marketing images and the sales-page fixes), at 390
// and 1280: the front page's hero, each preview section, pricing, the footer and the phone menu, /try and
// /designs. LABEL=after also photographs the sample's closed envelope in sales mode (/demo?embed=1&sales=1) at
// a phone's size, the still the previews use.
// Run by the Screens workflow for screens/marketing-<label> branches:
//   BASE=http://localhost:5173 LABEL=before OUT=../../docs/screens/marketing-01 node screens/marketing.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const LABEL = process.env.LABEL ?? 'shot';
const OUT = process.env.OUT ?? 'screens-out';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const SIZES = [
  [390, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }],
  [1280, { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }],
];
const shot = (page, name, w, full = false) => page.screenshot({ path: join(OUT, `${LABEL}-${name}-${w}.png`), fullPage: full });
const settle = async (page, ms = 1500) => {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
};
/** A section, scrolled to the top of the screen, photographed as the screen shows it. */
const section = async (page, sel, name, w) => {
  const el = page.locator(sel).first();
  if (!(await el.count())) return console.log(`no ${name} (${sel}) at ${w}`);
  await el.evaluate((n) => n.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(900);
  await shot(page, name, w);
};

for (const [w, opts] of SIZES) {
  const ctx = await browser.newContext({ ...opts, baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto('/');
  // The hero as it first shows, and again once the live invitation has loaded (it may open by itself).
  await settle(page, 600);
  await shot(page, 'home-hero', w);
  await page.waitForTimeout(5000);
  await shot(page, 'home-hero-later', w);
  await section(page, 'section[aria-labelledby="paper-or-phone"]', 'home-paper', w);
  await section(page, 'section[aria-labelledby="scenes"]', 'home-envelope', w);
  await section(page, 'section[aria-labelledby="after"]', 'home-after-yes', w);
  await section(page, '#pricing', 'home-pricing', w);
  await section(page, 'footer', 'home-footer', w);
  await shot(page, 'home-full', w, true);
  if (w === 390) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const menu = page.getByRole('button', { name: /menu/i }).first();
    if (await menu.count()) {
      await menu.click().catch(() => undefined);
      await page.waitForTimeout(700);
      await shot(page, 'home-menu', w);
    }
  }
  for (const [name, path] of [
    ['try', '/try'],
    ['designs', '/designs'],
  ]) {
    await page.goto(path);
    await settle(page);
    await shot(page, name, w);
  }
  await ctx.close();
}

// The one still: the sample's closed envelope, as the previews show it (2x, a phone's screen).
if (LABEL !== 'before') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto('/demo?embed=1&sales=1');
  await settle(page, 2500);
  await page.screenshot({ path: join(OUT, 'still-closed-390x844@2x.png') });
  await ctx.close();
}
await browser.close();
console.log('done');
