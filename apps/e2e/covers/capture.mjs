// The designs' cover stills: each design's closed envelope, photographed from the real sample invitation
// (/demo?embed=1&cover=1&theme=…: Harriet & Theo on the envelope, their H&T seal), saved as a small JPEG in
// apps/web/public/covers/<slug>.jpg for the galleries. Run in CI (the "covers" job) against the dev server:
//   BASE=http://localhost:5173 node apps/e2e/covers/capture.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../web/public/covers');
const MAX = 30 * 1024;
/** The same slug the web app uses (apps/web/src/guest/covers.ts). */
const slug = (n) => n.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
// A phone-shaped frame at 2x, then scaled down: crisp lines in a small file.
const page = await browser.newPage({ viewport: { width: 300, height: 400 }, deviceScaleFactor: 1.5, reducedMotion: 'no-preference' });
await page.goto(`${BASE}/demo?embed=1&cover=1`, { waitUntil: 'networkidle' });
const names = JSON.parse((await page.locator('html').getAttribute('data-themes')) ?? '[]');
if (!names.length) throw new Error('No design names on the cover page');
const made = new Set();
const problems = [];
for (const name of names) {
  const file = `${slug(name)}.jpg`;
  made.add(file);
  await page.goto(`${BASE}/demo?embed=1&cover=1&theme=${encodeURIComponent(name)}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Let the closed state settle (the seal's first glint, the scene's light).
  await page.waitForTimeout(1600);
  let buf;
  for (const quality of [74, 64, 54, 44]) {
    buf = await page.screenshot({ type: 'jpeg', quality });
    if (buf.length <= MAX) break;
  }
  if (buf.length > MAX) problems.push(`${name}: ${buf.length} bytes`);
  writeFileSync(join(OUT, file), buf);
  console.log(`${file} ${Math.round(buf.length / 1024)} KB`);
}
// Designs that no longer exist lose their cover.
for (const f of readdirSync(OUT)) if (f.endsWith('.jpg') && !made.has(f)) unlinkSync(join(OUT, f));
await browser.close();
const total = readdirSync(OUT).reduce((a, f) => a + statSync(join(OUT, f)).size, 0);
console.log(`${made.size} covers, ${Math.round(total / 1024)} KB in all`);
if (problems.length) {
  console.log(`::error::Covers over 30 KB: ${problems.join('; ')}`);
  process.exit(1);
}
