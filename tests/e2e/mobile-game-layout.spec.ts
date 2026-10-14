import {expect,test} from '@playwright/test';

test('mobile city uses a map-first game HUD and quick build dock',async ({page},testInfo)=>{
  test.skip(!testInfo.project.name.includes('mobile'),'phone-only game layout');
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  const map=await page.locator('.map-host').boundingBox();
  const viewport=page.viewportSize();
  expect(map).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(map!.height).toBeGreaterThan(viewport!.height*.42);
  await expect(page.locator('.mobile-build-categories')).toBeVisible();
  await expect(page.locator('.tool-tile[data-category="zones"]:visible')).toHaveCount(3);
  await page.locator('.mobile-build-categories').getByRole('button',{name:/公共施設/}).click();
  await expect(page.locator('.tool-tile[data-category="services"]:visible')).toHaveCount(3);
  await expect(page.locator('.tool-tile[data-category="zones"]:visible')).toHaveCount(0);
  await page.getByRole('button',{name:'建設メニューを閉じる'}).click();
  await expect(page.locator('.mobile-build-categories')).toBeHidden();
  await expect(page.locator('.map-host canvas')).toBeVisible();
  await page.getByRole('button',{name:'建設メニューを開く'}).click();
  await expect(page.locator('.mobile-build-categories')).toBeVisible();
  await page.getByRole('button',{name:'都市データ管理'}).click();
  await expect(page.getByRole('dialog',{name:'都市データ管理'})).toBeVisible();
  await page.getByRole('dialog',{name:'都市データ管理'}).getByRole('button',{name:'閉じる',exact:true}).click();
  await page.getByRole('button',{name:'財政と経済'}).click();
  await expect(page.locator('.finance-panel')).toBeVisible();
  await expect(page.locator('.map-host canvas')).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test('two-finger city pinch zoom changes camera without painting',async ({page},testInfo)=>{
  test.skip(!testInfo.project.name.includes('mobile'),'phone-only multi-touch controls');
  await page.goto('/');
  const canvas=page.locator('.map-host canvas');
  await expect(canvas).toBeVisible({timeout:30_000});
  await page.locator('.mobile-build-categories').getByRole('button',{name:/道路/}).click();
  await page.locator('.tool-tile[data-category="roads"]').first().click();
  const funds=await page.locator('.stat').nth(1).locator('strong').innerText();
  const b=await canvas.boundingBox();
  expect(b).not.toBeNull();
  const centerX=b!.x+b!.width/2,centerY=b!.y+b!.height*.49;
  const session=await page.context().newCDPSession(page);
  const p=(id:number,x:number,y:number)=>({id,x,y,radiusX:4,radiusY:4,force:1});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[
    p(1,centerX-45,centerY),p(2,centerX+45,centerY)
  ]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
    p(1,centerX-130,centerY),p(2,centerX+130,centerY)
  ]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(canvas).toHaveAttribute('data-structure-detail','detail');
  expect(await page.locator('.stat').nth(1).locator('strong').innerText()).toBe(funds);
});
