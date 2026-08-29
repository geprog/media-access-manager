import { expect, test } from '@nuxt/test-utils/playwright';

test.describe('Admin Auth', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows error on invalid password', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.getByText(/invalid|error/i)).toBeVisible({ timeout: 5000 });
  });

  test('login and access media list with valid password', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="password"]', process.env.NUXT_ADMIN_PASSWORD ?? 'password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/', { timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Media', exact: true })).toBeVisible();
    await expect(page.getByText('Media Access Manager Admin')).toBeVisible();
  });
});
