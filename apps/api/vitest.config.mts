import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// SWC emite la metadata de decoradores que necesita la inyección de dependencias de Nest.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
