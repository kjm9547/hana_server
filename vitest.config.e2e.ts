import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: { JWT_SECRET: 'e2e-test-secret-that-is-at-least-32-bytes!', DATABASE_FILE: 'data/e2e.db' },
  },
});
