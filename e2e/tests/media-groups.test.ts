import type { Page } from '@playwright/test';
import { expect, test } from '@nuxt/test-utils/playwright';
import {
  addMediaViaUI,
  createTokenViaUI,
  deleteTestData,
  login,
  stubProviderCalls,
  uniqueId,
  videoEmbed,
} from '../support/admin';

async function createGroupViaUI(page: Page, name: string, mediaTitles: string[]) {
  await page.goto('/groups');
  await page.getByRole('button', { name: 'Create group' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Media', exact: true }).click();
  for (const title of mediaTitles) {
    await page.getByRole('option', { name: title }).click();
  }
  // The menu stays open for further picks and swallows clicks until it closes.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await dialog.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible({ timeout: 10000 });
}

async function openGroupViaUI(page: Page, name: string) {
  await page.getByRole('row').filter({ hasText: name }).click();
  await expect(page).toHaveURL(/\/groups\/[^/]+/);
}

/**
 * Stands in for the endpoint that hands out one media of a group. The real one
 * asks the provider for an embed, which no test may reach.
 */
async function mockGroupMediaAccess(page: Page, iframeTitle: string) {
  await page.route('**/api/access/*/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'media',
        title: iframeTitle,
        embed: videoEmbed(iframeTitle),
        access: { expiresAt: null, usageLimit: 3, usageCount: 1 },
      }),
    });
  });
}

interface GroupMediaStub {
  id: string
  title: string
  blockedBy: string | null
  usageLimit: number | null
  usageCount: number
}

/** Serves a group listing the server would only produce after real usage. */
async function mockGroupListing(page: Page, title: string, media: GroupMediaStub[]) {
  await page.route(/\/api\/access\/[^/]+$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'group',
        title,
        access: { expiresAt: null, usageLimit: media[0]?.usageLimit ?? null },
        media,
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await stubProviderCalls(page);
});

test.afterEach(async ({ page }) => {
  await deleteTestData(page);
});

test.describe('Media groups', () => {
  test('hands out one token for a whole set of media', async ({ page }, testInfo) => {
    await login(page);

    const suffix = uniqueId(testInfo.testId);
    const first = `E2E Group Video A ${suffix}`;
    const second = `E2E Group Video B ${suffix}`;
    await addMediaViaUI(page, first, '811000001');
    await addMediaViaUI(page, second, '811000002');

    const groupName = `E2E Group ${suffix}`;
    await createGroupViaUI(page, groupName, [first, second]);
    await openGroupViaUI(page, groupName);

    // Both media are named on the group page, so the admin sees what one token
    // unlocks before handing it out.
    await expect(page.getByRole('link', { name: first })).toBeVisible();
    await expect(page.getByRole('link', { name: second })).toBeVisible();

    const token = await createTokenViaUI(page, `E2E Batch ${suffix}`, 1);
    expect(token).toHaveLength(32);

    // The visitor holding the link picks a video instead of being dropped into
    // one, and nothing is spent by looking.
    await page.context().clearCookies();
    await page.goto(`/${token}`);

    await expect(page.getByRole('heading', { name: groupName })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: first })).toBeVisible();
    await expect(page.getByRole('heading', { name: second })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Watch' })).toHaveCount(2);

    await mockGroupMediaAccess(page, 'E2E Group Player');
    await page.getByRole('link', { name: 'Watch' }).first().click();

    await expect(page).toHaveURL(/\/[^/]+\/[^/]+$/);
    await expect(page.locator('iframe[title="E2E Group Player"]')).toBeVisible({ timeout: 10000 });
    // The list is one click away again, so the other videos stay reachable.
    await page.getByRole('link', { name: /back to the list/i }).click();
    await expect(page).toHaveURL(`/${token}`);
  });

  test('counts the usage limit for each media of the group on its own', async ({ page }, testInfo) => {
    await login(page);

    const suffix = uniqueId(testInfo.testId);
    const first = `E2E Limit Video A ${suffix}`;
    const second = `E2E Limit Video B ${suffix}`;
    await addMediaViaUI(page, first, '812000001');
    await addMediaViaUI(page, second, '812000002');

    const groupName = `E2E Limit Group ${suffix}`;
    await createGroupViaUI(page, groupName, [first, second]);
    await openGroupViaUI(page, groupName);

    await createTokenViaUI(page, `E2E Limit Batch ${suffix}`, 1, { usageLimit: 2 });
    // The token's limit belongs to each media, so the count beside it must not
    // read as a budget for the token as a whole.
    await expect(page.getByText('max. 2 per medium')).toBeVisible();

    const token = await page.locator('code').first().textContent() ?? '';
    await page.context().clearCookies();

    // One media used up while the other still has both its views left.
    await mockGroupListing(page, groupName, [
      { id: 'used-up', title: first, blockedBy: 'usage_limit_reached', usageLimit: 2, usageCount: 2 },
      { id: 'still-open', title: second, blockedBy: null, usageLimit: 2, usageCount: 1 },
    ]);
    await page.goto(`/${token}`);

    await expect(page.getByRole('heading', { name: first })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No views left')).toBeVisible();
    await expect(page.getByText('1 view left')).toBeVisible();
    // Exactly one video is still openable; the used-up one offers no way in.
    await expect(page.getByRole('link', { name: 'Watch' })).toHaveCount(1);
    await expect(page.getByText(/can no longer be opened with your link/i)).toBeVisible();
  });

  test('sends a visitor whose group link expired to support', async ({ page }, testInfo) => {
    await login(page);

    const suffix = uniqueId(testInfo.testId);
    const title = `E2E Expired Video ${suffix}`;
    await addMediaViaUI(page, title, '813000001');

    const groupName = `E2E Expired Group ${suffix}`;
    await createGroupViaUI(page, groupName, [title]);
    await openGroupViaUI(page, groupName);

    const groupId = page.url().split('/groups/')[1] ?? '';
    expect(groupId).toBeTruthy();
    // Only the API can produce a token whose window is already closed.
    const token = await page.evaluate(async (id) => {
      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupId: id,
          name: 'expired',
          expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
        }),
      });
      const created: { token: string } = await response.json();
      return created.token;
    }, groupId);

    await page.context().clearCookies();
    await page.goto(`/${token}`);

    // The visitor still learns which access they lost, and gets a way to ask
    // for it back rather than a list they cannot open anything from.
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/access to this video has ended/i)).toBeVisible();
    const requestAccess = page.getByRole('link', { name: /request further access/i });
    await expect(requestAccess).toHaveAttribute('href', /^mailto:support@example\.com\?/);
    await expect(page.getByRole('link', { name: 'Watch' })).toHaveCount(0);
  });

  test('deletes a group with its tokens but keeps the media', async ({ page }, testInfo) => {
    await login(page);

    const suffix = uniqueId(testInfo.testId);
    const title = `E2E Kept Video ${suffix}`;
    await addMediaViaUI(page, title, '814000001');

    const groupName = `E2E Doomed Group ${suffix}`;
    await createGroupViaUI(page, groupName, [title]);
    await openGroupViaUI(page, groupName);
    const token = await createTokenViaUI(page, `E2E Doomed Batch ${suffix}`, 1);

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL('/groups', { timeout: 10000 });
    await expect(page.getByRole('row').filter({ hasText: groupName })).toHaveCount(0);

    // The link is dead, but the media it pointed at is untouched.
    await page.goto(`/${token}`);
    await expect(page.getByText(/no longer valid/i)).toBeVisible({ timeout: 10000 });
    await page.goto('/');
    await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible();
  });
});
