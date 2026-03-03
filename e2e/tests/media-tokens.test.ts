import type { Page } from '@playwright/test';
import { expect, test } from '@nuxt/test-utils/playwright';

async function login(page: Page) {
  await page.goto('/');
  await page.fill('input[type="password"]', process.env.NUXT_ADMIN_PASSWORD ?? 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/', { timeout: 5000 });
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

async function addMediaViaUI(
  page: Page,
  title: string,
  videoId = '1234567890',
) {
  await page.getByRole('button', { name: 'Add Media' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Video ID').fill(videoId);
  await dialog.getByRole('button', { name: 'Add Media' }).click();
  await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible({ timeout: 10000 });
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

test.describe('Media and Tokens', () => {
  test('add media', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row.getByText(title)).toBeVisible({ timeout: 5000 });
    await expect(row.getByText('vimeo')).toBeVisible();
  });

  test('generate token for media', async ({ page }, testInfo) => {
    await login(page);

    const title = `E2E: ${testInfo.title} ${uniqueId(testInfo.testId)}`;
    await addMediaViaUI(page, title);

    await page.getByRole('row').filter({ hasText: title }).getByRole('link', { name: 'View tokens' }).click();
    await expect(page).toHaveURL(/\/media\/[^/]+/);

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

    await page.getByRole('row').filter({ hasText: title }).getByRole('link', { name: 'View tokens' }).click();

    const batchName = `Batch ${uniqueId(testInfo.testId)}`;
    const token = await createTokenViaUI(page, batchName, 1);
    expect(token).toBeTruthy();

    const mockEmbed = {
      type: 'video',
      version: '1.0',
      title: 'E2E Mock Video',
      html: '<iframe src="https://example.com/e2e-mock-video" title="E2E Mock Video"></iframe>',
      width: 640,
      height: 360,
    };
    await page.route(/\/api\/access\/[^/]+/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEmbed),
      });
    });

    await page.goto(`/${token}`);

    await expect(page.getByText(/no longer valid|contact the administrator/i)).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('iframe[title="E2E Mock Video"]')).toBeVisible();
  });
});
