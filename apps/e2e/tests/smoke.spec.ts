import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Release-gate smoke tests, at a 375px phone and on a computer (projects smoke-phone and smoke-desktop):
 * a guest opens the envelope, replies and adds the day to their calendar; the couple's dashboard; the
 * vendor portal; and Photos → Where photos are saved. Each fails on a page error, a console error, a
 * server error (5xx) or the page scrolling sideways.
 */
const API_DIR = fileURLToPath(new URL('../../api', import.meta.url));
let n = 0;
const ip = () => `10.9.${++n % 250}.${Date.now() % 250}`;

test.beforeEach(async ({ page }, info) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    // A refused request (401/404) is logged by the browser as a console error; those are checked as
    // responses below (only a 5xx fails). Everything else the app logs as an error fails the test.
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) problems.push(`console error: ${m.text().slice(0, 300)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} from ${r.url()}`);
  });
  (info as unknown as { problems: string[] }).problems = problems;
});
test.afterEach(async ({ page }, info) => {
  const problems = (info as unknown as { problems: string[] }).problems;
  if (!page.isClosed()) problems.push(...(await overflow(page)));
  expect(problems, 'errors or sideways scrolling').toEqual([]);
});

/** The page never scrolls sideways (one pixel of rounding allowed). */
async function overflow(page: Page): Promise<string[]> {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
  return wide > 1 ? [`${page.url()} scrolls sideways by ${wide}px`] : [];
}

/** A throwaway local wedding, signed in on this page's browser, with paid-for guest pages. */
async function couple(page: Page, guests: { people: string[] }[] = []) {
  const email = `smoke-${Date.now()}-${++n}@example.com`;
  const res = await page.request.post('/api/a/signup', {
    headers: { 'CF-Connecting-IP': ip() },
    data: { firstName: 'Harriet', partnerName: 'Theo', email, passcode: 'smoke-passcode-123', date: '2027-04-17', guests: 40 },
  });
  expect(res.status(), await res.text()).toBe(200);
  const b = (await res.json()) as { weddingId: string; weddings: { id: string; slug: string }[] };
  const wid = b.weddingId;
  const slug = b.weddings.find((w) => w.id === wid)!.slug;
  execSync(`pnpm exec wrangler d1 execute DB --local --command "UPDATE wedding SET plan = 'essentials' WHERE id = '${wid}'"`, { cwd: API_DIR, stdio: 'pipe' });
  let links: Record<string, string> = {};
  if (guests.length) {
    const imp = await page.request.post(`/api/a/w/${wid}/guests/import`, { data: { rows: guests } });
    expect(imp.status(), await imp.text()).toBe(200);
    links = ((await (await page.request.get(`/api/a/w/${wid}/guests`)).json()) as { links: Record<string, string> }).links;
  }
  return { wid, slug, links: Object.values(links).map((u) => new URL(u)) };
}

test('a guest opens the envelope, replies, and adds the day to their calendar', async ({ page }) => {
  const w = await couple(page, [{ people: ['Robin Hart'] }]);
  const link = w.links[0]!;
  // As the guest: their own link, in a browser that isn't signed in.
  await page.context().clearCookies();
  await page.goto(`${link.pathname}${link.search}`);
  await page.getByRole('button', { name: 'Open invitation' }).click();
  await expect(page.getByText(/^Dear Robin/).first()).toBeVisible({ timeout: 20_000 });

  await page.getByText("Yes, I'll be there").first().click();
  await page.getByText('Send RSVP').click();
  await expect(page.getByText('We have your reply and cannot wait to celebrate with you.')).toBeVisible();

  await page.getByRole('button', { name: 'Add to calendar' }).first().click();
  const google = page.getByRole('link', { name: 'Google Calendar' }).first();
  await expect(google).toHaveAttribute('href', /^https:\/\/calendar\.google\.com\/calendar\/render\?.*dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z.*ctz=/);
  await expect(page.getByRole('link', { name: 'Outlook.com' }).first()).toHaveAttribute('href', /^https:\/\/outlook\.live\.com\//);
  const ics = await page.getByRole('link', { name: 'Apple Calendar' }).first().getAttribute('href');
  const file = await page.request.get(ics!);
  expect(file.status()).toBe(200);
  expect(await file.text()).toMatch(/^BEGIN:VCALENDAR[\s\S]*BEGIN:VTIMEZONE[\s\S]*DTSTART;TZID=/);
});

test('the couple’s dashboard opens with their wedding', async ({ page }) => {
  const w = await couple(page, [{ people: ['Robin Hart'] }, { people: ['Jo Banks', 'Sam Banks'] }]);
  await page.goto(`/admin/${w.wid}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByText(/Harriet/).first()).toBeVisible();
});

test('Photos: where photos are saved, with Connect Google Drive and Connect Dropbox as big taps', async ({ page }) => {
  const w = await couple(page);
  await page.goto(`/admin/${w.wid}/photos`);
  await expect(page.getByRole('heading', { name: 'Where photos are saved' })).toBeVisible();
  for (const name of ['Connect Google Drive', 'Connect Dropbox']) {
    const b = page.getByRole('button', { name });
    await expect(b).toBeVisible();
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  }
  await expect(page.getByRole('button', { name: /Google Photos/ })).toHaveCount(0);
});

test('the vendor portal opens for a new vendor', async ({ page }) => {
  const name = `Smoke Florals ${Date.now() % 100000}`;
  const res = await page.request.post('/api/directory/join', {
    headers: { 'CF-Connecting-IP': ip() },
    data: { name, category: 'florist', region: 'sydney', regions: [], contactName: 'Jess Lee', phone: '0400 000 000', website: '', instagram: '', about: '', priceFrom: 0, photos: [], email: `smoke-vendor-${Date.now()}-${n}@example.com`, passcode: 'smoke-passcode-123', company: '' },
  });
  expect(res.status(), await res.text()).toBe(200);
  await page.goto('/vendors/me');
  await expect(page.getByText(name).first()).toBeVisible();
});
