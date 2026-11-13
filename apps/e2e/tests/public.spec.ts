import { expect, test } from '@playwright/test';

/** Any error thrown in the page fails the test (the glitches couples see often start as one of these). */
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw new Error(`Page error: ${e.message}`);
  });
});

test('front page: one headline, the call to action, and the invitations opening', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('never forget');
  await expect(page.getByRole('link', { name: 'Start your wedding' }).first()).toBeVisible();
  // The hero's phone is the real invitation: the envelope and its wax seal.
  await expect(page.getByTitle(/^Sample invitation for/)).toBeAttached();
  // The page never scrolls sideways on a phone.
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(1);
});

test('designs: tapping a design changes the invitation in the phone', async ({ page }) => {
  await page.goto('/designs');
  await expect(page.getByRole('heading', { name: 'The designs' })).toBeVisible();
  const frame = page.getByTitle(/^Sample invitation for/);
  const before = await frame.getAttribute('src');
  await page.getByRole('radio').nth(3).click();
  await expect(frame).not.toHaveAttribute('src', before ?? '');
});

test('sample invitation opens without a server', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('button', { name: 'Open invitation' })).toBeVisible();
});

test('sign-in page has a way back to the front page', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('link', { name: /The Yes List/ }).first().click();
  await expect(page).toHaveURL(/\/$/);
});

test('sample seating PDF: branded, the room, each table with numbered seats, the dietary list and A to Z', async ({ page }) => {
  await page.goto('/demo/seating-pdf');
  await expect(page.getByText('The room')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bridal table' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Table 1' })).toBeVisible();
  await expect(page.getByText('Dietary requirements, by table and seat')).toBeVisible();
  await expect(page.getByText('Everyone, A to Z')).toBeVisible();
  await expect(page.getByText('Made with The Yes List').first()).toBeVisible();
});

test('try the app: book a free trial, then the sample admin opens, switches plans, edits a guest, and leads back', async ({ page }) => {
  await page.goto('/');
  // The sample app opens only after booking a free trial.
  await page.goto('/admin/demo');
  await expect(page).toHaveURL(/\/try$/);
  await page.goto('/');
  await page.getByRole('link', { name: 'Book your free trial' }).click();
  await expect(page).toHaveURL(/\/try$/);
  const form = page.getByRole('form', { name: 'Book your free trial' });
  await form.getByLabel('Your first name').fill('Harriet');
  await form.getByLabel('Email').fill('harriet@example.com');
  await form.getByRole('button', { name: 'Start my free trial' }).click();
  await expect(page).toHaveURL(/\/admin\/demo/);
  // No Account section in the sample.
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toHaveCount(0);
  const bar = page.getByRole('region', { name: 'Sample wedding' });
  await expect(bar).toBeVisible();
  await bar.getByRole('radio', { name: 'Deluxe' }).click();
  await expect(bar.getByRole('radio', { name: 'Deluxe' })).toHaveAttribute('aria-checked', 'true');
  // The guest list, and a guest's details: a choice shows at once.
  await page.goto('/admin/demo/wedding/guests?show=all');
  await expect(page.getByText('Charlotte Hale').first()).toBeVisible();
  await page.getByText('Charlotte Hale').first().click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Send them messages by').selectOption('email');
  await expect(drawer.getByLabel('Send them messages by')).toHaveValue('email');
  await drawer.getByRole('button', { name: 'Close' }).click();
  // Seating, with the couple in their own colour.
  await page.goto('/admin/demo/wedding/seating');
  await expect(page.getByRole('button', { name: /^Table 1, / })).toBeVisible();
  await page.getByRole('region', { name: 'Sample wedding' }).getByRole('link', { name: '← The Yes List' }).click();
  await expect(page).toHaveURL(/\/$/);
});
