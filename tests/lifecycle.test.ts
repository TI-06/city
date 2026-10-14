import {describe,expect,it} from 'vitest';
import {advanceMonths,changeMaintenancePlan,createCity,getStats,validateCity} from '../src/core/city';
import {infrastructureBudget,MAINTENANCE_LABELS} from '../src/core/lifecycle';

describe('Phase 3 civic infrastructure lifecycle',()=>{
  it('charges the renewal reserve exactly once per month and preserves the original state',()=>{
    const original=createCity('更新費確認',345);
    const before=getStats(original);
    expect(before.renewalDue).toBeGreaterThan(0);
    expect(before.renewalSpending).toBe(before.renewalDue);
    const next=advanceMonths(original,1);
    expect(next.funds).toBe(original.funds+before.balance);
    expect(next.maintenanceBacklog).toBe(0);
    expect(original.month).toBe(0);
    expect(original.maintenanceBacklog).toBe(0);
  });

  it('links a smaller minimum budget to accumulated repairs and declining condition',()=>{
    const city=createCity('更新先送り',51);
    const minimum=changeMaintenancePlan(city,'minimum');
    const standard=advanceMonths(city,240);
    const deferred=advanceMonths(minimum,240);
    expect(getStats(deferred).maintenanceBacklog).toBeGreaterThan(0);
    expect(getStats(standard).maintenanceBacklog).toBe(0);
    expect(getStats(deferred).infrastructureCondition).toBeLessThan(getStats(standard).infrastructureCondition);
    expect(getStats(deferred).happiness).toBeLessThan(getStats(standard).happiness);
    expect(infrastructureBudget(minimum).renewalSpend).toBeLessThan(infrastructureBudget(city).renewalSpend);
  },30_000);

  it('can repair existing arrears with preventive spending rather than free instant reset',()=>{
    const city=createCity('修繕積立',66);
    const behind=advanceMonths(changeMaintenancePlan(city,'minimum'),120);
    const balance=behind.maintenanceBacklog!;
    expect(balance).toBeGreaterThan(0);
    const switched=changeMaintenancePlan(behind,'preventive');
    expect(switched.maintenanceBacklog).toBe(balance);
    expect(infrastructureBudget(switched).renewalSpend).toBeGreaterThan(infrastructureBudget(behind).renewalSpend);
    const repaired=advanceMonths(switched,60);
    expect(repaired.maintenanceBacklog).toBeLessThan(balance);
  },30_000);

  it('applies fiscal aging without writing one depreciation row per road or per year',()=>{
    const city=createCity('都市歳月',89);
    const young=getStats(city);
    const older=advanceMonths(city,1200);
    const mature=getStats(older);
    expect(mature.renewalDue).toBeGreaterThan(young.renewalDue);
    expect(mature.matureCityServices).toBeGreaterThan(0);
    expect(older.history).toHaveLength(120);
    expect(older.roads.length).toBe(city.roads.length);
    expect(JSON.stringify(older)).not.toContain('assetAges');
    expect(JSON.stringify(older).length).toBeLessThan(500_000);
  },120_000);

  it('accepts old schema-1 saves with missing plan and backlog and rejects malformed plans',()=>{
    const original=createCity('旧セーブ',9);
    const json=JSON.parse(JSON.stringify(original)) as Record<string,unknown>;
    delete json.maintenancePlan;
    delete json.maintenanceBacklog;
    const old=validateCity(json);
    expect(getStats(old).maintenancePlan).toBe('standard');
    expect(getStats(old).maintenanceBacklog).toBe(0);
    const resumed=advanceMonths(old,2);
    expect(resumed.maintenanceBacklog).toBe(0);
    expect(validateCity(JSON.parse(JSON.stringify(resumed)))).toEqual(resumed);
    expect(MAINTENANCE_LABELS.preventive).toContain('予防');
    expect(changeMaintenancePlan(original,'standard')).toBe(original);
    const malformed={...original,maintenanceBacklog:-1};
    expect(()=>validateCity(malformed)).toThrow();
    expect(()=>validateCity({...original,maintenancePlan:'unknown'})).toThrow();
  });

  it('continues identically across a JSON save/reload with unpaid maintenance',()=>{
    const original=changeMaintenancePlan(createCity('長期修繕',105),'minimum');
    const direct=advanceMonths(original,180);
    const resumed=advanceMonths(validateCity(JSON.parse(JSON.stringify(advanceMonths(original,70)))),110);
    expect(resumed).toEqual(direct);
    expect(direct.maintenanceBacklog).toBeGreaterThan(0);
  },30_000);
});
