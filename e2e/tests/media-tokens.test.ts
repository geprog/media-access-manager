import type { Page } from '@playwright/test';
import { expect, test } from '@nuxt/test-utils/playwright';

const ADMIN_PASSWORD = process.env.NUXT_ADMIN_PASSWORD ?? 'password';

async function login(page: Page) {
  await page.goto('/');
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/', { timeout: 5000 });
}

/**
 * Media outlives the test that created it, so the admin delete endpoint clears
 * it out again — along with its batches and tokens. Every title created here
 * starts with `E2E` and the tests in this file run sequentially, so this cannot
 * remove media another test still needs.
 *
 * The calls run inside the page because the session cookie is `Secure`, which
 * Playwright's API request context refuses to send over http. Logging in first
 * covers the tests that drop the session on purpose.
 */
async function deleteTestMedia(page: Page) {
  await page.goto('/');
  await page.evaluate(async (password) => {
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const media: Array<{ id: string, title: string }> = await fetch('/api/media').then(response => response.json());
    await Promise.all(media
      .filter(row => row.title.startsWith('E2E'))
      .map(row => fetch(`/api/media/${row.id}`, { method: 'DELETE' })));
  }, ADMIN_PASSWORD);
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

interface ProviderVideo { id: string, providerId: string, title: string, providerConfig: { providerId: string, videoId: string } }

function providerVideo(videoId: string, title: string): ProviderVideo {
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
async function mockAvailableMedia(page: Page, videos: () => ProviderVideo[]) {
  await page.route(/\/api\/providers\/[^/]+\/available-media/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(videos()),
    });
  });
}

async function pickAvailableVideo(page: Page, videoTitle: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Video', exact: true }).click();
  await page.getByRole('option', { name: videoTitle }).click();
  // The dropdown swallows clicks until its close animation is done.
  await expect(page.getByRole('listbox')).toBeHidden();
}

