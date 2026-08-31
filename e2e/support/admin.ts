import type { Page } from '@playwright/test';
import process from 'node:process';
import { expect } from '@nuxt/test-utils/playwright';

export const ADMIN_PASSWORD = process.env.NUXT_ADMIN_PASSWORD ?? 'password';

export async function login(page: Page) {
  await page.goto('/');
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/', { timeout: 5000 });
}

/**
 * Test data outlives the test that created it, so the admin delete endpoints
 * clear it out again — groups first, because deleting a group takes its tokens
 * with it, then the media with their own tokens and batches. Every name
 * created here starts with `E2E` and the tests run sequentially, so this cannot
 * remove anything another test still needs.
 *
 * The calls run inside the page because the session cookie is `Secure`, which
 * Playwright's API request context refuses to send over http. Logging in first
 * covers the tests that drop the session on purpose.
 */
export async function deleteTestData(page: Page) {
  await page.goto('/');
  await page.evaluate(async (password) => {
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const groups: Array<{ id: string, name: string }> = await fetch('/api/groups').then(response => response.json());
    await Promise.all(groups
      .filter(row => row.name.startsWith('E2E'))
      .map(row => fetch(`/api/groups/${row.id}`, { method: 'DELETE' })));
    const media: Array<{ id: string, title: string }> = await fetch('/api/media').then(response => response.json());
    await Promise.all(media
      .filter(row => row.title.startsWith('E2E'))
      .map(row => fetch(`/api/media/${row.id}`, { method: 'DELETE' })));
  }, ADMIN_PASSWORD);
}

export function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

export interface ProviderVideo {
  id: string
  providerId: string
  title: string
  providerConfig: { providerId: string, videoId: string }
}

export function providerVideo(videoId: string, title: string): ProviderVideo {
  return {
    id: videoId,
    providerId: 'vimeo',
    title,
    providerConfig: { providerId: 'vimeo', videoId },
  };
}

/**
 * Stands in for the Vimeo API: serves whatever `videos()` currently returns, so
 * a test can shrink the list the way the server does once media is added.
 */
export async function mockAvailableMedia(page: Page, videos: () => ProviderVideo[]) {
  await page.route(/\/api\/providers\/[^/]+\/available-media/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(videos()),
    });
  });
}

export async function pickAvailableVideo(page: Page, videoTitle: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Video', exact: true }).click();
  await page.getByRole('option', { name: videoTitle }).click();
  // The dropdown swallows clicks until its close animation is done.
  await expect(page.getByRole('listbox')).toBeHidden();
}

export async function addMediaViaUI(
  page: Page,
  title: string,
  videoId = '1234567890',
) {
  await mockAvailableMedia(page, () => [providerVideo(videoId, `Vimeo ${videoId}`)]);
  await page.getByRole('button', { name: 'Add Media' }).click();
  const dialog = page.getByRole('dialog');
  await pickAvailableVideo(page, `Vimeo ${videoId}`);
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Add Media' }).click();
  await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible({ timeout: 10000 });
}

/**
 * Fills the "create new tokens" dialog on a media or group page and returns the
 * first token of the batch. Both pages share the same panel, so both are driven
 * through this.
 */
export async function createTokenViaUI(
  page: Page,
  batchName: string,
  count = 1,
  options: { usageLimit?: number } = {},
): Promise<string> {
  await page.getByRole('button', { name: 'Create new Tokens' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Batch name').fill(batchName);
  await dialog.getByLabel('Count').fill(String(count));
  if (options.usageLimit != null) {
    await dialog.getByLabel('Usage limit').fill(String(options.usageLimit));
  }
  await dialog.getByRole('button', { name: 'Create new Tokens' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 5000 });
  const batchButton = page.getByRole('button').filter({ hasText: batchName });
  await batchButton.click();
  const tokenCell = page.locator('code').first();
  await expect(tokenCell).toBeVisible({ timeout: 10000 });
  return await tokenCell.textContent() ?? '';
}

export function videoEmbed(iframeTitle: string) {
  return {
    type: 'video',
    version: '1.0',
    title: iframeTitle,
    html: `<iframe src="https://example.com/e2e-video" title="${iframeTitle}"></iframe>`,
    width: 640,
    height: 360,
  };
}

export interface StubReport {
  status: string
  issues: Array<{ code: string, severity: string, details?: Record<string, string> }>
}

/**
 * Stands in for the accessibility endpoints so no test reaches the real Vimeo
 * API. Registered before every test, and overridden in the tests that assert
 * on a specific verdict.
 */
export async function mockAccessibility(page: Page, report: StubReport) {
  await page.route('**/api/media/*/accessibility**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mediaId: 'stub', report, checkedAt: new Date().toISOString() }),
    });
  });
}

export async function stubProviderCalls(page: Page) {
  await page.route('**/api/accessibility', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await mockAccessibility(page, { status: 'unknown', issues: [] });
}
