import { test, expect } from '@playwright/test';

test('map renders and editor controls work without runtime exceptions', async ({page}) => {
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'みどり野市'})).toBeVisible();
  const canvas=page.locator('.map-host canvas');
  await expect(canvas).toBeVisible({timeout:30_000});
  await expect(page.getByText('マップ稼働中')).toBeVisible();
  await page.locator('.tool-tile').filter({hasText:'道路'}).click();
  await expect(page.locator('.view-modes button').nth(1)).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'縮小'}).click();
  await page.getByRole('button',{name:'拡大'}).click();
  await page.getByRole('button',{name:'マップを中央に戻す'}).click();
  await page.locator('.view-modes button').first().click();
  await expect(page.locator('.view-modes button').first()).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.map-host canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('save, policy and reload preserve a changed city', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'政策と行政'}).click();
  await page.locator('.policy-option').filter({hasText:'産業振興'}).click();
  await expect(page.locator('.policy-option.current')).toContainText('産業振興');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByText('手動保存完了')).toBeVisible();
  await page.reload();
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'政策と行政'}).click();
  await expect(page.locator('.policy-option.current')).toContainText('産業振興');
});

test('no horizontal page overflow at configured viewport', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
});