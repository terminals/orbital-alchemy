import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'shared/**/*.test.ts',
            'server/services/scope-cache.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: [
            'server/**/*.test.ts',
          ],
          exclude: [
            'server/services/scope-cache.test.ts',
          ],
          environment: 'node',
          testTimeout: 10000,
        },
      },
    ],
  },
});
