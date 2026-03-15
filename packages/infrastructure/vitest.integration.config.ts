import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/integration/**/*.test.ts'],
    testTimeout: 30000,
    globalSetup: [],
    teardownTimeout: 10000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
