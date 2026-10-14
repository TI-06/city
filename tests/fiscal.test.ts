import {describe,expect,it} from 'vitest';
import {advanceMonths,changeFiscalMode,createCity,getStats,issueMunicipalBond,validateCity} from '../src/core/city';
import {BOND_AMOUNT,debtBudget} from '../src/core/fiscal';

describe('Phase 4 municipal debt and fiscal recovery',()=>{
  it('borrows only up to the income-linked credit limit without changing the old city',()=>{
    const start=createCity('市債検証',101);
    const bond=issueMunicipalBond(start);
    expect(bond.changed).toBe(true);
    expect(start.funds).toBe(38000);
    expect(bond.city.funds).toBe(start.funds+BOND_AMOUNT);
    expect(bond.city.debt).toBe(BOND_AMOUNT);
    expect(bond.city.debtPrincipalMonthly).toBe(417);
    expect(debtBudget(bond.city,0).canBorrow).toBe(false);
    const next=issueMunicipalBond({...bond.city,debt:BOND_AMOUNT,debtPrincipalMonthly:417});
    // May have credit headroom based on the actual current city revenue, but no unbounded loans.
    let current=next.changed?next.city:bond.city;
    for(let i=0;i<100;i++){
      const result=issueMunicipalBond(current);
      if(!result.changed)break;
      current=result.city;
    }
    const stats=getStats(current);
    expect(stats.outstandingDebt).toBeLessThanOrEqual(stats.debtLimit);
    expect(issueMunicipalBond(current).changed).toBe(false);
  });
  it('repays principal once, accounts for interest, and keeps income free of loan proceeds',()=>{
    const initial=createCity('返済検証',303);
    const bonded=issueMunicipalBond(initial).city;
    const stats=getStats(bonded);
    expect(stats.debtPrincipal).toBe(417);
    expect(stats.debtInterest).toBe(75);
    expect(stats.operatingBalance-stats.balance).toBe(stats.debtPrincipal);
    expect(stats.income).toBe(getStats(initial).income);
    const next=advanceMonths(bonded,1);
    expect(next.debt).toBe(BOND_AMOUNT-417);
    expect(next.funds).toBe(bonded.funds+stats.balance);
    const settled=advanceMonths(bonded,65);
    expect(settled.debt).toBe(0);
    expect(settled.debtPrincipalMonthly).toBe(0);
    expect(getStats(settled).debtService).toBe(0);
  },30_000);
  it('makes austerity reduce spending at a happiness cost and allows reversal',()=>{
    const city=createCity('再建都市',23);
    const austerity=changeFiscalMode(city,'austerity');
    expect(getStats(austerity).expenses).toBeLessThan(getStats(city).expenses);
    expect(getStats(austerity).happiness).toBeLessThan(getStats(city).happiness);
    expect(getStats(austerity).publicSavings).toBeGreaterThan(0);
    expect(changeFiscalMode(austerity,'normal').fiscalMode).toBe('normal');
    expect(changeFiscalMode(city,'normal')).toBe(city);
  });
  it('loads legacy schema-1 cities and rejects invalid/unsafe debt values',()=>{
    const city=createCity('旧形式の市',27);
    const old=JSON.parse(JSON.stringify(city)) as Record<string,unknown>;
    delete old.fiscalMode;delete old.debt;delete old.debtPrincipalMonthly;
    const restored=validateCity(old);
    expect(getStats(restored).outstandingDebt).toBe(0);
    expect(getStats(restored).fiscalMode).toBe('normal');
    expect(()=>validateCity({...city,debt:-1})).toThrow();
    expect(()=>validateCity({...city,debt:10000,debtPrincipalMonthly:0})).toThrow();
    expect(()=>validateCity({...city,debt:10000,debtPrincipalMonthly:417,fiscalMode:'bad'})).toThrow();
  });
  it('replays 30 years of debt service and public spending from a saved midpoint',()=>{
    const start=changeFiscalMode(issueMunicipalBond(createCity('財政持続性',909)).city,'austerity');
    const direct=advanceMonths(start,360);
    const checkpoint=validateCity(JSON.parse(JSON.stringify(advanceMonths(start,150))));
    const resumed=advanceMonths(checkpoint,210);
    expect(resumed).toEqual(direct);
    expect(direct.history).toHaveLength(120);
    expect(JSON.stringify(direct)).not.toContain('debtHistory');
    expect(direct.debt).toBe(0);
  },60_000);
  it('exposes negative cash flow without creating magical bailout money',()=>{
    const city=createCity('危機市',555);
    city.buildings=city.buildings.filter(b=>b.kind!==1);
    city.zones=city.zones.map(z=>z===1?0:z);
    const startFunds=city.funds;
    const next=advanceMonths(city,24);
    expect(next.funds).toBeLessThan(startFunds);
    expect(getStats(next).income).toBe(0);
  });
});
