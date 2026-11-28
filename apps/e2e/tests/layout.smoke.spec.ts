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
const phone = (name: string) => name === 'smoke-phone' || name === 'smoke-390';
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
    for (const name of ['Pricing', 'Sign in', 'Get started']) await expect(header.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Vendor directory' })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Menu' })).toBeHidden();
  } else {
    const menu = header.getByRole('button', { name: 'Menu' });
    await expect(menu).toBeVisible();
    expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await menu.click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();
    for (const name of ['Pricing', 'Sign in', 'Get started']) await expect(sheet.getByRole('link', { name, exact: true })).toBeVisible();
    // Focus is inside and stays inside; Escape closes it and puts focus back on Menu.
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(menu).toBeFocused();
    // Choosing a link closes it and goes there.
    await menu.click();
    await sheet.getByRole('link', { name: 'Pricing' }).click();
    await expect(page).toHaveURL(/#pricing$/);
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
  await expect(page.getByText('Guests’ photos to your own Google Drive or Dropbox').first()).toBeAttached();
});

test('the sample night-before forecast reads "0% rain", never "0%% rain"', async ({ page }) => {
  await page.goto('/demo/tomorrow');
  await expect(page.getByText(/^\d+% rain$/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/%%/)).toHaveCount(0);
});

test('the sample photo page names the couple in the browser tab (it was blank)', async ({ page }) => {
  await page.goto('/demo/photos');
  await expect(page).toHaveTitle(/ & .+ · photos$/, { timeout: 20_000 });
});

test('the sample vendor account: See your page and Sign out are easy taps (44px or more)', async ({ page }, info) => {
  await page.goto('/vendors/me?sample=1');
  // On a phone they're in the account sheet (the header's menu button).
  if (phone(info.project.name)) await page.getByRole('button', { name: 'Open the menu' }).click();
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
  await expect(page.getByText('Nothing renews', { exact: false }).first()).toBeVisible();
});

test('front page sign-up: "Already have one? Sign in" is a 44px tap', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('form').getByRole('link', { name: 'Sign in', exact: true });
  await link.scrollIntoViewIfNeeded();
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});

