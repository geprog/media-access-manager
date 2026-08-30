import type { ConfigOptions } from '@nuxt/test-utils/playwright';
import process from 'node:process';
import { defineConfig } from '@playwright/test';

// The expired-link page only offers a mail link when the deployment publishes
// an address, so the test server always gets one.
process.env.NUXT_PUBLIC_SUPPORT_EMAIL ||= 'support@example.com';

export default defineConfig<ConfigOptions>({
  testDir: './e2e/tests',
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
