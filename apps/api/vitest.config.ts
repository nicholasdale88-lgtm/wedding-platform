import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Miniflare starts a local workerd per test file; separate processes keep them isolated.
    pool: 'forks',
    testTimeout: 30_000,
  },
});
