import { test, expect } from '@playwright/test';

test('map renders and editor controls work without runtime exceptions', async ({page}) => {
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'みどり野市'})).toBeVisible();
  const canvas=page.locator('.map-host canvas');
  await expect(canvas).toBeVisible({timeout:30_000});
  await expect(page.locator('.map-status')).toContainText('マップ稼働中');
  await page.locator('.tool-tile[title="道路を建設"]').click();
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
test('traffic dashboard and congestion heatmap are reachable on desktop and mobile', async ({page}) => {
  const errors:string[]=[];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:/交通・物流/}).click();
  await expect(page.getByText('交通分析')).toBeVisible();
  await expect(page.getByRole('meter',{name:'推定混雑度'})).toBeVisible();
  await expect(page.locator('.traffic-legend')).toBeVisible();
  await expect(page.getByText('交通による企業生産効率')).toBeVisible();
  await expect(page.getByText('平均通勤距離')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobility policy can be activated and restored after reload', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'政策と行政'}).click();
  await page.locator('.policy-option').filter({hasText:'公共交通重視'}).click();
  await expect(page.locator('.policy-option.current')).toContainText('公共交通重視');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByText('手動保存完了')).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'政策と行政'}).click();
  await expect(page.locator('.policy-option.current')).toContainText('公共交通重視');
});

test('arterial upgrade tool is available in the city map editor on mobile and desktop', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'都市建設'}).click();
  const arterial=page.locator('.tool-tile').filter({hasText:'幹線道路'});
  await arterial.click();
  await expect(arterial).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.view-modes button').nth(1)).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/交通・物流/}).click();
  await expect(page.getByText('幹線道路に改良済み')).toBeVisible();
  await expect(page.getByText(/容量は85、幹線道路は220/)).toBeVisible();
});

test('resident land valuation map and neighborhood metrics work on desktop and mobile', async ({page}) => {
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'住民と人口'}).click();
  await expect(page.locator('.land-legend')).toBeVisible();
  await expect(page.getByText('住宅地の平均土地評価')).toBeVisible();
  await expect(page.getByText('高評価の土地')).toBeVisible();
  await expect(page.locator('.map-host canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('residential demand dashboard explains actual occupancy and rent on desktop/mobile', async ({page}) => {
  const errors:string[]=[];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'住民と人口'}).click();
  await expect(page.getByText('住宅の収容人数')).toBeVisible();
  await expect(page.getByText('住宅の空き')).toBeVisible();
  await expect(page.getByText('推定家賃')).toBeVisible();
  await expect(page.getByText('家賃負担率')).toBeVisible();
  await expect(page.getByText('来月の推定人口移動')).toBeVisible();
  await expect(page.locator('.housing-advice')).toBeVisible();
  expect(errors).toEqual([]);
});

test('maintenance strategy changes finance expenditure and survives save/reload',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'財政と経済'}).click();
  await expect(page.getByText('インフラ更新予算')).toBeVisible();
  await expect(page.getByRole('meter',{name:'施設健全度'})).toBeVisible();
  const minimum=page.getByRole('button',{name:/最低限の維持/});
  await minimum.click();
  await expect(minimum).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('次月の修繕積み残し見込み')).toBeVisible();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByText('手動保存完了')).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'財政と経済'}).click();
  await expect(page.getByRole('button',{name:/最低限の維持/})).toHaveAttribute('aria-pressed','true');
  expect(errors).toEqual([]);
});

test('capital investment spends city budget and survives a save/reload',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>{void dialog.accept();});
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'財政と経済'}).click();
  await expect(page.getByText('都市の大型投資')).toBeVisible();
  await expect(page.getByText('公共投資の運営費')).toBeVisible();
  const card=page.locator('.capital-card').filter({hasText:'住宅負担支援'});
  await expect(card).toContainText('Lv.0 / 3');
  await card.getByRole('button',{name:'住宅負担支援へ投資'}).click();
  await expect(card).toContainText('Lv.1 / 3');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByText('手動保存完了')).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'財政と経済'}).click();
  await expect(page.locator('.capital-card').filter({hasText:'住宅負担支援'})).toContainText('Lv.1 / 3');
  await page.getByRole('button',{name:'住民と人口'}).click();
  await expect(page.getByText('支援後の家賃負担')).toBeVisible();
  expect(errors).toEqual([]);
});

test('austerity and borrowing are available on desktop/mobile and saved safely', async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>{void dialog.accept();});
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'財政と経済'}).click();
  await expect(page.getByText('財政再建・市債')).toBeVisible();
  const austerity=page.getByRole('button',{name:/支出抑制/});
  await austerity.click();
  await expect(austerity).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'市債を発行する'}).click();
  await expect(page.getByText('毎月の返済（元金＋利息）')).toBeVisible();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByText('手動保存完了')).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'財政と経済'}).click();
  await expect(page.getByRole('button',{name:/支出抑制/})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('財政再建・市債')).toBeVisible();
  expect(errors).toEqual([]);
});
