import {describe,expect,it} from 'vitest';
import {applyTool,advanceMonths,createCity,getDevelopmentOutlook,getStats} from '../src/core/city';

describe('visible city development feedback',()=>{
  it('counts waiting residential lots and eligible land without modifying saved state',()=>{
    const city=createCity('開発状況テスト',123);
    const snapshot=JSON.stringify(city);
    const before=getDevelopmentOutlook(city,getStats(city));
    const placed=applyTool(city,'home',20,45);
    expect(placed.ok).toBe(true);
    const after=getDevelopmentOutlook(placed.city,getStats(placed.city));
    expect(after.pending.home).toBe(before.pending.home+1);
    expect(after.ready.home).toBeGreaterThanOrEqual(before.ready.home);
    expect(JSON.stringify(city)).toBe(snapshot);
    expect(placed.city.schema).toBe(1);
  });

  it('shows why vacant housing does not automatically fill with more empty buildings',()=>{
    const city=createCity('空室制限',222);
    const empty={...city,buildings:city.buildings.map(b=>b.kind===1?{...b,residents:0}:b)};
    const status=getDevelopmentOutlook(empty,getStats(empty));
    expect(status.pending.home).toBeGreaterThan(0);
    expect(status.ready.home).toBe(0);
    const advanced=advanceMonths(empty,1);
    expect(advanced.buildings.filter(b=>b.kind===1)).toHaveLength(empty.buildings.filter(b=>b.kind===1).length);
  });

  it('shows that stopping growth for low happiness also blocks construction',()=>{
    const city=createCity('停滞',444);
    const stats={...getStats(city),happiness:39};
    const outlook=getDevelopmentOutlook(city,stats);
    expect(outlook.pausedByHappiness).toBe(true);
    expect(outlook.ready.home+outlook.ready.shop+outlook.ready.industry).toBe(0);
  });

  it('can advance a single month while retaining the paused state and old save schema',()=>{
    const city=createCity('1か月進める',782);
    expect(city.paused).toBe(true);
    const after=advanceMonths(city,1);
    expect(after.month).toBe(city.month+1);
    expect(after.paused).toBe(true);
    expect(after.schema).toBe(1);
    expect(city.month).toBe(0);
  });
});