async function addMediaViaUI(
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

/** The media list has no action column: opening media means clicking its row. */
async function openMediaViaUI(page: Page, title: string) {
  await page.getByRole('row').filter({ hasText: title }).click();
  await expect(page).toHaveURL(/\/media\/[^/]+/);
}

async function createTokenViaUI(
  page: Page,
  batchName: string,
  count = 1,
): Promise<string> {
  await page.getByRole('button', { name: 'Create new Tokens' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Batch name').fill(batchName);
  await dialog.getByLabel('Count').fill(String(count));
  await dialog.getByRole('button', { name: 'Create new Tokens' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 5000 });
  const batchButton = page.getByRole('button').filter({ hasText: batchName });
  await batchButton.click();
  const tokenCell = page.locator('code').first();
  await expect(tokenCell).toBeVisible({ timeout: 10000 });
  return await tokenCell.textContent() ?? '';
}

interface AccessWindow { expiresAt: string | null, usageLimit: number | null, usageCount: number }

/** A token with no expiry and no usage limit, i.e. the plainest access window. */
function openAccess(): AccessWindow {
  return { expiresAt: null, usageLimit: null, usageCount: 0 };
}

function videoEmbed(iframeTitle: string) {
  return {
    type: 'video',
    version: '1.0',
    title: iframeTitle,
    html: `<iframe src="https://example.com/e2e-video" title="${iframeTitle}"></iframe>`,
    width: 640,
    height: 360,
  };
}

/**
 * Stands in for the public access endpoint, the only place the token page
 * learns what it may show: the media title, the embed, and how much of the
 * token's access window is left.
 */
async function mockAccess(
  page: Page,
  body: { title: string, embed: ReturnType<typeof videoEmbed>, access: AccessWindow },
) {
  await page.route(/\/api\/access\/[^/]+/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/**
 * Stands in for the accessibility endpoints so no test reaches the real Vimeo
 * API. Registered before every test, and overridden by `mockAccessibility` in
 * the tests that assert on a specific verdict.
 */
interface StubReport {
  status: string
  issues: Array<{ code: string, severity: string, details?: Record<string, string> }>
}

async function mockAccessibility(page: Page, report: StubReport) {
  await page.route('**/api/media/*/accessibility**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mediaId: 'stub', report, checkedAt: new Date().toISOString() }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/accessibility', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await mockAccessibility(page, { status: 'unknown', issues: [] });
});

test.afterEach(async ({ page }) => {
  await deleteTestMedia(page);
});

test.describe('Media and Tokens', () => {
  test('add media', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row.getByText(title)).toBeVisible({ timeout: 5000 });
    await expect(row.getByText('vimeo')).toBeVisible();
  });

  test('prefills the title from the selected vimeo video', async ({ page }, testInfo) => {
    await login(page);

    const videoTitle = `E2E Vimeo Video ${uniqueId(testInfo.testId)}`;
    await mockAvailableMedia(page, () => [providerVideo('555000111', videoTitle)]);

    await page.getByRole('button', { name: 'Add Media' }).click();
    await pickAvailableVideo(page, videoTitle);

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Title')).toHaveValue(videoTitle);

    await dialog.getByRole('button', { name: 'Add Media' }).click();
    await expect(page.getByRole('row').filter({ hasText: videoTitle })).toBeVisible({ timeout: 10000 });
  });

  test('only offers vimeo videos that are not added yet', async ({ page }, testInfo) => {
    await login(page);

    const suffix = uniqueId(testInfo.testId);
    const takenTitle = `E2E Taken ${suffix}`;
    const freeTitle = `E2E Free ${suffix}`;
    const added = new Set<string>();
    await mockAvailableMedia(page, () =>
      [providerVideo('900000001', takenTitle), providerVideo('900000002', freeTitle)]
        .filter(v => !added.has(v.id)));

    await page.getByRole('button', { name: 'Add Media' }).click();
    await pickAvailableVideo(page, takenTitle);
    await page.getByRole('dialog').getByRole('button', { name: 'Add Media' }).click();
    await expect(page.getByRole('row').filter({ hasText: takenTitle })).toBeVisible({ timeout: 10000 });
    added.add('900000001');

    await page.getByRole('button', { name: 'Add Media' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Video', exact: true }).click();
    await expect(page.getByRole('option', { name: freeTitle })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: takenTitle })).toHaveCount(0);
  });

  test('adds media by entering a video id manually', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E Manual ${uniqueId(testInfo.testId)}`;
    await mockAvailableMedia(page, () => []);

    await page.getByRole('button', { name: 'Add Media' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Enter video ID manually' }).click();
    await dialog.getByLabel('Video ID').fill('123456789');
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByRole('button', { name: 'Add Media' }).click();

    await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible({ timeout: 10000 });
  });

  test('generate token for media', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await openMediaViaUI(page, title);

    const batchName = `Batch ${uniqueId(testInfo.testId)}`;
    const token = await createTokenViaUI(page, batchName, 1);

    await expect(page.getByText(/No tokens yet/)).not.toBeVisible({ timeout: 3000 });
    expect(token).toBeTruthy();
    expect(token.length).toBe(32);
  });

  test('use token to see media', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await openMediaViaUI(page, title);

    const batchName = `Batch ${uniqueId(testInfo.testId)}`;
    const token = await createTokenViaUI(page, batchName, 1);
    expect(token).toBeTruthy();

    await mockAccess(page, {
      title,
      embed: videoEmbed('E2E Mock Video'),
      access: openAccess(),
    });

    await page.goto(`/${token}`);

    await expect(page.getByText(/no longer valid|contact support/i)).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('iframe[title="E2E Mock Video"]')).toBeVisible();
  });

  test('plays the media for a visitor without a session', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await openMediaViaUI(page, title);

    const batchName = `Batch ${uniqueId(testInfo.testId)}`;
    const token = await createTokenViaUI(page, batchName, 1);
    expect(token).toBeTruthy();

    await mockAccess(page, {
      title,
      embed: videoEmbed('E2E Public Video'),
      access: openAccess(),
    });

    // Whoever holds the token URL may watch, so drop the admin session first.
    await page.context().clearCookies();
    await page.goto(`/${token}`);

    await expect(page).toHaveURL(`/${token}`);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('iframe[title="E2E Public Video"]')).toBeVisible();
    // The admin hint belongs to the admin UI, not to a visitor's token page.
    await expect(page.getByText('Media Access Manager Admin')).toHaveCount(0);
  });

  test('names the media and how much access is left', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await openMediaViaUI(page, title);

    const batchName = `Batch ${uniqueId(testInfo.testId)}`;
    const token = await createTokenViaUI(page, batchName, 1);
    expect(token).toBeTruthy();

    // An hour past the three days so the page cannot round down to two while
    // the browser is still navigating.
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000);
    await mockAccess(page, {
      title,
      embed: videoEmbed('E2E Countdown Video'),
      access: { expiresAt: expiresAt.toISOString(), usageLimit: 5, usageCount: 2 },
    });

    await page.goto(`/${token}`);

    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('3 days left')).toBeVisible();
    await expect(page.getByText('can be opened 3 more times')).toBeVisible();
  });

  test('says a link never expires only when nothing else limits it', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await openMediaViaUI(page, title);

    const batchName = `Batch ${uniqueId(testInfo.testId)}`;
    const token = await createTokenViaUI(page, batchName, 1);
    expect(token).toBeTruthy();

    await mockAccess(page, {
      title,
      embed: videoEmbed('E2E Endless Video'),
      access: openAccess(),
    });

    await page.goto(`/${token}`);

    await expect(page.getByText('This link does not expire')).toBeVisible({ timeout: 5000 });
    // Without a usage limit there is no view count to report.
    await expect(page.getByText(/can be opened/)).toHaveCount(0);

    // A usage limit ends the access just as surely as a date would, so the
    // view count replaces the expiry line rather than sitting next to it.
    await mockAccess(page, {
      title,
      embed: videoEmbed('E2E Endless Video'),
      access: { expiresAt: null, usageLimit: 4, usageCount: 1 },
    });
    await page.reload();

    await expect(page.getByText('can be opened 3 more times')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('This link does not expire')).toHaveCount(0);
  });

  test('reports an unavailable video instead of blaming the token', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await openMediaViaUI(page, title);

    const batchName = `Batch ${uniqueId(testInfo.testId)}`;
    const token = await createTokenViaUI(page, batchName, 1);
    expect(token).toBeTruthy();

    // Stands in for a video the provider refuses to hand out an embed for,
    // e.g. one whose Vimeo embed privacy is set to private.
    await page.route(/\/api\/access\/[^/]+/, async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 502, statusMessage: 'Bad Gateway', data: { reason: 'media_unavailable' } }),
      });
    });

    await page.goto(`/${token}`);

    await expect(page.getByText(/currently unavailable/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/no longer valid/i)).not.toBeVisible();
  });
  test('deletes media with its tokens after confirmation', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await openMediaViaUI(page, title);
    const batchName = `Batch ${uniqueId(testInfo.testId)}`;
    const token = await createTokenViaUI(page, batchName, 1);
    expect(token).toBeTruthy();

    // Cancelling must leave the media untouched.
    await page.getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(title)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL('/', { timeout: 10000 });
    await expect(page.getByRole('row').filter({ hasText: title })).toHaveCount(0);

    // The token went with the media, so its link no longer opens anything.
    await page.goto(`/${token}`);
    await expect(page.getByText(/no longer valid/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows a failing playback check with provider setup instructions', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await mockAccessibility(page, {
      status: 'error',
      issues: [{ code: 'vimeo_embed_disabled', severity: 'error' }],
    });

    await openMediaViaUI(page, title);

    await expect(page.getByText('Not playable')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Embedding is turned off for this video/i)).toBeVisible();
    // A failing check opens the checklist, so the fix is readable without a click.
    await expect(page.getByText(/Set "Where can this be embedded\?" to "Specific domains"/i).first()).toBeVisible();
  });

  test('reports a playable video and names its domain restriction', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await mockAccessibility(page, {
      status: 'warning',
      issues: [{
        code: 'vimeo_embed_whitelist_domains',
        severity: 'warning',
        details: { domains: 'peac-video.com' },
      }],
    });

    await openMediaViaUI(page, title);

    await expect(page.getByText('Playable with limits')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Plays only on these domains: peac-video\.com/i)).toBeVisible();
  });
  test('shows no warning when the app host is on the provider whitelist', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await mockAccessibility(page, { status: 'ok', issues: [] });

    await openMediaViaUI(page, title);

    await expect(page.getByText('Playable', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Visitors with a valid token can watch/i)).toBeVisible();
    await expect(page.getByText(/Plays only on these domains/i)).toHaveCount(0);
  });
});
