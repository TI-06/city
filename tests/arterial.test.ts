import { describe, expect, it } from 'vitest';
import { advanceMonths, applyStroke, applyTool, canPlaceAt, createCity, describeTile, getStats, tileIndex, validateCity, type City, SIZE } from '../src/core/city';
import { analyzeTraffic, getRoadCapacity, ROAD_CAPACITY, ARTERIAL_CAPACITY, buildingRoadAccess } from '../src/core/traffic';

function stressedCity(): City {
  const city=createCity('幹線検証市', 789);
  city.roads=Array(SIZE*SIZE).fill(0);
  city.zones=Array(SIZE*SIZE).fill(0);
  city.buildings=[
    {id:1,x:10,y:9,kind:1,level:1,residents:600,jobs:0},
    {id:2,x:20,y:9,kind:3,level:1,residents:0,jobs:320}
  ];
  city.services=[];
  for(let x=10;x<=20;x++) city.roads[tileIndex(x,10)]=1;
  return city;
}

describe('arterial road upgrades',()=>{
  it('charges the exact upgrade cost once without mutating the prior city',()=>{
    const old=stressedCity(), road=tileIndex(10,10);
    expect(canPlaceAt(old,'arterial',10,10)).toBe(true);
    const result=applyTool(old,'arterial',10,10);
    expect(result.changed).toBe(true);
    expect(result.city.funds).toBe(old.funds-420);
    expect(result.city.roads[road]).toBe(2);
    expect(old.roads[road]).toBe(1);
    expect(canPlaceAt(result.city,'arterial',10,10)).toBe(false);
    expect(applyTool(result.city,'arterial',10,10).changed).toBe(false);
    expect(canPlaceAt(old,'arterial',0,0)).toBe(false);
  });
  it('supports multi-tile conversion with partial skip and budget limits',()=>{
    const city=stressedCity();
    const patch=applyStroke(city,'arterial',[{x:10,y:10},{x:11,y:10},{x:30,y:30},{x:11,y:10}]);
    expect(patch.changed).toBe(true);
    expect(patch.city.funds).toBe(city.funds-840);
    expect(patch.city.roads[tileIndex(10,10)]).toBe(2);
    expect(patch.city.roads[tileIndex(11,10)]).toBe(2);
    expect(city.roads[tileIndex(11,10)]).toBe(1);
    const broke={...city,funds:500};
    const partial=applyStroke(broke,'arterial',[{x:10,y:10},{x:11,y:10}]);
    expect(partial.changed).toBe(true);
    expect(partial.city.funds).toBe(80);
    expect(partial.city.roads[tileIndex(11,10)]).toBe(1);
  });
  it('preserves road graph reachability and restores normal road when demolished and rebuilt',()=>{
    const city=stressedCity();
    const changed=applyTool(city,'arterial',10,10).city;
    expect(analyzeTraffic(changed).roadComponents).toBe(1);
    expect(analyzeTraffic(changed).employed).toBe(analyzeTraffic(city).employed);
    expect(buildingRoadAccess(changed.roads,10,9)).toBe(tileIndex(10,10));
    const removed=applyTool(changed,'bulldoze',10,10).city;
    expect(removed.roads[tileIndex(10,10)]).toBe(0);
    const rebuilt=applyTool(removed,'road',10,10).city;
    expect(rebuilt.roads[tileIndex(10,10)]).toBe(1);
  });
  it('improves congestion at a recurring maintenance cost and changes road description',()=>{
    const city=stressedCity();
    const roadCells=Array.from({length:11},(_,i)=>({x:i+10,y:10}));
    const upgraded=applyStroke(city,'arterial',roadCells).city;
    expect(getRoadCapacity(1)).toBe(ROAD_CAPACITY);
    expect(getRoadCapacity(2)).toBe(ARTERIAL_CAPACITY);
    expect(analyzeTraffic(city).congestion).toBeGreaterThan(analyzeTraffic(upgraded).congestion);
    expect(getStats(upgraded).expenses).toBeGreaterThan(getStats(city).expenses);
    expect(getStats(upgraded).arterialRoads).toBe(11);
    expect(getStats(upgraded).roads).toBe(getStats(city).roads);
    expect(describeTile(upgraded,10,10)).toContain('容量 220');
  });
  it('loads legacy road grids and reproduces traffic after saving new road types',()=>{
    const base=stressedCity();
    expect(validateCity(JSON.parse(JSON.stringify(base)))).toEqual(base);
    const after=applyTool(base,'arterial',10,10).city;
    expect(validateCity(JSON.parse(JSON.stringify(after)))).toEqual(after);
    const invalid=structuredClone(after);
    invalid.roads[tileIndex(10,10)]=9;
    expect(()=>validateCity(invalid)).toThrow();
    const direct=advanceMonths(after,30);
    const resumed=advanceMonths(validateCity(JSON.parse(JSON.stringify(advanceMonths(after,10)))),20);
    expect(resumed).toEqual(direct);
  });
});
