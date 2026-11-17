import { expect, test, type Page } from '@playwright/test';

/**
 * Release-gate layout checks for the public pages, on a 390px phone (smoke-phone, resized) and a computer
 * (smoke-desktop): a clean console (no errors at all, and no refused /api requests such as a signed-out
 * 401), nothing scrolling sideways, every header link reachable (a menu on the phone), the sample's
 * banner never cut off, the scroll hint never over the content, and Add to calendar on the sample.
 */
const PAGES = ['/', '/demo', '/vendors', '/vendors/join'];

async function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text().slice(0, 300)}`);
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) problems.push(`${r.status()} from ${new URL(r.url()).pathname}`);
  });
  return problems;
}
const phone = (name: string) => name === 'smoke-phone';
async function sideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
/** Elements in the header that stick out past the screen's edge. */
async function offscreen(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('header a, header button')]
      .filter((el) => getComputedStyle(el).display !== 'none' && (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ text: (el.textContent ?? '').trim(), r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && (x.r.right > window.innerWidth + 1 || x.r.left < -1))
      .map((x) => x.text),
  );
}

test.beforeEach(async ({ page }, info) => {
  if (phone(info.project.name)) await page.setViewportSize({ width: 390, height: 844 });
});

for (const path of PAGES) {
  test(`${path}: a clean console, nothing sideways, the header all on screen`, async ({ page }) => {
    const problems = await watch(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    if (path === '/demo') {
      await page.getByRole('button', { name: 'Open invitation' }).click();
      await expect(page.getByRole('button', { name: 'Add to calendar' }).first()).toBeAttached({ timeout: 20_000 });
    }
    expect(await sideways(page), 'scrolls sideways').toBeLessThanOrEqual(1);
    expect(await offscreen(page), 'header items off the screen').toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('front page header: every link reachable, through a menu on a phone', async ({ page }, info) => {
  const problems = await watch(page);
  await page.goto('/');
  const header = page.locator('header').first();
  if (!phone(info.project.name)) {
    for (const name of ['Pricing', 'Vendor directory', 'Sign in', 'Get started']) await expect(header.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Menu' })).toBeHidden();
  } else {
    const menu = header.getByRole('button', { name: 'Menu' });
    await expect(menu).toBeVisible();
    expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await menu.click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();
    for (const name of ['Pricing', 'Vendor directory', 'Sign in', 'Get started']) await expect(sheet.getByRole('link', { name, exact: true })).toBeVisible();
    // Focus is inside and stays inside; Escape closes it and puts focus back on Menu.
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(menu).toBeFocused();
    // Choosing a link closes it and goes there.
    await menu.click();
    await sheet.getByRole('link', { name: 'Vendor directory' }).click();
    await expect(page).toHaveURL(/\/vendors$/);
    await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
  }
  expect(problems).toEqual([]);
});

test('the sample: its banner is never cut off, the scroll hint never covers the page, and Add to calendar works', async ({ page }) => {
  const problems = await watch(page);
  await page.goto('/demo');
  const note = page.locator('[data-sample-banner] span').first();
  await expect(note).toContainText('A sample. Replies aren’t saved.');
  const cut = await note.evaluate((el) => ({ clipped: el.scrollWidth > el.clientWidth + 1, ellipsis: getComputedStyle(el).textOverflow === 'ellipsis' }));
  expect(cut).toEqual({ clipped: false, ellipsis: false });

  await page.getByRole('button', { name: 'Open invitation' }).click();
  const add = page.getByRole('button', { name: 'Add to calendar' }).first();
  await add.scrollIntoViewIfNeeded({ timeout: 20_000 });
  // The time, in the wedding's own timezone.
  await expect(page.locator('[data-add-to-calendar] p').first()).toContainText(/AEDT \(Sydney time\)/);
  await add.click();
  const list = page.getByRole('list', { name: /to your calendar/ }).first();
  await expect(list.getByRole('link', { name: 'Google Calendar' })).toHaveAttribute('href', /calendar\.google\.com\/calendar\/render\?.*dates=20270320T030000Z%2F20270320T090000Z.*ctz=Australia%2FSydney/);
  await expect(list.getByRole('link', { name: 'Apple Calendar' })).toHaveAttribute('href', /^data:text\/calendar/);
  await expect(list.getByRole('link', { name: 'Outlook.com' })).toHaveAttribute('href', /^https:\/\/outlook\.live\.com\/calendar\/.*startdt=2027-03-20T14%3A00%3A00%2B11%3A00/);
  await expect(list.getByRole('link', { name: 'Office 365' })).toHaveAttribute('href', /^https:\/\/outlook\.office\.com\//);
  const download = list.getByRole('link', { name: 'Download .ics' });
  await expect(download).toHaveAttribute('download', /\.ics$/);
  const ics = decodeURIComponent((await download.getAttribute('href'))!.replace(/^data:text\/calendar;charset=utf-8,/, ''));
  expect(ics).toContain('DTSTART;TZID=Australia/Sydney:20270320T140000');
  for (const l of await list.getByRole('link').all()) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);

  // Scrolled all the way down: no floating hint over the FAQ.
  await page.locator('#inv-scroll').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(700);
  const cue = await page.locator('#inv-cue').evaluate((el) => ({ op: getComputedStyle(el).opacity, pe: getComputedStyle(el).pointerEvents }));
  expect(cue).toEqual({ op: '0', pe: 'none' });
  expect(await sideways(page)).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});
