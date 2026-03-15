import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/integration/**/*.test.ts'],
    testTimeout: 30000,
  },
});
