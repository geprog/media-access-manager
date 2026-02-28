import { expect, test } from '@nuxt/test-utils/playwright';

test.describe('Page Navigation', () => {
  test('should navigate to the Start page on click', async ({ page }) => {
    await page.goto('/');
    await page.click('text="Start page"');
    await expect(page).toHaveURL('/');
    await expect(page).toHaveScreenshot('start-page.png');
  });

  test('should navigate to the Other page on click', async ({ page }) => {
    await page.goto('/');
    await page.click('text="Other page"');
    await expect(page).toHaveURL('/other');
    await expect(page).toHaveScreenshot('other-page.png');
  });
});
