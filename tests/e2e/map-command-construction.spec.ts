import {expect,test} from '@playwright/test';

test('in-map build palette returns to the city on mobile without scrolling',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  const canvas=page.locator('.map-host canvas');
  await expect(canvas).toBeVisible({timeout:30_000});
  const phone=(page.viewportSize()?.width??1000)<=700;
  const launcher=page.getByRole('button',{name:'地図の建設メニューを開く'});
  const panel=page.getByRole('group',{name:'地図建設コマンド'});
  await expect(launcher).toBeVisible();
  if(phone){
    await expect(page.locator('.mobile-build-categories')).toBeHidden();
  }
  const open=async ()=>{
    if(!await panel.isVisible())await launcher.click();
    await expect(panel).toBeVisible();
  };
  await open();
  if(phone)await expect(page.locator('.build-panel')).toBeHidden();
  await page.getByRole('button',{name:'地図で住宅地区を選択'}).click();
  await expect(page.locator('.view-modes button').nth(1)).toHaveAttribute('aria-pressed','true');
  if(phone){
    await expect(panel).toBeHidden();
    await expect(page.locator('.map-quick-trigger')).toContainText('住宅地区');
  }else{
    await expect(page.getByRole('button',{name:'地図で住宅地区を選択'})).toHaveAttribute('aria-pressed','true');
  }
  await open();
  const categories=page.getByRole('group',{name:'地図建設カテゴリ'});
  await categories.getByRole('button',{name:/道路/}).click();
  await page.getByRole('button',{name:'地図で道路を選択'}).click();
  await open();
  await categories.getByRole('button',{name:/公共施設/}).click();
  await expect(page.getByRole('button',{name:'地図で診療所を選択'})).toBeVisible();
  await categories.getByRole('button',{name:/調査/}).click();
  await expect(page.getByRole('button',{name:'地図で撤去を選択'})).toBeVisible();
  await expect(page.getByRole('button',{name:'直前の建設を元に戻す'})).toBeDisabled();
  const original=await page.locator('.date-label').innerText();
  await page.locator('.map-quick-menu').getByRole('button',{name:'翌月へ ›'}).click();
  await expect(page.locator('.date-label')).not.toHaveText(original);
  await page.getByRole('button',{name:'地図の建設メニューを閉じる'}).click();
  await expect(panel).toBeHidden();
  await expect(canvas).toBeVisible();
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

test('a mayor can jump to the active construction site and watch a real district grow',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  const canvas=page.locator('.map-host canvas');
  await expect(canvas).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'翌月へ進める',exact:true}).click();
  const focus=page.getByRole('button',{name:'工事現場へ移動する'});
  await expect(focus).toBeVisible();
  await expect(focus).toContainText('工事中');
  await focus.click();
  await expect(canvas).toHaveAttribute('data-focused-tile',/^\\d+,\\d+$/);
  await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});
