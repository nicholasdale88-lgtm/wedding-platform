import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Miniflare starts a local workerd per test file; separate processes keep them isolated.
    pool: 'forks',
    // The launch tests (scale, fuzz, security) each push hundreds of requests through their workerd: more
    // than two at once and the CI machine runs out of room, so workerd drops connections ("other side
    // closed") and requests fail for reasons that aren't the app's.
    poolOptions: { forks: { maxForks: 2, minForks: 1 } },
    testTimeout: 30_000,
  },
});
