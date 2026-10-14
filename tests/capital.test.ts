import {describe,expect,it} from 'vitest';
import {createCity,getStats,advanceMonths,validateCity,fundCapitalProject,type City,tileIndex,SIZE} from '../src/core/city';
import {capitalLevel,capitalNextCost,capitalOperatingCost} from '../src/core/capital';
import {analyzeTraffic} from '../src/core/traffic';

function commuterTown():City {
  const city=createCity('投資効果検証',834);
  city.roads=Array(SIZE*SIZE).fill(0);
  city.zones=Array(SIZE*SIZE).fill(0);
  city.services=[];
  city.buildings=[
    {id:1,x:10,y:9,kind:1,level:1,residents:600,jobs:0},
    {id:2,x:20,y:9,kind:3,level:1,residents:0,jobs:350}
  ];
  for(let x=10;x<=20;x++)city.roads[tileIndex(x,10)]=1;
  city.funds=800_000;
  return city;
}

describe('Phase 3 capital investment programs',()=>{
  it('deducts a one-time cost, increases level once and never mutates the input',()=>{
    const original=createCity('初期投資',49);
    expect(capitalNextCost(original,'housing')).toBe(25_000);
    const result=fundCapitalProject(original,'housing');
    expect(result.changed).toBe(true);
    expect(result.city.funds).toBe(original.funds-25_000);
    expect(capitalLevel(result.city,'housing')).toBe(1);
    expect(capitalLevel(original,'housing')).toBe(0);
    expect(getStats(result.city).capitalOperating).toBeGreaterThan(getStats(original).capitalOperating);
  });

  it('rejects unaffordable projects and prevents investment above level 3',()=>{
    const city=createCity('投資上限',77);
    const blocked=fundCapitalProject(city,'culture');
    expect(blocked.changed).toBe(false);
    expect(blocked.city).toBe(city);
    const rich={...city,funds:3_000_000};
    let current=rich;
    for(let i=0;i<3;i++){
      const result=fundCapitalProject(current,'culture');
      expect(result.changed).toBe(true);
      current=result.city;
    }
    expect(capitalLevel(current,'culture')).toBe(3);
    expect(capitalNextCost(current,'culture')).toBeUndefined();
    const max=fundCapitalProject(current,'culture');
    expect(max.changed).toBe(false);
    expect(max.city).toBe(current);
  });

  it('reduces actual road load after transit spending without removing employment',()=>{
    const base=commuterTown();
    const built=fundCapitalProject(base,'transit');
    expect(built.changed).toBe(true);
    const after=built.city;
    expect(analyzeTraffic(after).worstRoadLoad).toBeLessThan(analyzeTraffic(base).worstRoadLoad);
    expect(analyzeTraffic(after).employed).toBe(analyzeTraffic(base).employed);
    expect(getStats(after).capitalOperating).toBeGreaterThan(getStats(base).capitalOperating);
  });

  it('reduces tenants net rent but retains gross market rent after housing subsidy',()=>{
    const base=createCity('住宅補助',129);
    const built=fundCapitalProject(base,'housing');
    const before=getStats(base),after=getStats(built.city);
    expect(after.estimatedRent).toBe(before.estimatedRent);
    expect(after.netRent).toBeLessThan(before.estimatedRent);
    expect(after.rentBurden).toBeLessThanOrEqual(before.rentBurden);
    expect(after.capitalOperating).toBeGreaterThan(before.capitalOperating);
  });

  it('adds cultural benefits to happiness with an ongoing municipal expense',()=>{
    const city=createCity('文化推進市',144);
    city.funds=200_000;
    city.services=[];
    city.policy='growth';
    const old=getStats(city);
    const invested=fundCapitalProject(city,'culture').city;
    const fresh=getStats(invested);
    expect(fresh.happiness).toBeGreaterThan(old.happiness);
    expect(fresh.expenses).toBeGreaterThan(old.expenses);
    expect(capitalOperatingCost(invested,fresh.population)).toBe(fresh.capitalOperating);
  });

  it('retains old schema-1 saves, rejects malformed records and resumes deterministically',()=>{
    const original=createCity('旧バージョン',567);
    const legacy=JSON.parse(JSON.stringify(original)) as Record<string,unknown>;
    delete legacy.capitalProjects;
    const restored=validateCity(legacy);
    expect(capitalLevel(restored,'transit')).toBe(0);
    expect(capitalLevel(restored,'housing')).toBe(0);
    const funded=fundCapitalProject({...original,funds:1_000_000},'transit').city;
    const resumed=advanceMonths(validateCity(JSON.parse(JSON.stringify(advanceMonths(funded,35)))),45);
    const continuous=advanceMonths(funded,80);
    expect(resumed).toEqual(continuous);
    expect(continuous.schema).toBe(1);
    expect(JSON.stringify(continuous)).not.toContain('capitalHistory');
    expect(()=>validateCity({...funded,capitalProjects:{transit:4,housing:0,culture:0}})).toThrow();
    expect(()=>validateCity({...funded,capitalProjects:{transit:1}})).toThrow();
  },30_000);
});
