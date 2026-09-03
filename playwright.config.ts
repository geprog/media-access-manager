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

/**
 * Set `E2E_DOCKER_IMAGE` to run the suite against the published container
 * instead of the Nuxt server `@nuxt/test-utils` builds and starts in-process.
 * The two differ in more than packaging: the image carries the native modules
 * and system fonts the QR export needs, and only this mode would have caught
 * them missing.
 */
const dockerImage = process.env.E2E_DOCKER_IMAGE;
const dockerPort = Number(process.env.E2E_DOCKER_PORT) || 3100;
// `localhost`, not `127.0.0.1`: the session cookie is `Secure`, and a browser
// treats only a localhost origin as trustworthy over plain http.
const dockerUrl = `http://localhost:${dockerPort}`;
// Fixed name so a run that was interrupted before teardown cannot leave a
// container holding the port against the next one.
const dockerName = 'media-access-manager-e2e';

// Every setting above is runtime config, so the same values that configure the
// in-process server configure the container — no image rebuild per environment.
const dockerEnv = [
  'NUXT_ADMIN_PASSWORD',
  'NUXT_SESSION_PASSWORD',
  'NUXT_PUBLIC_SUPPORT_EMAIL',
  'NUXT_PUBLIC_PUBLISHER_URL',
  'NUXT_PUBLIC_PUBLISHER_NAME',
  'NUXT_PUBLIC_POWERED_BY_URL',
  'NUXT_PUBLIC_POWERED_BY_NAME',
].map(name => `--env ${name}=${JSON.stringify(process.env[name])}`).join(' ');

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
    // A `host` makes `@nuxt/test-utils` skip both the build and the server it
    // would otherwise start, and take this origin as the `baseURL`.
    nuxt: dockerImage ? { host: dockerUrl } : undefined,
    video: process.env.CI ? 'retain-on-failure' : 'on',
    trace: process.env.CI ? 'retain-on-failure' : 'on',
  },
  // Never reused: a stale container would be serving a different image than the
  // one under test.
  webServer: dockerImage
    ? {
        command: `docker rm --force ${dockerName} > /dev/null 2>&1; exec docker run --rm --name ${dockerName} --publish ${dockerPort}:3000 ${dockerEnv} ${dockerImage}`,
        url: dockerUrl,
        reuseExistingServer: false,
        timeout: 120_000,
        // The container belongs to the daemon, not to the `docker run` process
        // group Playwright kills, so a default SIGKILL teardown would leave it
        // running. SIGTERM is what the client forwards into the container.
        gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      }
    : undefined,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
});
