import { expect, test } from '@playwright/test';

test('boots the city shell and Phaser canvas without browser errors', async ({ page }) => {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page.getByTestId('city-app')).toBeVisible();
  await expect(page.getByTestId('game-canvas-host').locator('canvas')).toHaveCount(1);
  await expect(page.getByText('CITY')).toBeVisible();
  expect(errors).toEqual([]);
});
