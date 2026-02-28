import type { ConfigOptions } from '@nuxt/test-utils/playwright';
import process from 'node:process';
import { defineConfig } from '@playwright/test';

export default defineConfig<ConfigOptions>({
  testDir: './e2e/tests',
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  testMatch: '**/*.test.ts',
  use: {
    video: process.env.CI ? 'retain-on-failure' : 'on',
    trace: process.env.CI ? 'retain-on-failure' : 'on',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
});
