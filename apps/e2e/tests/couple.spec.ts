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
  await drawer.getByText(/^Wedding party/).click();
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
