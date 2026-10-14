import {expect,test} from '@playwright/test';

test('city play is one persistent map for construction, tax, policy and investment controls',async ({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 const map=page.locator('.map-host canvas');
 await expect(map).toBeVisible({timeout:30_000});
 await expect(page.getByRole('button',{name:'街を運営'})).toBeVisible();
 await expect(page.getByRole('button',{name:'都市データ'})).toBeVisible();
 const manager=page.getByRole('button',{name:'都市運営メニューを開く'});
 await manager.click();
 await expect(page.getByRole('group',{name:'都市運営コマンド'})).toBeVisible();
 await page.getByRole('group',{name:'地図上の市政方針'}).getByRole('button',{name:'産業振興'}).click();
 await expect(page.getByRole('group',{name:'地図上の市政方針'}).getByRole('button',{name:'産業振興'})).toHaveAttribute('aria-pressed','true');
 await expect(map).toBeVisible();
 await page.getByRole('group',{name:'都市運営コマンド'}).getByRole('button',{name:'税率'}).click();
 const tax=page.getByRole('slider',{name:/住民税率/});
 await expect(tax).toBeVisible();
 await tax.focus();
 await tax.press('ArrowLeft');
 await expect(tax).toHaveValue('8');
 await page.getByRole('group',{name:'都市運営コマンド'}).getByRole('button',{name:'投資'}).click();
 await expect(page.getByRole('button',{name:/交通改善事業 Lv/})).toBeVisible();
 await page.getByRole('group',{name:'都市運営コマンド'}).getByRole('button',{name:'交通'}).click();
 await expect(page.getByRole('group',{name:'簡易交通分析'})).toBeVisible();
 await expect(map).toBeVisible();
 await page.getByRole('button',{name:'地図に戻る ✓'}).click();
 await expect(map).toBeVisible();
 expect(errors).toEqual([]);
});

test('data subtabs do not multiply the primary app navigation',async ({page})=>{
 await page.goto('/');
 const primary=page.getByRole('navigation',{name:'メインメニュー'});
 await expect(primary.getByRole('button')).toHaveCount(2);
 await primary.getByRole('button',{name:'都市データ'}).click();
 const sub=page.getByRole('navigation',{name:'都市データの切替'});
 await expect(sub.getByRole('button')).toHaveCount(4);
 await sub.getByRole('button',{name:'住民と人口'}).click();
 await expect(page.getByText('住民と都市の成長')).toBeVisible();
 await sub.getByRole('button',{name:'財政と経済'}).click();
 await expect(page.locator('.finance-panel')).toBeVisible();
 await primary.getByRole('button',{name:'街を運営'}).click();
 await expect(sub).toHaveCount(0);
 await expect(page.locator('.map-host canvas')).toBeVisible();
});
