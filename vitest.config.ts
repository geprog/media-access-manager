import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'utils/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/**/*.ts', 'utils/**/*.ts'],
      exclude: ['**/*.test.ts', '**/migrations/**'],
    },
  },
});
