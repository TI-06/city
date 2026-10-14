import {expect,test} from '@playwright/test';

test('building players can immediately advance one month and understand construction progress',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('region',{name:'都市開発の進捗'})).toBeVisible();
  await expect(page.getByRole('button',{name:'翌月へ進める',exact:true})).toBeVisible();
  const date=page.locator('.date-label');
  const original=await date.innerText();
  await page.getByRole('button',{name:'翌月へ進める',exact:true}).click();
  await expect(date).not.toHaveText(original);
  await expect(page.locator('.notice')).toContainText('新築');
  await expect(page.locator('.notice')).toContainText('人口');
  await expect(page.getByRole('region',{name:'都市開発の進捗'})).toContainText('建築待ち');
  expect(errors).toEqual([]);
});
