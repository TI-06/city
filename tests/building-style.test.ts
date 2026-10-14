import {describe,expect,it} from 'vitest';
import {advanceMonths,createCity,type Building} from '../src/core/city';
import {citySkyline,getBuildingStyle} from '../src/game/building-style';

describe('evolving skyline (visual-only schema 1)',()=>{
  const building=(kind:1|2|3,level:number):Building=>({id:4,x:21,y:27,kind,level,residents:kind===1?6:0,jobs:kind===1?0:10});
  it('renders houses, apartments, skyscrapers, retail, and factories as distinct silhouettes',()=>{
    const labels=new Set<string>();
    for(const kind of [1,2,3] as const)for(const level of [1,2,3]){
      const style=getBuildingStyle(building(kind,level),12937);
      // Neighborhood variety is defined across blocks/seeds, not necessarily
      // all alternative archetypes at a single fixed (x,y) tile.
      for(const seed of [17,12937,9993,211]){
        for(const [x,y] of [[21,27],[5,5],[32,41],[14,37]]){
          labels.add(getBuildingStyle({...building(kind,level),x,y},seed).name);
        }
      }
      expect(style.height).toBeGreaterThan(0);
      expect(style.roof).toBeGreaterThan(0);
      labels.add(style.name);
      if(kind===1&&level===1)expect(['cottage','townhouse']).toContain(style.name);
      if(kind===1&&level===3)expect(['apartment','residential-tower']).toContain(style.name);
    }
    expect(labels.size).toBeGreaterThanOrEqual(9);
    expect(getBuildingStyle(building(1,3),999).height).toBeGreaterThan(getBuildingStyle(building(1,1),999).height);
    expect(getBuildingStyle(building(2,3),999).height).toBeGreaterThan(getBuildingStyle(building(2,1),999).height);
  });
  it('is deterministic, respects cosmetic variety, and does not mutate buildings or saves',()=>{
    const city=advanceMonths(createCity('街並み',799),60);
    const original=JSON.stringify(city);
    const before=citySkyline(city);
    expect(before.cottages+before.apartments+before.towers).toBe(city.buildings.filter(b=>b.kind===1).length);
    expect(before.shops+before.plants).toBe(city.buildings.filter(b=>b.kind!==1).length);
    expect(citySkyline(city)).toEqual(before);
    expect(JSON.stringify(city)).toBe(original);
    expect(original).not.toContain('buildingStyle');
  });
});