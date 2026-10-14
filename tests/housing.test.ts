import { describe, expect, it } from 'vitest';
import { advanceMonths, createCity, getStats, tileIndex, validateCity, type City, SIZE } from '../src/core/city';
import { analyzeLand } from '../src/core/land';
import { applyHousingMigration, assessHousing, housingCapacity } from '../src/core/housing';

function housingTown(residents=0,jobs=100):City {
  const city=createCity('住宅需要テスト', 404);
  city.land.fill(1);
  city.roads=Array(SIZE*SIZE).fill(0);
  city.zones=Array(SIZE*SIZE).fill(0);
  city.services=[];
  city.buildings=[
    {id:1,x:10,y:9,kind:1,level:1,residents,jobs:0},
    {id:2,x:20,y:9,kind:3,level:1,residents:0,jobs},
  ];
  city.nextId=3;
  for(let x=10;x<=20;x++)city.roads[tileIndex(x,10)]=1;
  return city;
}

describe('Phase 2 housing market and migration',()=>{
  it('keeps 12/18/24 capacity while treating residents as actual occupancy',()=>{
    expect([1,2,3].map(housingCapacity)).toEqual([12,18,24]);
    const city=housingTown(5);
    const stats=getStats(city);
    expect(stats.population).toBe(5);
    expect(stats.housingCapacity).toBe(12);
    expect(stats.housingVacancies).toBe(7);
  });
  it('fills previously empty housing if local jobs and affordable rent exist',()=>{
    const city=housingTown(0,100);
    const land=analyzeLand(city);
    const market=assessHousing(city,0,75,land);
    expect(market.monthlyMigrationEstimate).toBeGreaterThan(0);
    applyHousingMigration(city,market,land);
    expect(city.buildings[0]!.residents).toBeGreaterThan(0);
    expect(city.buildings[0]!.residents).toBeLessThanOrEqual(12);
    expect(getStats(city).population).toBe(city.buildings[0]!.residents);
  });
  it('creates out-migration under unemployment and poor affordability',()=>{
    const city=housingTown(12,0);
    const market=assessHousing(city,0,40,analyzeLand(city));
    expect(market.monthlyMigrationEstimate).toBeLessThan(0);
    applyHousingMigration(city,market,analyzeLand(city));
    expect(city.buildings[0]!.residents).toBeLessThan(12);
    expect(city.buildings[0]!.residents).toBeGreaterThanOrEqual(0);
  });
  it('improves rental affordability when supply expands, holding jobs and tenants fixed',()=>{
    const tight=housingTown(12,120);
    const supply=structuredClone(tight);
    supply.buildings.push({id:3,x:11,y:9,kind:1,level:1,residents:0,jobs:0});
    const before=assessHousing(tight,6,70,analyzeLand(tight));
    const after=assessHousing(supply,6,70,analyzeLand(supply));
    expect(after.capacity).toBeGreaterThan(before.capacity);
    expect(after.estimatedRent).toBeLessThanOrEqual(before.estimatedRent);
    expect(after.affordability).toBeGreaterThanOrEqual(before.affordability);
  });
  it('does not silently add household agents or new schema properties in 10 years',()=>{
    const start=createCity('旧セーブ互換',22);
    const before=JSON.stringify(start);
    const continued=advanceMonths(validateCity(JSON.parse(before)),120);
    const resumed=advanceMonths(validateCity(JSON.parse(JSON.stringify(advanceMonths(start,50)))),70);
    expect(resumed).toEqual(continued);
    expect(continued.schema).toBe(1);
    expect(Object.keys(continued).sort()).toEqual(Object.keys(start).sort());
    expect(continued.history.length).toBeLessThanOrEqual(120);
    expect(continued.buildings.every(b=>b.kind!==1||(b.residents>=0&&b.residents<=housingCapacity(b.level)))).toBe(true);
    expect(JSON.stringify(continued)).not.toContain('rentHistory');
  });
  it('stays deterministic after 30 years and never creates residents in zero residential capacity',()=>{
    const a=housingTown(0,100);
    a.buildings=a.buildings.filter(b=>b.kind!==1);
    const future=advanceMonths(a,120);
    expect(getStats(future).population).toBe(0);
    const baseline=createCity('長期人口都市',44);
    const direct=advanceMonths(baseline,360);
    const resumed=advanceMonths(validateCity(JSON.parse(JSON.stringify(advanceMonths(baseline,130)))),230);
    expect(resumed).toEqual(direct);
  },30_000);
});
