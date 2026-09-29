import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@app/database': resolve(__dirname, './libs/database/src'),
      '@app/redis': resolve(__dirname, './libs/redis/src'),
      '@app/cache/redis': resolve(__dirname, './libs/redis/src'),
      '@app/observability': resolve(__dirname, './libs/observability/src'),
    },
  },
  server: {
    deps: {
      external: ['@prisma/client', '.prisma/client'],
    },
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    server: {
      deps: {
        external: ['@prisma/client', '.prisma/client'],
      },
    },
  },
});
