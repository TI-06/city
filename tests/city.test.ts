import {describe,expect,it} from 'vitest';
import { createCity, getStats, applyTool, advanceMonths, changeTax,validateCity,tileIndex } from '../src/core/city';
describe('city simulation',()=>{
  it('creates deterministic starter cities',()=>{const a=createCity('A',123),b=createCity('A',123);expect(a).toEqual(b);expect(getStats(a).population).toBeGreaterThan(0);});
  it('has exactly 64×64 independent grids',()=>{const a=createCity();expect(a.land).toHaveLength(4096);expect(a.roads).toHaveLength(4096);});
  it('rejects water or occupied placement atomically',()=>{const a=createCity();const w=applyTool(a,'road',8,51);expect(w.ok).toBe(false);expect(w.city).toBe(a);const r=applyTool(a,'road',20,23);expect(r.ok).toBe(false);expect(r.city).toBe(a);});
  it('updates treasury only once for a successful road',()=>{const a=createCity();const b=applyTool(a,'road',15,20);expect(b.ok).toBe(true);expect(b.city.funds).toBe(a.funds-65);expect(a.roads[tileIndex(15,20)]).toBe(0);});
  it('allows zoning next to roads but not disconnected',()=>{const a=createCity();const b=applyTool(a,'home',20,45);expect(b.ok).toBe(true);const c=applyTool(a,'home',0,0);expect(c.ok).toBe(false);});
  it('keeps same-seed same-actions identical after 10 years',()=>{const a=advanceMonths(createCity('A',42),120),b=advanceMonths(createCity('A',42),120);expect(a).toEqual(b);expect(a.history.length).toBeLessThanOrEqual(120);});
  it('changes tax yield and remains bounded',()=>{const a=createCity();const b=changeTax(a,18);expect(getStats(b).income).toBeGreaterThan(getStats(a).income);expect(changeTax(a,99)).toBe(a);});
  it('validates round-tripped saves and rejects corrupted maps',()=>{const a=createCity();expect(validateCity(JSON.parse(JSON.stringify(a)))).toEqual(a);const b=structuredClone(a);b.land=[];expect(()=>validateCity(b)).toThrow();});
  it('repeats resumed simulations exactly',()=>{const a=createCity('A',555);const continuous=advanceMonths(a,60);const resumed=advanceMonths(validateCity(JSON.parse(JSON.stringify(advanceMonths(a,20)))),40);expect(continuous).toEqual(resumed);});
});