test('the sample vendor account: no card runs past the edge of the screen (Needs you and Coming up were cut off on a phone)', async ({ page }) => {
  await page.goto('/vendors/me?sample=1');
  await expect(page.getByRole('region', { name: 'Next 3 things' })).toBeVisible({ timeout: 20_000 });
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

test('the sample app overview: at most three next things, each a 44px button', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yl.trial', '1'));
  await page.goto('/admin/demo/wedding/overview');
  const next = page.getByRole('region', { name: 'Next 3 things' });
  await expect(next).toBeVisible({ timeout: 20_000 });
  const buttons = await next.getByRole('button').all();
  expect(buttons.length).toBeLessThanOrEqual(3);
  for (const b of buttons) {
    await b.scrollIntoViewIfNeeded();
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  }
});

test('the vendor account wears their look: five places down the side on a computer, along the bottom on a phone', async ({ page }, info) => {
  const problems = await watch(page);
  await page.goto('/vendors/me?sample=1');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeAttached();
  if (!phone(info.project.name)) {
    const side = page.getByRole('navigation', { name: 'Your vendor account' });
    await expect(side).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Quick menu' })).toBeHidden();
    await expect(side.getByRole('button')).toHaveCount(5);
    await side.getByRole('button', { name: 'Your listing' }).click();
  } else {
    const bar = page.getByRole('navigation', { name: 'Quick menu' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button')).toHaveCount(5);
    await expect(bar.getByRole('button', { name: 'More' })).toHaveCount(0);
    for (const b of await bar.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    // The header's menu button still opens the account sheet (Escape closes it).
    await page.getByRole('button', { name: 'Open the menu' }).click();
    const sheet = page.getByRole('dialog', { name: 'Your vendor account' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await bar.getByRole('button', { name: /^Listing/ }).click();
  }
  // Your look sits inside Your listing.
  await page.getByRole('navigation', { name: 'Your listing' }).getByRole('button', { name: 'Your look' }).click();
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
  // The sales page links no vendor pages (send-10); /vendors/join is still its own page.
  await page.goto('/');
  await expect(page.locator('footer').last().getByRole('link', { name: /List your business/ })).toHaveCount(0);
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
    // Home's Next 3 things (the quick actions' place): every button fits the screen.
    for (const b of await page.getByRole('region', { name: 'Next 3 things' }).getByRole('button').all()) {
      const box = (await b.boundingBox())!;
      expect(box.x + box.width, 'a Next 3 things button fits').toBeLessThanOrEqual(page.viewportSize()!.width);
    }
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
  // The opening has finished and settled (the faded envelope is taken out).
  await expect(page.locator('.yl-sample[data-opened]')).toBeAttached({ timeout: 20_000 });
  await page.waitForTimeout(800);
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

test('VS-04: the designs are 3:4 portraits with ink names, the filter chips are 44px, nothing sideways', async ({ page }) => {
  const problems = await watch(page);
  await page.goto('/designs');
  const chips = page.getByRole('group', { name: 'Moods' }).getByRole('button');
  for (const chip of await chips.all()) expect((await chip.boundingBox())!.height, (await chip.textContent()) ?? '').toBeGreaterThanOrEqual(44);
  expect((await page.getByRole('link', { name: '← Home' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const tiles = page.getByRole('radiogroup', { name: 'Designs' }).getByRole('radio');
  expect(await tiles.count()).toBeGreaterThan(20);
  for (const tile of (await tiles.all()).slice(0, 6)) {
    const art = (await tile.locator('span').first().boundingBox())!;
    expect(Math.abs(art.width / art.height - 0.75), 'a 3:4 portrait').toBeLessThan(0.03);
    const name = tile.locator('span').nth(-2);
    expect(await name.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(51, 64, 47)');
  }
  expect(await sideways(page), 'scrolls sideways').toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('the sample app on a phone: Help, Preview, Group by side and the dietary + chips are 44px taps', async ({ page }, info) => {
  test.skip(!phone(info.project.name), 'phone only');
  await page.addInitScript(() => localStorage.setItem('yl.trial', '1'));
  // A tap 21px above or below the middle (a 44px finger) still lands on it.
  // (In the middle of the screen: the sample's bar along the bottom would cover it otherwise.)
  const tall = (el: Element) => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return [y - 21, y + 21].map((yy) => {
      const hit = document.elementFromPoint(x, yy);
      return !!hit && (hit === el || el.contains(hit));
    });
  };
  await page.goto('/admin/demo/wedding/guests');
  const targets = [
    page.getByRole('link', { name: 'Help', exact: true }).first(),
    page.getByRole('link', { name: /^Preview .+’s invitation$/ }).first(),
    page.getByRole('button', { name: /^Group(ed)? by side/ }).first(),
  ];
  for (const t of targets) {
    await expect(t).toBeVisible({ timeout: 20_000 });
    expect(await t.evaluate(tall), await t.evaluate((el) => el.textContent ?? '')).toEqual([true, true]);
  }
  await page.goto('/admin/demo/wedding/dietary');
  const chip = page.getByRole('button', { name: /^\+ (Vegetarian|Vegan|Gluten free|Dairy free)$/ }).first();
  await expect(chip).toBeVisible({ timeout: 20_000 });
  expect(await chip.evaluate(tall)).toEqual([true, true]);
  // Every page's ← Home and its own menu's pills (Guest list · Meals & allergies · Seating).
  for (const t of [page.locator('a:visible', { hasText: /←\s*Home/ }).first(), page.getByRole('navigation', { name: 'Guest planning' }).getByRole('link', { name: 'Seating' })]) {
    await expect(t).toBeVisible();
    expect(await t.evaluate(tall), await t.evaluate((el) => el.textContent ?? '')).toEqual([true, true]);
  }
  // The overview's figures say all of it: "guests · 23 invitations said yes" is never cut off.
  await page.goto('/admin/demo/wedding/overview');
  const figures = page.getByRole('region', { name: 'Replies at a glance' }).getByRole('button');
  await expect(figures.first()).toBeVisible({ timeout: 20_000 });
  for (const f of await figures.all()) {
    const cut = await f.evaluate((el) => [...el.querySelectorAll('span')].some((s) => s.scrollWidth > s.clientWidth + 1 && getComputedStyle(s).overflow === 'hidden'));
    expect(cut, (await f.textContent()) ?? '').toBe(false);
  }
});

test("the guest photo page on a phone: every frame and look chip is a 44px tap; the vendor sample's Edit your listing is 44px", async ({ page }, info) => {
  test.skip(!phone(info.project.name), 'phone only');
  const tall = (el: Element) => {
    el.scrollIntoView({ block: 'nearest', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return [y - 21, y + 21].map((yy) => {
      const hit = document.elementFromPoint(x, yy);
      return !!hit && (hit === el || el.contains(hit));
    });
  };
  await page.goto('/demo/photos');
  // The sample starts at step 2 (a name is already there); a fresh guest page asks for a name first.
  const name = page.locator('form input').first();
  const filters = page.getByRole('radiogroup', { name: 'Filter' });
  await expect(filters.or(name).first()).toBeVisible({ timeout: 20_000 });
  if (await name.isVisible()) {
    await name.fill('Ava');
    await name.press('Enter');
  }
  for (const group of ['Filter', 'Look']) {
    const chips = page.getByRole('radiogroup', { name: group }).getByRole('radio');
    await expect(chips.first()).toBeVisible({ timeout: 20_000 });
    for (const chip of await chips.all()) expect(await chip.evaluate(tall), `${group}: ${await chip.textContent()}`).toEqual([true, true]);
  }
  expect(await sideways(page), 'scrolls sideways').toBeLessThanOrEqual(1);
  await page.goto('/vendors/me?sample=1');
  const edit = page.getByRole('button', { name: 'Edit your listing' });
  await expect(edit).toBeVisible({ timeout: 20_000 });
  expect((await edit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('Sentinel residuals: footer Home and Terms and the /try Terms are 44x44 at 375, 390 and 1440; the sample FAQ names who to contact', async ({ page }) => {
  for (const width of [375, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, name, where] of [
      ['/', 'Terms', 'footer'],
      ['/terms', 'Home', 'footer'],
      ['/terms', 'Terms', 'footer'],
      ['/try', 'Terms', 'form'],
    ] as const) {
      await page.goto(path);
      const link = page.locator(where).getByRole('link', { name, exact: true }).first();
      await link.scrollIntoViewIfNeeded();
      const box = (await link.boundingBox())!;
      expect(box.width, `${path} ${name} width at ${width}`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${path} ${name} height at ${width}`).toBeGreaterThanOrEqual(44);
    }
  }
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Open invitation' }).click();
  await expect(page.locator('#inv-scroll').getByText('Call or text Harriet & Theo on', { exact: false }).first()).toBeAttached({ timeout: 20_000 });
});

test('Sentinel phase 1: the closed sample is no wider than the screen, and the /try newsletter choice is a 44px tap', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('button', { name: 'Open invitation' })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  const closed = await page.evaluate(() => {
    const r = document.querySelector('[aria-label="Open invitation"]')!;
    return [r.scrollWidth, r.clientWidth];
  });
  expect(closed[0], 'the closed invitation never widens').toBe(closed[1]);
  await page.goto('/try');
  const news = page.locator('form label').filter({ has: page.locator('input[type="checkbox"]') }).first();
  expect((await news.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('Simplify Job 1: a signed-in couple sees five menu items (Home, Guests, Invitation, Plan, Settings), nothing sideways', async ({ page }, info) => {
  const n = Date.now() % 1_000_000;
  const res = await page.request.post('/api/a/signup', {
    headers: { 'CF-Connecting-IP': `10.77.${n % 250}.${(n >> 8) % 250}` },
    data: { firstName: 'Harriet', partnerName: 'Theo', email: `menu-${n}@example.com`, passcode: 'menu-passcode-1', date: '2027-03-20', guests: 80 },
  });
  expect(res.status(), await res.text()).toBe(200);
  const wid = ((await res.json()) as { weddingId: string }).weddingId;
  for (const width of phone(info.project.name) ? [375, 390] : [1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/admin/${wid}`);
    // Home is the wedding's own overview.
    await expect(page).toHaveURL(new RegExp(`/admin/${wid}/wedding/overview`), { timeout: 20_000 });
    let nav;
    if (phone(info.project.name)) {
      await page.getByRole('button', { name: /^Menu/ }).click();
      nav = page.getByRole('dialog', { name: 'Menu' }).getByRole('navigation', { name: 'Admin' });
      const rows = nav.locator(':scope > div > button:first-child');
      await expect(rows).toHaveCount(5);
      for (const r of await rows.all()) expect((await r.boundingBox())!.height, `row at ${width}`).toBeGreaterThanOrEqual(56);
    } else {
      nav = page.getByRole('navigation', { name: 'Admin' });
      await expect(nav.locator(':scope > div > a:first-child')).toHaveCount(5);
    }
    for (const name of [/^Home/, /^Guests/, /^Invitation/, /^Plan/, /^Settings/]) await expect(nav.getByRole(phone(info.project.name) ? 'button' : 'link', { name }).first()).toBeVisible();
    // A new wedding starts with its optional tools off: none of them in the menu.
    for (const name of ['Texts', 'Photos', 'Wedding party']) await expect(nav.getByRole(phone(info.project.name) ? 'button' : 'link', { name, exact: true })).toHaveCount(0);
    await expect(page.getByText('RSVP admin')).toHaveCount(0);
    expect(await sideways(page), `sideways at ${width}`).toBeLessThanOrEqual(1);
    if (phone(info.project.name)) await page.getByRole('button', { name: 'Close menu' }).click();
  }
});

test('sales page previews (send-10): no vendor links, A$87 only, Harriet & Theo, one phone style, the hero closed and uncovered', async ({ page }) => {
  for (const path of ['/', '/try']) {
    await page.goto(path);
    // The page drawn first (an empty page would pass every "not" below).
    await expect(path === '/' ? page.getByRole('heading', { level: 1 }) : page.getByRole('form', { name: 'Book your free trial' })).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    expect((await page.locator('body').innerText()).length, `${path}: drawn`).toBeGreaterThan(200);
    expect(await page.locator('a[href*="vendor"]').count(), `${path}: vendor links`).toBe(0);
    const text = await page.locator('body').innerText();
    expect(text, `${path}: vendor wording`).not.toMatch(/Vendor directory|List your business/);
    expect(text, `${path}: the sample guests' names`).not.toMatch(/Emma/);
    expect(text, `${path}: old prices`).not.toMatch(/From \$|\$50\b|\$88|\$98|\$39/);
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('body').innerText()).toContain('A$87');
  // The hero: the sample in sales mode, still closed (Tap to open, the couple's names) after a wait.
  const hero = page.locator('iframe[title^="Sample invitation"]').first();
  await expect(hero).toHaveAttribute('src', '/demo?embed=1&sales=1');
  await page.waitForTimeout(4500);
  const inside = page.frameLocator('iframe[title^="Sample invitation"]').first();
  await expect(inside.getByText(/Tap to open/i).first()).toBeVisible();
  // The envelope's own names (the opened card's hidden text also has them).
  await expect(inside.locator('text="Harriet & Theo" >> visible=true').first()).toBeVisible();
  // Nothing over the hero's phone: every point of it belongs to it.
  const frame = page.locator('[data-phone-frame]').first();
  await frame.scrollIntoViewIfNeeded();
  const covered = await frame.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const pts = [[0.5, 0.5], [0.15, 0.1], [0.85, 0.1], [0.15, 0.9], [0.85, 0.9], [0.5, 0.95]];
    return pts.filter(([x, y]) => {
      const hit = document.elementFromPoint(r.left + r.width * x!, r.top + r.height * y!);
      return !hit || !el.contains(hit);
    }).length;
  });
  expect(covered, 'points of the hero phone covered').toBe(0);
  // One preview style: every phone on the page has the same shadow and the same width.
  const looks = await page.locator('[data-phone-frame]').evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent).map((e) => ({ shadow: getComputedStyle(e).boxShadow, w: Math.round(e.getBoundingClientRect().width) })),
  );
  expect(looks.length).toBeGreaterThanOrEqual(3);
  expect(new Set(looks.map((l) => l.shadow)).size).toBe(1);
  expect(new Set(looks.map((l) => l.w)).size).toBe(1);
  // /try: the date in day / month / year.
  await page.goto('/try');
  const date = page.getByPlaceholder('dd/mm/yyyy');
  await expect(date).toBeVisible();
  await expect(page.getByText(/Day \/ month \/ year/)).toBeVisible();
});

test('send-10b: the sample couple admin opens without booking a trial, and never asks the server who is signed in', async ({ page }) => {
  const refused: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() === 401) refused.push(r.url());
  });
  await page.goto('/admin/demo/wedding/overview');
  await expect(page.getByRole('region', { name: 'Next 3 things' })).toBeVisible({ timeout: 20_000 });
  expect(page.url()).toContain('/admin/demo/');
  expect(refused).toEqual([]);
});

test('send-10b: on a phone the price line and Start your wedding are in the first screen', async ({ page }, info) => {
  test.skip(!phone(info.project.name), 'phones only');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  const h = page.viewportSize()!.height;
  for (const [what, loc] of [
    ['Start your wedding', page.getByRole('link', { name: 'Start your wedding' }).first()],
    ['A$87, paid once', page.getByText(/A\$87, paid once/).first()],
    ['texts line', page.getByText(/Texts to guests are extra/).first()],
  ] as const) {
    const b = (await loc.boundingBox())!;
    expect(b.y + b.height, `${what} above the fold`).toBeLessThanOrEqual(h);
  }
});

test('send-10b: the sample vendor on a phone: Next 3 things and All requests clear of the tab bar; the stage chips wrap', async ({ page }, info) => {
  test.skip(!phone(info.project.name), 'phones only');
  await page.goto('/vendors/me?sample=1');
  const next = page.getByRole('region', { name: 'Next 3 things' });
  await expect(next).toBeVisible({ timeout: 20_000 });
  const bar = page.getByRole('navigation', { name: 'Quick menu' });
  const barTop = (await bar.boundingBox())!.y;
  // In the first screen, above the bar: every one of the three and "All requests".
  for (const b of await next.getByRole('button').all()) {
    const r = (await b.boundingBox())!;
    expect(r.y + r.height, `${await b.textContent()} above the tab bar`).toBeLessThanOrEqual(barTop + 0.5);
  }
  // The bottom of the page ends clear of the bar.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const lastBottom = await page.evaluate(() => {
    const els = [...document.querySelectorAll('main > *')];
    return Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
  });
  expect(lastBottom).toBeLessThanOrEqual((await bar.boundingBox())!.y + 0.5);
  // Requests: the stage chips wrap, none cut off ("Quoted" was).
  await bar.getByRole('button', { name: /Requests/ }).click();
  const chips = page.getByRole('tablist', { name: 'Show enquiries' }).getByRole('tab');
  await expect(chips.first()).toBeVisible();
  const vw = page.viewportSize()!.width;
  for (const c of await chips.all()) {
    const fits = await c.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    const r = (await c.boundingBox())!;
    expect(fits && r.x >= 0 && r.x + r.width <= vw, `${await c.textContent()} whole on screen`).toBe(true);
  }
});
