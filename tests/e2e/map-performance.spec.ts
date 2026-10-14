import {expect,test} from '@playwright/test';

/**
 * A CI observability probe, not a device-level benchmark.
 * Desktop/mobile projects use Chromium on GitHub Actions hardware.
 */
test('records first-map visibility and animated frame pacing without a regression lock-in', async ({page},testInfo)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const started=Date.now();
  await page.goto('/');
  await expect(page.locator('.map-host canvas')).toBeVisible({timeout:30_000});
  const readyMs=Date.now()-started;
  const stats=await page.evaluate(()=>new Promise<{samples:number;meanMs:number;p95Ms:number;maxMs:number;dpr:number;canvasWidth:number}>((resolve)=>{
    const measured:number[]=[];
    let previous=0;
    const tick=(timestamp:number)=>{
      if(previous>0)measured.push(timestamp-previous);
      previous=timestamp;
      if(measured.length<90){requestAnimationFrame(tick);return;}
      const sorted=[...measured].sort((a,b)=>a-b);
      const canvas=document.querySelector('.map-host canvas') as HTMLCanvasElement|null;
      resolve({
        samples:measured.length,
        meanMs:measured.reduce((a,b)=>a+b,0)/measured.length,
        p95Ms:sorted[Math.floor((sorted.length-1)*.95)]??0,
        maxMs:sorted[sorted.length-1]??0,
        dpr:devicePixelRatio,
        canvasWidth:canvas?.getBoundingClientRect().width??0,
      });
    };
    requestAnimationFrame(tick);
  }));
  const structure=await page.locator('.map-host canvas').evaluate(el=>({
    renderedTiles:Number((el as HTMLCanvasElement).dataset.structureTiles),
    detail:(el as HTMLCanvasElement).dataset.structureDetail??'unknown',
    rebuilds:Number((el as HTMLCanvasElement).dataset.structureBuilds),
  }));
  const data={project:testInfo.project.name,readyMs,...stats,...structure};
  console.log('[MAP-PERF] '+JSON.stringify(data));
  await testInfo.attach('map-performance.json',{body:JSON.stringify(data,null,2),contentType:'application/json'});
  expect(stats.samples).toBe(90);
  expect(stats.canvasWidth).toBeGreaterThan(0);
  expect(stats.meanMs).toBeGreaterThan(0);
  expect(Number.isFinite(stats.p95Ms)).toBe(true);
  expect(errors).toEqual([]);
});
