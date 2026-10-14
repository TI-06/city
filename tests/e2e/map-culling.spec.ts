import {expect,test} from '@playwright/test';

test('render visible structures only, adapt detail to zoom, and keep map usable',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  const canvas=page.locator('.map-host canvas');
  await expect(canvas).toBeVisible({timeout:30_000});
  await expect(canvas).toHaveAttribute('data-structure-detail',/overview|detail/);
  const initial=await canvas.evaluate(el=>({
    tiles:Number((el as HTMLCanvasElement).dataset.structureTiles),
    builds:Number((el as HTMLCanvasElement).dataset.structureBuilds),
  }));
  expect(initial.tiles).toBeGreaterThan(0);
  expect(initial.tiles).toBeLessThanOrEqual(4096);
  expect(initial.builds).toBeGreaterThanOrEqual(1);

  for(let i=0;i<5;i++)await page.getByRole('button',{name:'拡大',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-structure-detail','detail');
  const zoomed=await canvas.evaluate(el=>Number((el as HTMLCanvasElement).dataset.structureTiles));
  expect(zoomed).toBeGreaterThan(0);
  expect(zoomed).toBeLessThan(4096); // zoomed camera renders only a small part of 64x64.

  const bounds=await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const b=bounds!;
  await page.mouse.move(b.x+b.width*.45,b.y+b.height*.45);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width*.74,b.y+b.height*.60,{steps:6});
  await page.mouse.up();
  await expect(canvas).toBeVisible();
  await page.getByRole('button',{name:'マップを中央に戻す'}).click();
  await page.getByRole('button',{name:'住民と人口'}).click();
  await expect(page.locator('.land-legend')).toBeVisible();
  await page.getByRole('button',{name:/交通・物流/}).click();
  await expect(page.locator('.traffic-legend')).toBeVisible();
  expect(errors).toEqual([]);
});
