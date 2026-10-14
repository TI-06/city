import {expect,test} from '@playwright/test';

test('building players can immediately advance one month and understand construction progress',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  const status=(await page.locator('.mobile-progress-chip').isVisible())
    ?page.locator('.mobile-progress-chip')
    :page.getByRole('region',{name:'都市開発の進捗'});
  await expect(status).toBeVisible();
  await expect(page.getByRole('button',{name:'翌月へ進める',exact:true})).toBeVisible();
  const date=page.locator('.date-label');
  const original=await date.innerText();
  await page.getByRole('button',{name:'翌月へ進める',exact:true}).click();
  await expect(date).not.toHaveText(original);
  await expect(page.locator('.notice')).toContainText('新築');
  await expect(page.locator('.notice')).toContainText('人口');
  await expect(status).toContainText('建築待ち');
  expect(errors).toEqual([]);
});
