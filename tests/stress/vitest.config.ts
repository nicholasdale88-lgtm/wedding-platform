import { defineConfig } from 'vitest/config';

/**
 * The stress run (pnpm stress): each stress-*.test.ts file is one part of the 1,000 weddings, in its own
 * process with its own local databases (Miniflare D1). STRESS_FORKS sets how many parts run at once.
 */
export default defineConfig({
  test: {
    include: ['stress-*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { maxForks: Number(process.env.STRESS_FORKS ?? 4), minForks: 1 } },
    testTimeout: 60 * 60_000,
    hookTimeout: 120_000,
  },
});
