import {describe,expect,it} from 'vitest';
import {advanceMonths,changePolicy,createCity,getStats,validateCity,type City,SIZE} from '../src/core/city';
import {analyzeTraffic} from '../src/core/traffic';

function congestedTown():City{
  const city=createCity('通勤検証市',789);
  city.roads=Array(SIZE*SIZE).fill(0);
  city.zones=Array(SIZE*SIZE).fill(0);
  city.services=[];
  city.buildings=[
    {id:1,x:10,y:9,kind:1,level:1,residents:220,jobs:0},
    {id:2,x:20,y:9,kind:3,level:1,residents:0,jobs:140}
  ];
  for(let x=10;x<=20;x++)city.roads[10*SIZE+x]=1;
  return city;
}

describe('mobility policy tradeoffs',()=>{
  it('reduces peak road trips while preserving employment',()=>{
    const base=congestedTown();
    const mobility=changePolicy(base,'mobility');
    expect(analyzeTraffic(base).congestion).toBeGreaterThan(10);
    expect(analyzeTraffic(mobility).congestion).toBeLessThan(analyzeTraffic(base).congestion);
    expect(getStats(mobility).employed).toBe(getStats(base).employed);
    expect(getStats(mobility).happiness).toBeGreaterThan(getStats(base).happiness);
  });
  it('charges a recurring service budget rather than giving a free congestion bonus',()=>{
    const base=congestedTown();
    const mobility=changePolicy(base,'mobility');
    expect(getStats(mobility).expenses).toBeGreaterThan(getStats(base).expenses);
    expect(getStats(mobility).balance).toBeLessThan(getStats(base).balance + 500);
  });
  it('loads existing v1 cities and persists the new policy without changing saved shape',()=>{
    const start=congestedTown();
    const oldCity=validateCity(JSON.parse(JSON.stringify(start)));
    const newCity=changePolicy(oldCity,'mobility');
    expect(validateCity(JSON.parse(JSON.stringify(newCity)))).toEqual(newCity);
    expect(newCity.schema).toBe(1);
    expect(changePolicy(newCity,'mobility')).toBe(newCity);
    expect(advanceMonths(newCity,18)).toEqual(advanceMonths(validateCity(JSON.parse(JSON.stringify(newCity))),18));
  });
});
