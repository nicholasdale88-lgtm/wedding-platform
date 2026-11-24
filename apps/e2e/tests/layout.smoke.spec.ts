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

test('vendor pages: every header link is an easy tap (44px or more)', async ({ page }) => {
  await page.goto('/vendors');
  const links = page.locator('header a');
  await expect(links.first()).toBeVisible();
  for (const l of await links.all()) if (await l.isVisible()) expect((await l.boundingBox())!.height, (await l.textContent()) ?? '').toBeGreaterThanOrEqual(43.5);
});

test('/pricing goes to the pricing on the front page, not "not found"', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page).toHaveURL(/\/#pricing$/);
  await expect(page.locator('#pricing')).toBeAttached();
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

// OneDrive isn't switched on yet, so no page a visitor can reach claims it (Google Drive and Dropbox are live).
test('visitor pages only promise the photo storage that works', async ({ page }) => {
  for (const path of ['/', '/try', '/privacy', '/terms', '/vendors']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const text = await page.evaluate(() => document.documentElement.innerHTML);
    expect(text, path).not.toMatch(/one\s?drive/i);
  }
  await page.goto('/');
  await expect(page.getByText('Photos and backups save to your own Google Drive or Dropbox').first()).toBeAttached();
});

test('the sample night-before forecast reads "0% rain", never "0%% rain"', async ({ page }) => {
  await page.goto('/demo/tomorrow');
  await expect(page.getByText(/^\d+% rain$/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/%%/)).toHaveCount(0);
});

test('the sample vendor account: See your page and Sign out are easy taps (44px or more)', async ({ page }, info) => {
  await page.goto('/vendors/me?sample=1');
  // On a phone they're under More.
  if (phone(info.project.name)) await page.getByRole('navigation', { name: 'Quick menu' }).getByRole('button', { name: 'More' }).click();
  for (const el of [page.getByRole('link', { name: 'See your page' }), page.getByRole('button', { name: 'Sign out' })]) {
    await expect(el).toBeVisible({ timeout: 20_000 });
    expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  }
});

test('a guest’s invitation never downloads the sample app or the planner’s form rules (about 23 KB it didn’t need)', async ({ page }) => {
  const scripts: string[] = [];
  page.on('response', (r) => {
    if (/\.js(\?|$)/.test(r.url())) scripts.push(new URL(r.url()).pathname);
  });
  await page.goto('/demo');
  await expect(page.getByText('Not you?').first()).toBeAttached({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((s) => /\/(planner|demo)-[^/]*\.js$/.test(s))).toEqual([]);
});

test('the sample app still answers in the browser (its answers load when it opens)', async ({ page }) => {
  const problems = await watch(page);
  await page.addInitScript(() => localStorage.setItem('yl.trial', '1'));
  await page.goto('/admin/demo/wedding/guests');
  await expect(page.getByText('Priya Nair').first()).toBeVisible({ timeout: 20_000 });
  expect(problems).toEqual([]);
});

test('the sample app: Help opens Help (it used to land back on the overview)', async ({ page }) => {
  const problems = await watch(page);
  await page.addInitScript(() => localStorage.setItem('yl.trial', '1'));
  await page.goto('/admin/demo/wedding/overview');
  await page.getByRole('link', { name: 'Help', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe('/admin/demo/account/help');
  expect(problems).toEqual([]);
});

test('front page questions: each whole row opens its answer (44px or more), not just the words', async ({ page }) => {
  await page.goto('/');
  const q = page.locator('summary', { hasText: 'Is it a subscription?' });
  await q.scrollIntoViewIfNeeded();
  expect((await q.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await q.click({ position: { x: 4, y: 4 } });
  await expect(page.getByText('Nothing renews.', { exact: false }).first()).toBeVisible();
});

test('front page sign-up: "Already have one? Sign in" is a 44px tap', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('form').getByRole('link', { name: 'Sign in', exact: true });
  await link.scrollIntoViewIfNeeded();
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});

test('the sample vendor account: no card runs past the edge of the screen (Needs you and Coming up were cut off on a phone)', async ({ page }) => {
  await page.goto('/vendors/me?sample=1');
  await expect(page.getByRole('region', { name: 'Needs you' })).toBeVisible({ timeout: 20_000 });
  const past = await page.evaluate(() =>
    [...document.querySelectorAll('main section')]
      .map((el) => ({ label: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 30), r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > window.innerWidth + 1)
      .map((x) => `${x.label}: ${Math.round(x.r.right)}px`),
  );
  expect(past).toEqual([]);
});

test('the sample message board: a tap just above or below Reply still hits it (a 44px target)', async ({ page }) => {
  await page.goto('/demo/board');
  const reply = page.getByRole('button', { name: 'Reply', exact: true }).first();
  await expect(reply).toBeVisible({ timeout: 20_000 });
  await reply.scrollIntoViewIfNeeded();
  const hits = await reply.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    return [r.top - 8, r.bottom + 8].map((y) => document.elementFromPoint(x, y)?.closest('button') === el);
  });
  expect(hits).toEqual([true, true]);
});

test('the sample app overview: "Add them" and "Set it up" take a tap just above or below the words', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yl.trial', '1'));
  await page.goto('/admin/demo/wedding/overview');
  for (const name of ['Add them', 'Set it up']) {
    const b = page.getByRole('button', { name, exact: true }).first();
    await expect(b).toBeVisible({ timeout: 20_000 });
    await b.scrollIntoViewIfNeeded();
    const hits = await b.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      return [r.top - 9, r.bottom + 9].map((y) => document.elementFromPoint(x, y)?.closest('button') === el);
    });
    expect(hits, name).toEqual([true, true]);
  }
});

test('the vendor account wears their look: a side menu on a computer, a bottom bar and More on a phone', async ({ page }, info) => {
  const problems = await watch(page);
  await page.goto('/vendors/me?sample=1');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeAttached();
  if (!phone(info.project.name)) {
    const side = page.getByRole('navigation', { name: 'Your vendor account' });
    await expect(side).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Quick menu' })).toBeHidden();
    await side.getByRole('button', { name: 'Your look' }).click();
  } else {
    const bar = page.getByRole('navigation', { name: 'Quick menu' });
    await expect(bar).toBeVisible();
    for (const b of await bar.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await bar.getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'Your vendor account' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await bar.getByRole('button', { name: 'More' }).click();
    await sheet.getByRole('button', { name: 'Your look' }).click();
    await expect(sheet).toBeHidden();
  }
  await expect(page).toHaveURL(/tab=look/);
  await expect(page.getByRole('heading', { name: 'Your look', level: 1 })).toBeVisible();
  // A colour set shows straight away; Save keeps it; hiding a place takes it out of the menu.
  await page.getByRole('radio', { name: 'Ocean' }).click();
  await expect(page.getByRole('radio', { name: 'Ocean' })).toHaveAttribute('aria-checked', 'true');
  const proposals = page.getByRole('listitem').filter({ hasText: 'Proposals' }).getByRole('button', { name: 'In the menu' });
  await proposals.click();
  await page.getByRole('button', { name: 'Save your look' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  if (!phone(info.project.name)) await expect(page.getByRole('navigation', { name: 'Your vendor account' }).getByRole('button', { name: 'Proposals' })).toHaveCount(0);
  expect(await sideways(page), 'scrolls sideways').toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('Sentinel retest: vendor links, /try and the demo bar are 44px taps; the sample shows no [placeholders]', async ({ page }, info) => {
  const tall = async (loc: ReturnType<Page['locator']>, what: string) => {
    await loc.scrollIntoViewIfNeeded();
    expect((await loc.boundingBox())!.height, what).toBeGreaterThanOrEqual(43.5);
  };
  await page.goto('/');
  const foot = page.locator('footer').last();
  await tall(foot.getByRole('link', { name: 'Vendor directory', exact: true }), 'footer Vendor directory');
  await tall(foot.getByRole('link', { name: 'Wedding vendor? List your business free' }), 'footer List your business');
  if (!phone(info.project.name)) await tall(page.locator('header').first().getByRole('link', { name: 'Vendor directory', exact: true }), 'header Vendor directory');
  await page.goto('/vendors/join');
  await tall(page.locator('summary', { hasText: 'Also travel to' }), 'Also travel to');
  await page.locator('summary', { hasText: 'Also travel to' }).click();
  await tall(page.locator('details label').first(), 'a region checkbox');
  await tall(page.getByRole('button', { name: '+ Add a package' }), '+ Add a package');
  // /try: the stale error clears once the name is in; every link a 44px tap; Terms is there.
  await page.goto('/try');
  await page.getByRole('button', { name: 'Start my free trial' }).click();
  await expect(page.getByRole('alert')).toHaveText('Please add your first name.');
  await page.getByLabel('Your first name').fill('Harriet');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await tall(page.getByRole('link', { name: 'The Yes List' }).first(), '/try wordmark');
  await tall(page.getByRole('link', { name: 'Privacy' }), '/try Privacy');
  await tall(page.getByRole('link', { name: 'Terms' }), '/try Terms');
  // The sample app's bar.
  await page.addInitScript(() => localStorage.setItem('yl.trial', '1'));
  await page.goto('/admin/demo/wedding/overview');
  const bar = page.getByRole('region', { name: 'Sample wedding' });
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await tall(bar.getByRole('link', { name: 'Back to The Yes List' }), 'demo Back');
  for (const r of await bar.getByRole('radio').all()) await tall(r, 'plan pill');
  await tall(bar.getByRole('link', { name: /Start/ }), 'Start yours');
  if (phone(info.project.name)) {
    await expect(bar.getByText('Sample, nothing is sent')).toBeVisible();
    const share = page.getByRole('button', { name: 'Share the invitation' });
    const box = (await share.boundingBox())!;
    expect(box.x + box.width, 'Share the invitation fits').toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  // No [placeholder] in what a guest reads on the sample invitation.
  await page.goto('/demo');
  await expect(page.getByRole('button', { name: 'Open invitation' })).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => document.body.innerText.includes('['))).toBe(false);
});

test('VS-02: on the sample, the bar and Music never cover the card, the reply or the timeline; the invitation never widens', async ({ page }) => {
  const problems = await watch(page);
  await page.goto('/demo');
  // The bar's taps are 44px.
  for (const link of await page.locator('[data-sample-banner] a, [data-sample-banner] button').all()) {
    expect((await link.boundingBox())!.height, (await link.textContent()) ?? '').toBeGreaterThanOrEqual(44);
  }
  // The closed envelope's seal area is below the bar.
  const bar = (await page.locator('[data-sample-banner]').boundingBox())!;
  const frame = (await page.locator('.yl-sample').boundingBox())!;
  expect(frame.y, 'the invitation starts below the bar').toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  await page.getByRole('button', { name: 'Open invitation' }).click();
  await expect(page.getByRole('button', { name: 'Add to calendar' }).first()).toBeAttached({ timeout: 20_000 });
  await page.waitForTimeout(4500);
  const covered = async (sel: string) => {
    const el = page.locator(sel).first();
    await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    return el.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const t = { top: Math.max(r.top, 0), bottom: Math.min(r.bottom, window.innerHeight) };
      return [...document.querySelectorAll('[data-sample-banner], button, #inv-cue')]
        .filter((c) => !c.closest('#inv-scroll') && !c.closest('[data-sample-banner] *'))
        .filter((c) => {
          const s = getComputedStyle(c);
          return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && (c.matches('[data-sample-banner], #inv-cue') || /music/i.test(`${c.textContent} ${c.getAttribute('aria-label')}`));
        })
        .filter((c) => {
          const b = c.getBoundingClientRect();
          return b.width > 0 && b.top < t.bottom && b.bottom > t.top && b.left < r.right && b.right > r.left;
        })
        .map((c) => (c.getAttribute('aria-label') || c.textContent || c.tagName).trim().slice(0, 30));
    });
  };
  expect(await covered('#inv-scroll [data-add-to-calendar]'), 'Add to calendar').toEqual([]);
  expect(await covered('#inv-scroll >> text=/can.t make it/i'), 'the decline reply').toEqual([]);
  expect(await covered('#inv-scroll section[data-screen-label="03 Timeline"] h2, #inv-scroll section[data-screen-label="03 Timeline"] div'), 'the timeline').toEqual([]);
  const wide = await page.evaluate(() => {
    const r = document.querySelector('[aria-label="Open invitation"]')!;
    return [r.scrollWidth, r.clientWidth, document.documentElement.scrollWidth, document.documentElement.clientWidth];
  });
  expect(wide[0], 'the open invitation never widens').toBe(wide[1]);
  expect(wide[2], 'the page never widens').toBe(wide[3]);
  expect(problems).toEqual([]);
});

test('VS-03: the live invitation is in the first screen of the front page, on a phone too', async ({ page }) => {
  const problems = await watch(page);
  await page.goto('/');
  const frame = page.getByTitle(/^Sample invitation for/);
  await expect(frame).toBeAttached({ timeout: 20_000 });
  // The phone's screen (the envelope's flaps and seal are in its top half) starts inside the first screen,
  // with at least its top 40% showing.
  const screenBox = (await frame.locator('xpath=..').boundingBox())!;
  const fold = page.viewportSize()!.height;
  expect(screenBox.y + screenBox.height * 0.4, 'the envelope is above the fold').toBeLessThanOrEqual(fold);
  for (const name of ['Start your wedding', 'Book a free trial']) {
    expect((await page.getByRole('link', { name }).first().boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
  }
  expect(await sideways(page), 'scrolls sideways').toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});
