import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'axios-eventsource': path.join(rootDir, 'packages/axios-eventsource/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['packages/axios-eventsource/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/types.ts'],
    },
  },
});
