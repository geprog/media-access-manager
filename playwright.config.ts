import type { ConfigOptions } from '@nuxt/test-utils/playwright';
import process from 'node:process';
import { defineConfig } from '@playwright/test';

// The expired-link page only offers a mail link when the deployment publishes
// an address, so the test server always gets one.
process.env.NUXT_PUBLIC_SUPPORT_EMAIL ||= 'support@example.com';

// Header and footer name the publisher and credit whoever built the deployment.
// Assigned outright rather than with `||=`: these are asserted on, and a
// developer's own `.env` would otherwise change what the tests see.
process.env.NUXT_PUBLIC_PUBLISHER_URL = 'https://publisher.example';
process.env.NUXT_PUBLIC_PUBLISHER_NAME = 'Example Publisher';
process.env.NUXT_PUBLIC_POWERED_BY_URL = 'https://studio.example';
process.env.NUXT_PUBLIC_POWERED_BY_NAME = 'Example Studio';

// The suite runs a production build, where the admin password and the session
// secret have no defaults (they only exist under `$development` in
// `nuxt.config.ts`), so the test server is handed its own.
process.env.NUXT_ADMIN_PASSWORD ||= 'password';
process.env.NUXT_SESSION_PASSWORD ||= 'e2e-session-password-with-min-32-chars';

export default defineConfig<ConfigOptions>({
  testDir: './e2e/tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Every spec drives the same server and the same database, and cleans up by
  // deleting everything named `E2E`. Two files running at once would clear
  // each other's media mid-test, so the whole suite runs on one worker.
  workers: 1,
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
