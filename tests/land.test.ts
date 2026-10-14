import { describe, expect, it } from 'vitest';
import { advanceMonths, createCity, validateCity, SIZE, tileIndex, type City } from '../src/core/city';
import { analyzeLand, developmentWeight } from '../src/core/land';

function emptyTown():City{
  const city=createCity('土地評価実験',201);
  city.land.fill(1);
  city.roads.fill(0);
  city.zones.fill(0);
  city.buildings=[];
  city.services=[];
  return city;
}
describe('derived neighborhood attractiveness',()=>{
  it('produces a bounded value for each tile and no saved land cache',()=>{
    const city=emptyTown();
    const result=analyzeLand(city);
    expect(result.values).toHaveLength(SIZE*SIZE);
    expect(Array.from(result.values).every(n=>n>=0&&n<=100)).toBe(true);
    expect(result.averageResidential).toBe(0);
    expect(JSON.stringify(city)).not.toContain('landValues');
  });
  it('rewards parks, schools and medical services near housing',()=>{
    const city=emptyTown();
    const before=analyzeLand(city).values[tileIndex(10,11)]!;
    city.services=[{id:500,x:10,y:10,kind:'park'},{id:501,x:10,y:12,kind:'school'},{id:502,x:12,y:10,kind:'clinic'}];
    const after=analyzeLand(city).values[tileIndex(10,11)]!;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(analyzeLand(city).values[tileIndex(50,50)]!);
  });
  it('penalizes nearby industry and lets road access improve surrounding land',()=>{
    const city=emptyTown();
    const near=tileIndex(30,31),far=tileIndex(10,10);
    city.buildings=[{id:100,x:30,y:30,kind:3,level:3,residents:0,jobs:140}];
    const before=analyzeLand(city);
    expect(before.values[near]).toBeLessThan(before.values[far]);
    city.roads[tileIndex(30,32)]=1;
    const normal=analyzeLand(city).values[near]!;
    expect(normal).toBeGreaterThan(before.values[near]!);
    city.roads[tileIndex(30,32)]=2;
    expect(analyzeLand(city).values[near]!).toBeLessThanOrEqual(normal);
  });
  it('gives housing, offices and industry distinct desirability priorities',()=>{
    expect(developmentWeight(1,80)).toBeGreaterThan(developmentWeight(1,20));
    expect(developmentWeight(3,20)).toBeGreaterThan(developmentWeight(3,80));
    expect(developmentWeight(2,60)).toBeGreaterThan(developmentWeight(2,10));
    expect(developmentWeight(1,0)).toBeGreaterThan(0);
  });
  it('preserves deterministic growth, save compatibility and bounded data after 10 years',()=>{
    const initial=createCity('長期都市',997);
    const direct=advanceMonths(initial,120);
    const resumed=advanceMonths(validateCity(JSON.parse(JSON.stringify(advanceMonths(initial,50)))),70);
    expect(resumed).toEqual(direct);
    expect(Object.keys(direct).sort()).toEqual(Object.keys(initial).sort());
    expect(JSON.stringify(direct)).not.toContain('desirableTiles');
    expect(direct.history.length).toBeLessThanOrEqual(120);
    expect(analyzeLand(direct).average).toBeGreaterThanOrEqual(0);
  });
});
