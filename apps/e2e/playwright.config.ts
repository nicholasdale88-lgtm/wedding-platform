import { defineConfig, devices } from '@playwright/test';

/**
 * Tap-through tests: a real browser, sized and behaving like an iPhone (touch, mobile layout), clicking
 * through what couples and guests do. They run in CI against the app running locally (the API with its own
 * throwaway database, and the website), never against the live site or its data.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  // On GitHub, each failure also shows as a note on the run page.
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // iPhone size and touch, in Chromium (WebKit won't keep a secure cookie on plain http://localhost).
    { name: 'iphone', testIgnore: /smoke\.spec\.ts/, use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'desktop', testIgnore: /smoke\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // The release gate's smoke tests: a 375px phone and a computer.
    { name: 'smoke-phone', testMatch: /smoke\.spec\.ts/, use: { ...devices['iPhone SE'], viewport: { width: 375, height: 812 }, browserName: 'chromium' } },
    { name: 'smoke-desktop', testMatch: /smoke\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
});
