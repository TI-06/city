import {describe,expect,it} from 'vitest';
import {createCity,advanceMonths} from '../src/core/city';
import {buildAmbientScene} from '../src/game/ambient';

describe('bounded visual-only city activity',()=>{
  it('derives stable lightweight motion assets from seeded infrastructure',()=>{
    const city=createCity('にぎわい検証',179);
    const a=buildAmbientScene(city);
    const b=buildAmbientScene(city);
    expect(a).toEqual(b);
    expect(a.lanes.length).toBeGreaterThan(0);
    expect(a.lanes.length).toBeLessThanOrEqual(32);
    expect(a.factories.length).toBeLessThanOrEqual(7);
    expect(a.parks.length).toBeLessThanOrEqual(8);
    expect(a.water.length).toBeLessThanOrEqual(12);
    expect(a.lanes.every(l=>city.roads[l.y*64+l.x]!>0 && city.roads[l.toY*64+l.toX]!>0)).toBe(true);
  });
  it('shows transit vehicles after public investment without altering simulation outcomes',()=>{
    const city=createCity('交通演出',138);
    const normal=buildAmbientScene(city);
    const invested={...city,capitalProjects:{transit:3,housing:0,culture:0}};
    const enhanced=buildAmbientScene(invested);
    expect(enhanced.lanes.length).toBe(normal.lanes.length);
    expect(enhanced.lanes.filter(l=>l.bus).length).toBeGreaterThanOrEqual(normal.lanes.filter(l=>l.bus).length);
    expect(buildAmbientScene(city)).toEqual(normal);
    const saved=JSON.stringify(invested);
    buildAmbientScene(invested);
    expect(JSON.stringify(invested)).toBe(saved);
  });
  it('never persists animation positions or unbounded frame history',()=>{
    const city=advanceMonths(createCity('長期演出',891),120);
    const before=JSON.stringify(city);
    for(let i=0;i<40;i++){
      const derived=buildAmbientScene(city);
      expect(derived.lanes.length).toBeLessThanOrEqual(32);
    }
    expect(JSON.stringify(city)).toBe(before);
    expect(before).not.toContain('ambientScene');
    expect(before).not.toContain('animationTime');
  });
});
