/* global process, console, document */
// Before/after screenshots of the couple's admin, the vendor portal and the sales pricing (the launch
// simplification batch), at 390 and 1280. A throwaway couple and vendor are signed up on the local API.
// Run by the Screens workflow for screens/simplify-<label> branches:
//   BASE=http://localhost:5173 LABEL=before OUT=../../docs/screens/simplify-01 node screens/simplify.mjs
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
const shot = (page, name, w) => page.screenshot({ path: join(OUT, `${LABEL}-${name}-${w}.png`) });
const settle = async (page, ms = 1800) => {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
};
let n = 0;

for (const [w, opts] of SIZES) {
  // The couple.
  n += 1;
  const ctx = await browser.newContext({ ...opts, baseURL: BASE });
  const page = await ctx.newPage();
  const res = await page.request.post('/api/a/signup', {
    headers: { 'CF-Connecting-IP': `10.9.${n}.${Date.now() % 250}` },
    data: { firstName: 'Harriet', partnerName: 'Theo', email: `screens-${Date.now()}-${n}@example.com`, passcode: 'screens-pass-123', date: '2027-03-20', guests: 80 },
  });
  if (res.status() !== 200) throw new Error(`signup ${res.status()} ${await res.text()}`);
  const wid = (await res.json()).weddingId;
  await page.goto(`/admin/${wid}`);
  await settle(page);
  await shot(page, 'admin-home', w);
  if (w === 390) {
    const menu = page.getByRole('button', { name: /menu/i }).first();
    if (await menu.count()) {
      await menu.click().catch(() => undefined);
      await page.waitForTimeout(700);
      await shot(page, 'admin-menu', w);
    }
  }
  for (const [name, path] of [
    ['admin-settings', `/admin/${wid}/all/settings`],
    ['admin-invitation', `/admin/${wid}/wedding/pages`],
    ['admin-guests', `/admin/${wid}/wedding/guests`],
  ]) {
    await page.goto(path);
    await settle(page);
    await shot(page, name, w);
  }
  await ctx.close();

  // The public pricing and the trial.
  const pub = await browser.newContext({ ...opts, baseURL: BASE });
  const p2 = await pub.newPage();
  await p2.goto('/');
  await settle(p2);
  await shot(p2, 'sales-home', w);
  await p2.evaluate(() => document.getElementById('pricing')?.scrollIntoView({ block: 'start' }));
  await p2.waitForTimeout(600);
  await shot(p2, 'sales-pricing', w);
  await p2.goto('/try');
  await settle(p2);
  await shot(p2, 'try', w);
  await pub.close();

  // A vendor.
  const vctx = await browser.newContext({ ...opts, baseURL: BASE });
  const v = await vctx.newPage();
  const j = await v.request.post('/api/directory/join', {
    headers: { 'CF-Connecting-IP': `10.8.${n}.${Date.now() % 250}` },
    data: { name: 'Wildflower Studio', category: 'florist', region: 'sydney', regions: [], contactName: 'Jess', phone: '', website: '', instagram: '', about: '', priceFrom: 0, photos: [], email: `vendor-${Date.now()}-${n}@example.com`, passcode: 'long-enough-1', company: '' },
  });
  if (j.status() === 200) {
    await v.goto('/vendors/me');
    await settle(v);
    await shot(v, 'vendor-home', w);
  } else console.log(`vendor join ${j.status()}`);
  await vctx.close();
}
await browser.close();
console.log('done');
