import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The 1,000 wedding scenarios (tests/scenarios), run with this package's vitest and its local D1
 * (miniflare). From apps/api:  pnpm exec vitest run --config vitest.scenarios.config.ts [--shard=1/4]
 * One scenario only:           SCENARIO=417 pnpm exec vitest run --config vitest.scenarios.config.ts
 */
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['tests/scenarios/**/*.test.ts'],
    // The scenario files live outside this package: describe/it/expect/vi come in as globals.
    globals: true,
    pool: 'forks',
    // Each part has its own workerd; more than this per CI machine and it runs out of room.
    poolOptions: { forks: { maxForks: Number(process.env.SCENARIO_FORKS || 2), minForks: 1 } },
    testTimeout: 120_000,
    hookTimeout: 90_000,
  },
});
