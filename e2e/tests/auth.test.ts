import { expect, test } from '@nuxt/test-utils/playwright';

test.describe('Admin Auth', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    // The login page opts out of the layout entirely, so it carries neither the
    // publisher link nor the credit.
    await expect(page.locator('footer')).toBeHidden();
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
    // The publisher is linked twice: from the header icon and from the footer.
    await expect(page.getByRole('link', { name: 'Visit Example Publisher' }))
      .toHaveAttribute('href', 'https://publisher.example');
    await expect(page.getByRole('link', { name: 'Example Publisher', exact: true }))
      .toHaveAttribute('href', 'https://publisher.example');
    await expect(page.getByRole('link', { name: 'Example Studio' }))
      .toHaveAttribute('href', 'https://studio.example');
    await expect(page.getByRole('link', { name: 'Ask on GitHub' }))
      .toHaveAttribute('href', 'https://github.com/geprog/media-access-manager');
  });
});
