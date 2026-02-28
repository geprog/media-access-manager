import { expect, test } from '@nuxt/test-utils/playwright';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.fill('input[type="password"]', process.env.ADMIN_PASSWORD ?? 'test');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/', { timeout: 5000 });
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

test.describe('Media and Tokens', () => {
  test('add media', async ({ page }) => {
    await login(page);

    const mediaId = uniqueId('e2e-add');
    const title = `E2E Test Video ${Date.now()}`;
    const baseUrl = new URL(page.url()).origin;
    await page.evaluate(
      async ({ url, id, t }: { url: string, id: string, t: string }) => {
        const res = await fetch(`${url}/api/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            title: t,
            providerId: 'vimeo',
            providerConfig: {},
          }),
          credentials: 'include',
        });
        if (!res.ok)
          throw new Error(`media creation failed: ${res.status}`);
      },
      { url: baseUrl, id: mediaId, t: title },
    );
    await page.reload();

    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row.getByText(title)).toBeVisible({ timeout: 5000 });
    await expect(row.getByText('vimeo')).toBeVisible();
  });

  test('generate token for media', async ({ page }) => {
    await login(page);

    const mediaId = uniqueId('e2e-token');
    const title = `Token Test Video ${Date.now()}`;
    const baseUrl = new URL(page.url()).origin;
    await page.evaluate(
      async ({ url, id, t }: { url: string, id: string, t: string }) => {
        const res = await fetch(`${url}/api/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            title: t,
            providerId: 'vimeo',
            providerConfig: {},
          }),
          credentials: 'include',
        });
        if (!res.ok)
          throw new Error(`media creation failed: ${res.status}`);
      },
      { url: baseUrl, id: mediaId, t: title },
    );
    await page.reload();

    await page.getByRole('row').filter({ hasText: title }).getByRole('link', { name: 'View tokens' }).click();
    await expect(page).toHaveURL(new RegExp(`/media/${mediaId}`));

    const { token } = await page.evaluate(
      async ({ url, id }: { url: string, id: string }) => {
        const res = await fetch(`${url}/api/tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mediaId: id, name: 'E2E Test Token' }),
          credentials: 'include',
        });
        const data = (await res.json()) as { token?: string };
        if (!data?.token)
          throw new Error(`token creation failed: ${res.status}`);
        return { token: data.token };
      },
      { url: baseUrl, id: mediaId },
    );

    await page.reload();
    await expect(page.getByText(/No tokens yet/)).not.toBeVisible({ timeout: 3000 });
    const tokenCell = page.locator('code').first();
    await expect(tokenCell).toBeVisible();
    expect(token).toBeTruthy();
    expect(token.length).toBe(32);
  });

  test('use token to see media', async ({ page }) => {
    await login(page);

    const mediaId = uniqueId('e2e-access');
    const title = `Access Test Video ${Date.now()}`;
    const baseUrl = new URL(page.url()).origin;
    await page.evaluate(
      async ({ url, id, t }: { url: string, id: string, t: string }) => {
        const res = await fetch(`${url}/api/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            title: t,
            providerId: 'vimeo',
            providerConfig: {},
          }),
          credentials: 'include',
        });
        if (!res.ok)
          throw new Error(`media creation failed: ${res.status}`);
      },
      { url: baseUrl, id: mediaId, t: title },
    );
    await page.reload();

    await page.getByRole('row').filter({ hasText: title }).getByRole('link', { name: 'View tokens' }).click();

    const { token } = await page.evaluate(
      async ({ url, id }: { url: string, id: string }) => {
        const res = await fetch(`${url}/api/tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mediaId: id, name: 'E2E Test Token' }),
          credentials: 'include',
        });
        const data = (await res.json()) as { token?: string };
        if (!data?.token)
          throw new Error(`token creation failed: ${res.status}`);
        return { token: data.token };
      },
      { url: baseUrl, id: mediaId },
    );

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
        body: JSON.stringify({ valid: true, embed: mockEmbed }),
      });
    });

    await page.goto(`/${token}`);

    await expect(page.getByText(/no longer valid|contact the administrator/i)).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('iframe[title="E2E Mock Video"]')).toBeVisible();
  });
});
