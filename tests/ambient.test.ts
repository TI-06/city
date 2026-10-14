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

import {sampleVehicle,sampleWalker,nightLevel} from '../src/game/ambient';

describe('non-repeating activity phases',()=>{
  it('travels over multiple connected road tiles and takes different trips',()=>{
    const city=createCity('移動する交通',524);
    const lane=buildAmbientScene(city).lanes.find(l=>l.route.length>=4);
    expect(lane).toBeDefined();
    expect(lane!.route.length).toBeGreaterThan(2);
    for(const [a,b] of lane!.route.slice(1).map((v,i)=>[lane!.route[i]!,v] as const)){
      expect(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)).toBe(1);
    }
    const fixed={...lane!,density:1,phase:0};
    const first=sampleVehicle(fixed,1);
    const next=sampleVehicle(fixed,1+fixed.period*2);
    expect(first).not.toBeNull();
    expect(next).not.toBeNull();
    expect(first).not.toEqual(next);
    expect(sampleVehicle(fixed,fixed.travelSeconds+.2)).toBeNull();
  });
  it('has day and night with changing window illumination',()=>{
    expect(nightLevel(0)).toBe(0);
    expect(nightLevel(42)).toBeGreaterThan(.8);
    expect(nightLevel(70)).toBe(0);
    expect(nightLevel(42+72)).toBeCloseTo(nightLevel(42));
  });
  it('schedules walkers intermittently and remains save-neutral',()=>{
    const city=createCity('人通り',292);
    const before=JSON.stringify(city);
    const scene=buildAmbientScene(city);
    expect(scene.pedestrians.length).toBeGreaterThan(0);
    expect(scene.pedestrians.length).toBeLessThanOrEqual(24);
    expect(scene.windows.length).toBeLessThanOrEqual(32);
    const walker=scene.pedestrians[0]!;
    const some=Array.from({length:75},(_,t)=>sampleWalker(walker,t));
    expect(some.some(v=>v!==null)).toBe(true);
    expect(some.some(v=>v===null)).toBe(true);
    expect(JSON.stringify(city)).toBe(before);
  });
});
