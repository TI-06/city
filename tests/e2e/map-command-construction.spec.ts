import {expect,test} from '@playwright/test';

test('in-map build commands work without scrolling on desktop and mobile',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  const trigger=page.getByRole('button',{name:'地図の建設メニューを開く'});
  await expect(trigger).toBeVisible();
  await trigger.click();
  const panel=page.getByRole('group',{name:'地図建設コマンド'});
  await expect(panel).toBeVisible();
  await page.getByRole('button',{name:'地図で住宅地区を選択'}).click();
  await expect(page.getByRole('button',{name:'地図で住宅地区を選択'})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.view-modes button').nth(1)).toHaveAttribute('aria-pressed','true');
  const groups=page.getByRole('group',{name:'地図建設カテゴリ'});
  await groups.getByRole('button',{name:/道路/}).click();
  await page.getByRole('button',{name:'地図で道路を選択'}).click();
  await expect(page.getByRole('button',{name:'地図で道路を選択'})).toHaveAttribute('aria-pressed','true');
  await groups.getByRole('button',{name:/公共施設/}).click();
  await expect(page.getByRole('button',{name:'地図で診療所を選択'})).toBeVisible();
  await groups.getByRole('button',{name:/調査/}).click();
  await expect(page.getByRole('button',{name:'地図で撤去を選択'})).toBeVisible();
  const date=await page.locator('.date-label').innerText();
  await page.locator('.map-quick-menu').getByRole('button',{name:'翌月へ ›'}).click();
  await expect(page.locator('.date-label')).not.toHaveText(date);
  await page.getByRole('button',{name:'地図の建設メニューを閉じる'}).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.map-host canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('construction is a visible state after a month rather than instant buildings',async ({page})=>{
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'翌月へ進める',exact:true}).click();
  await expect(page.locator('.notice')).toContainText(/着工|工事|完成/);
  // The canvas remains playable, and the city can proceed over additional
  // months while the worksite updates from the simulated construction dates.
  await page.getByRole('button',{name:'翌月へ進める',exact:true}).click();
  await expect(page.locator('.map-host canvas')).toBeVisible();
});
