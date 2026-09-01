import type { Page } from '@playwright/test';
import { expect, test } from '@nuxt/test-utils/playwright';
import {
  addMediaViaUI,
  createTokenViaUI,
  deleteTestData,
  login,
  mockAccessibility,
  mockAvailableMedia,
  pickAvailableVideo,
  PROVIDER_SETTINGS_URL,
  providerVideo,
  stubProviderCalls,
  uniqueId,
  videoEmbed,
} from '../support/admin';

/**
 * Creates a token straight through the admin API, the only way to get one whose
 * access window is already closed — the create dialog cannot travel back in
 * time. Runs inside the page for the same cookie reason as `deleteTestData`.
 */
async function createExpiredToken(page: Page, mediaId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const response = await fetch('/api/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mediaId: id,
        name: 'expired',
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
      }),
    });
    const created: { token: string } = await response.json();
    return created.token;
  }, mediaId);
}

/** The media list has no action column: opening media means clicking its row. */
async function openMediaViaUI(page: Page, title: string) {
  await page.getByRole('row').filter({ hasText: title }).click();
  await expect(page).toHaveURL(/\/media\/[^/]+/);
}

interface AccessWindow { expiresAt: string | null, usageLimit: number | null, usageCount: number }

/** A token with no expiry and no usage limit, i.e. the plainest access window. */
function openAccess(): AccessWindow {
  return { expiresAt: null, usageLimit: null, usageCount: 0 };
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

test.beforeEach(async ({ page }) => {
  await stubProviderCalls(page);
});

test.afterEach(async ({ page }) => {
  await deleteTestData(page);
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

  test('searches tokens across every batch', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await openMediaViaUI(page, title);

    const searchedBatch = `Batch A ${uniqueId(testInfo.testId)}`;
    const token = await createTokenViaUI(page, searchedBatch, 2);
    expect(token).toBeTruthy();
    const otherBatch = `Batch B ${uniqueId(testInfo.testId)}`;
    await createTokenViaUI(page, otherBatch, 2);

    // The search box sits outside the batches, so it is reachable without
    // opening any of them.
    const search = page.getByPlaceholder('Search tokens');
    await expect(search).toBeVisible();
    await search.fill(token);

    // The batch holding the hit opens itself; the one without a hit is gone.
    await expect(page.locator('code')).toHaveText([token]);
    await expect(page.getByRole('button').filter({ hasText: otherBatch })).toHaveCount(0);
    await expect(page.getByRole('button').filter({ hasText: searchedBatch })).toBeVisible();

    await search.fill('no-token-has-this-value');
    await expect(page.getByText('No tokens match this search.')).toBeVisible();

    await search.clear();
    await expect(page.getByRole('button').filter({ hasText: otherBatch })).toBeVisible();
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
    // The publisher is linked in the header and the footer, with the upstream
    // project credited next to it. The bug-report invitation shows for everyone.
    await expect(page.getByRole('link', { name: 'Visit Example Publisher' }))
      .toHaveAttribute('href', 'https://publisher.example');
    await expect(page.getByRole('link', { name: 'Example Publisher', exact: true }))
      .toHaveAttribute('href', 'https://publisher.example');
    await expect(page.getByRole('link', { name: 'Example Studio' }))
      .toHaveAttribute('href', 'https://studio.example');
    await expect(page.getByRole('link', { name: 'Ask on GitHub' })).toBeVisible();
  });

  test('offers a mail link for further access once a token has expired', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);
    await openMediaViaUI(page, title);

    const mediaId = page.url().split('/media/')[1] ?? '';
    expect(mediaId).toBeTruthy();
    const token = await createExpiredToken(page, mediaId);
    expect(token).toBeTruthy();

    // The visitor holding the expired link has no admin session, so they get
    // the support route rather than the admin's way into the media.
    await page.context().clearCookies();
    await page.goto(`/${token}`);

    await expect(page.getByText(/access to this video has ended/i)).toBeVisible({ timeout: 5000 });
    // The visitor still learns which video they lost access to.
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const requestAccess = page.getByRole('link', { name: /request further access/i });
    await expect(requestAccess).toHaveAttribute('href', /^mailto:support@example\.com\?/);
    const href = decodeURIComponent(await requestAccess.getAttribute('href') ?? '');
    expect(href).toContain(token);
    expect(href).toContain(title);
    await expect(page.getByRole('link', { name: /open media details/i })).toHaveCount(0);
  });

  test('sends an admin from an expired link to the media instead of to support', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);
    await openMediaViaUI(page, title);

    const mediaId = page.url().split('/media/')[1] ?? '';
    const token = await createExpiredToken(page, mediaId);
    expect(token).toBeTruthy();

    // Still logged in: the admin is checking a link they handed out themselves.
    await page.goto(`/${token}`);

    await expect(page.getByText(/access to this video has ended/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: /request further access/i })).toHaveCount(0);
    await page.getByRole('link', { name: /open media details/i }).click();
    await expect(page).toHaveURL(`/media/${mediaId}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  });

  test('reports an unknown link as invalid without offering a mail link', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/not-a-real-token');

    await expect(page.getByText(/no longer valid/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: /request further access/i })).toHaveCount(0);
    // Nothing to name: an unknown link never granted access to any video.
    await expect(page.getByRole('heading')).toHaveText(/no longer valid/i);
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
    await expect(page.getByText(/click the round "Embed" button/i).first()).toBeVisible();
    // Fixing it happens at the provider, so the page links straight to the video there.
    await expect(page.getByRole('link', { name: 'Open video at provider' }))
      .toHaveAttribute('href', PROVIDER_SETTINGS_URL);
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
