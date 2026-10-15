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
  await page.getByRole('button',{name:'建設メニューを開く',exact:true}).click();
  await expect(page.locator('.mobile-build-categories')).toBeVisible();
  await expect(page.locator('.tool-tile[data-category="zones"]:visible')).toHaveCount(3);
  await page.locator('.mobile-build-categories').getByRole('button',{name:/公共施設/}).click();
  await expect(page.locator('.tool-tile[data-category="services"]:visible')).toHaveCount(3);
  await expect(page.locator('.tool-tile[data-category="zones"]:visible')).toHaveCount(0);
  await page.getByRole('button',{name:'建設メニューを閉じる',exact:true}).click();
  await expect(page.locator('.mobile-build-categories')).toBeHidden();
  await expect(page.locator('.map-host canvas')).toBeVisible();
  await page.getByRole('button',{name:'建設メニューを開く',exact:true}).click();
  await expect(page.locator('.mobile-build-categories')).toBeVisible();
  await page.getByRole('button',{name:'都市データ管理'}).click();
  await expect(page.getByRole('dialog',{name:'都市データ管理'})).toBeVisible();
  await page.getByRole('dialog',{name:'都市データ管理'}).getByRole('button',{name:'閉じる',exact:true}).click();
  await page.getByRole('button',{name:'都市データ',exact:true}).click();
  await page.getByRole('navigation',{name:'都市データの切替'}).getByRole('button',{name:'財政と経済'}).click();
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
  await page.getByRole('button',{name:'建設メニューを開く',exact:true}).click();
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

test('phone city controls are thumb reachable without blocking each other',async ({page},testInfo)=>{
  test.skip(!testInfo.project.name.includes('mobile'),'phone-only thumb controls');
  await page.setViewportSize({width:360,height:740});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  const canvas=page.locator('.map-host canvas');
  await expect(canvas).toBeVisible({timeout:30_000});
  const build=page.getByRole('button',{name:'地図の建設メニューを開く'});
  const operations=page.getByRole('button',{name:'都市運営メニューを開く'});
  const play=page.getByRole('button',{name:'地図で再生'});
  const next=page.getByRole('button',{name:'地図で翌月へ進める'});
  for(const control of [build,operations,play,next])await expect(control).toBeVisible();
  const rectangles=await Promise.all([build,operations,play,next].map(async control=>control.boundingBox()));
  for(let i=0;i<rectangles.length;i++){
    const a=rectangles[i]!;
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x+a.width).toBeLessThanOrEqual(361);
    expect(a.height).toBeGreaterThanOrEqual(40);
    for(let j=0;j<i;j++){
      const b=rectangles[j]!;
      const intersection=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))
        *Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
      expect(intersection).toBeLessThan(5);
    }
  }
  const before=await page.locator('.date-label').innerText();
  await next.click();
  await expect(page.locator('.date-label')).not.toHaveText(before);
  await play.click();
  await expect(page.getByRole('button',{name:'地図で一時停止'})).toBeVisible();
  await page.getByRole('button',{name:'地図で一時停止'}).click();
  await build.click();
  await expect(page.getByRole('group',{name:'地図建設コマンド'})).toBeVisible();
  await expect(operations).toBeHidden();
  await expect(next).toBeHidden();
  await page.getByRole('button',{name:'地図で住宅地区を選択'}).click();
  await expect(page.getByRole('button',{name:'地図の建設メニューを開く'})).toBeVisible();
  await operations.click();
  await expect(page.getByRole('group',{name:'都市運営コマンド'})).toBeVisible();
  await expect(build).toBeHidden();
  await page.getByRole('group',{name:'都市運営コマンド'}).getByRole('button',{name:'予算'}).click();
  await expect(page.getByRole('group',{name:'地図上の保全計画'})).toBeVisible();
  await page.getByRole('button',{name:'地図に戻る ✓'}).click();
  await expect(next).toBeVisible();
  await page.getByRole('button',{name:'縮小'}).click();
  await page.getByRole('button',{name:'マップを中央に戻す'}).click();
  const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  expect(horizontalOverflow).toBe(false);
  expect(errors).toEqual([]);
});

test('narrow phone retains reachable map controls at 320 pixels',async ({page},testInfo)=>{
  test.skip(!testInfo.project.name.includes('mobile'),'phone-only layout');
  await page.setViewportSize({width:320,height:680});
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  const build=page.getByRole('button',{name:'地図の建設メニューを開く'});
  const government=page.getByRole('button',{name:'都市運営メニューを開く'});
  const next=page.getByRole('button',{name:'地図で翌月へ進める'});
  for(const control of [build,government,next])await expect(control).toBeVisible();
  await build.click();
  const body=page.locator('.map-quick-body');
  await expect(body).toBeVisible();
  const r=await body.boundingBox();
  expect(r).not.toBeNull();
  expect(r!.x).toBeGreaterThanOrEqual(0);
  expect(r!.x+r!.width).toBeLessThanOrEqual(321);
  await page.getByRole('button',{name:'地図の建設メニューを閉じる'}).click();
  await government.click();
  const governance=page.locator('.map-operations-body');
  await expect(governance).toBeVisible();
  const g=await governance.boundingBox();
  expect(g!.x).toBeGreaterThanOrEqual(0);
  expect(g!.x+g!.width).toBeLessThanOrEqual(321);
  await page.getByRole('button',{name:'都市運営メニューを閉じる'}).click();
  await next.click();
  await expect(page.locator('.map-host canvas')).toBeVisible();
});
