import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * A couple's admin, tapped through like a phone: sign up (a throwaway local account), add a guest, change
 * their options, the wedding party, a reply, and the seating plan. Every choice must show at once (no
 * snapping back), and nothing may throw.
 */
const API_DIR = fileURLToPath(new URL('../../api', import.meta.url));
let wid = '';
let n = 0;

async function signUp(page: Page) {
  n += 1;
  const email = `e2e-${Date.now()}-${n}@example.com`;
  const res = await page.request.post('/api/a/signup', {
    // Its own network address each time (sign-ups are limited per network).
    headers: { 'CF-Connecting-IP': `10.0.${n}.${Date.now() % 250}` },
    data: { firstName: 'Olivia', partnerName: 'James', email, passcode: 'e2e-passcode-123', date: '2027-03-20', guests: 80 },
  });
  expect(res.status(), await res.text()).toBe(200);
  wid = ((await res.json()) as { weddingId: string }).weddingId;
  // Seating is on Essentials: give this throwaway wedding that plan in the local database.
  execSync(`pnpm exec wrangler d1 execute DB --local --command "UPDATE wedding SET plan = 'essentials' WHERE id = '${wid}'"`, { cwd: API_DIR, stdio: 'pipe' });
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw new Error(`Page error: ${e.message}`);
  });
  await signUp(page);
});

async function addGuest(page: Page, name: string) {
  await page.goto(`/admin/${wid}/wedding/guests?show=all`);
  await page.getByRole('button', { name: 'Add guest' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  const main = drawer.getByLabel('Main contact · gets the texts');
  await main.fill(name);
  await main.blur();
  await expect(drawer.getByRole('heading', { level: 2 })).toHaveText(name);
  return drawer;
}

test('add a guest: details open at once, and every choice shows the moment it is made', async ({ page }) => {
  const drawer = await addGuest(page, 'Charlotte Hale');

  const sendBy = drawer.getByLabel('Send them messages by');
  await sendBy.selectOption('email');
  await expect(sendBy).toHaveValue('email'); // straight away, not after the save

  const delivery = drawer.getByLabel('Invitation by');
  await delivery.selectOption({ index: 1 });
  await expect(drawer.getByLabel('Postal address')).toBeVisible();

  // A reply, recorded by the couple: pressed at once.
  const declined = drawer.getByRole('button', { name: 'Declined' }).first();
  await declined.click();
  await expect(declined).toHaveAttribute('aria-pressed', 'true');

  // A second person: they can be ticked as a child (the main contact can't).
  await drawer.getByRole('button', { name: '+ Add person' }).click();
  const second = drawer.getByLabel('Guest name');
  await second.fill('Tom Hale');
  await second.blur();
  await expect(drawer.getByLabel(/is a child/)).toHaveCount(1);

  await drawer.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Charlotte Hale')).toBeVisible();

  // Search answers every key.
  const search = page.getByLabel('Search name or mobile');
  await search.pressSequentially('charl');
  await expect(search).toHaveValue('charl');
  await expect(page.getByText('Charlotte Hale')).toBeVisible();
});

test('a guest left blank is not kept in the list', async ({ page }) => {
  await page.goto(`/admin/${wid}/wedding/guests?show=all`);
  await page.getByRole('button', { name: 'Add guest' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your guest list/);
});

test('wedding party: the role menu always opens, asks for an email first, then adds them', async ({ page }) => {
  const drawer = await addGuest(page, 'Priya Nair');
  await drawer.locator('summary', { hasText: 'Wedding party' }).click();
  const role = drawer.getByLabel("Priya Nair's wedding party role");
  await expect(role).toBeEnabled();
  await role.selectOption('Bridesmaid');
  await expect(page.getByRole('status')).toContainText('email first');
  await drawer.getByLabel("Priya Nair's email, for the wedding party").fill('priya@example.com');
  await role.selectOption('Bridesmaid');
  await expect(page.getByRole('status')).toContainText('is in the wedding party');
});

test('seating: the couple are there to seat without being guests', async ({ page }) => {
  await page.goto(`/admin/${wid}/wedding/seating`);
  await expect(page.getByText('Olivia').first()).toBeVisible();
  await expect(page.getByText('James').first()).toBeVisible();
});

test('seating: Move tables drags a table (and never opens it); in Seat guests a tap opens it; changes save themselves', async ({ page }) => {
  await page.goto(`/admin/${wid}/wedding/seating`);
  await page.getByRole('button', { name: 'Edit seating' }).click();
  await page.getByRole('tab', { name: 'Move tables' }).click();
  await page.getByRole('button', { name: '+ Add tables' }).click();
  const plan = page.getByRole('application', { name: 'Floor plan' });
  const box = (await plan.boundingBox())!;
  await plan.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
  // Phones get a Done button floating at the bottom; computers the one in the toolbar.
  await page.getByRole('button', { name: /^Done adding/ }).last().click();
  const table = page.getByRole('button', { name: /^Table 1, / });
  await expect(table).toBeVisible();
  const before = (await table.boundingBox())!;
  // Drag it across the room: a real finger (touch events) on the phone, the mouse on a computer.
  const x0 = before.x + before.width / 2;
  const y0 = before.y + before.height / 2;
  const dx = box.width * 0.3;
  if (test.info().project.name === 'iphone') {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touch('touchStart', x0, y0);
    for (let k = 1; k <= 12; k++) await touch('touchMove', x0 + (dx * k) / 12, y0 + (10 * k) / 12);
    await touch('touchEnd', x0 + dx, y0 + 10);
  } else {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + dx, y0 + 10, { steps: 12 });
    await page.mouse.up();
  }
  const after = (await table.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(box.width * 0.15);
  await expect(page.getByRole('dialog', { name: /seat by seat/ })).toHaveCount(0); // moving never opens it
  // It saves itself.
  await expect(page.getByRole('button', { name: 'Saved ✓' })).toBeVisible({ timeout: 15_000 });
  // Seat guests: a tap opens the table.
  await page.getByRole('tab', { name: 'Seat guests' }).click();
  await table.click();
  await expect(page.getByRole('dialog', { name: /seat by seat/ })).toBeVisible();
});
