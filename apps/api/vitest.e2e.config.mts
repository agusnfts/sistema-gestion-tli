import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Tests e2e contra una base PostgreSQL real con migraciones aplicadas (ver README).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.e2e.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
