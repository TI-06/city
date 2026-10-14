import {describe,expect,it} from 'vitest';
import {visibleTileWindow,paddedTileWindow,needsTileWindowRefresh,structureDetailAtZoom,tileNearViewport,tileCount} from '../src/game/viewport';

describe('isometric viewport structure culling',()=>{
  it('includes every tile center projected inside the visible screen for multiple camera positions',()=>{
    const cases=[
      {w:900,h:500,z:.85,x:450,y:-200},
      {w:386,h:390,z:.386,x:193,y:-121},
      {w:900,h:500,z:1.9,x:750,y:-850},
    ];
    for(const cam of cases){
      const window=visibleTileWindow(cam.w,cam.h,cam.x,cam.y,cam.z);
      expect(window).not.toBeNull();
      for(let y=0;y<64;y++)for(let x=0;x<64;x++){
        const px=(x-y)*26*cam.z+cam.x;
        const py=(x+y)*13*cam.z+cam.y;
        if(px<0||px>cam.w||py<0||py>cam.h)continue;
        expect(window!.minX).toBeLessThanOrEqual(x);
        expect(window!.maxX).toBeGreaterThanOrEqual(x);
        expect(window!.minY).toBeLessThanOrEqual(y);
        expect(window!.maxY).toBeGreaterThanOrEqual(y);
        expect(tileNearViewport(x,y,cam.w,cam.h,cam.x,cam.y,cam.z)).toBe(true);
      }
    }
  });
  it('pads clamped tile bounds and avoids geometry regeneration for small drags',()=>{
    const bounds=visibleTileWindow(500,280,420,-340,.95);
    expect(bounds).not.toBeNull();
    const cache=paddedTileWindow(bounds,8);
    expect(cache).not.toBeNull();
    expect(needsTileWindowRefresh(cache,bounds)).toBe(false);
    const moved=visibleTileWindow(500,280,435,-325,.95);
    expect(needsTileWindowRefresh(cache,moved)).toBe(false);
    const far=visibleTileWindow(500,280,900,900,.95);
    expect(needsTileWindowRefresh(cache,far)).toBe(true);
    expect(tileCount(cache)).toBeGreaterThan(tileCount(bounds));
  });
  it('avoids endless invalidations when the camera sits at the edge of the world',()=>{
    const edge=visibleTileWindow(950,500,475,-80,.52);
    expect(edge).not.toBeNull();
    const window=paddedTileWindow(edge,8);
    expect(window).not.toBeNull();
    expect(needsTileWindowRefresh(window,edge)).toBe(false);
    expect(visibleTileWindow(500,300,40_000,40_000,1)).toBeNull();
    expect(visibleTileWindow(0,300,0,0,1)).toBeNull();
  });
  it('low zoom reduces small geometry while close zoom restores details',()=>{
    expect(structureDetailAtZoom(.3)).toBe('overview');
    expect(structureDetailAtZoom(.71)).toBe('overview');
    expect(structureDetailAtZoom(.72)).toBe('detail');
    expect(structureDetailAtZoom(2.4)).toBe('detail');
  });
  it('rejects projected tiles far outside the viewport even within an axis-aligned tile window',()=>{
    expect(tileNearViewport(30,30,386,390,193,-121,.386)).toBe(true);
    expect(tileNearViewport(0,0,386,390,193,-121,.386,5)).toBe(false);
    expect(tileNearViewport(60,5,386,390,193,-121,.386,5)).toBe(false);
    expect(tileCount(null)).toBe(0);
    expect(paddedTileWindow(null)).toBeNull();
  });
});
