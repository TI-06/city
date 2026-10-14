import { describe, expect, it } from 'vitest';
import { advanceMonths, createCity, getStats, validateCity, type City } from '../src/core/city';
import { housingCapacity } from '../src/core/housing';

function assertHealthySnapshot(city: City): void {
  const stats=getStats(city);
  expect(Number.isSafeInteger(city.funds)).toBe(true);
  expect(Number.isSafeInteger(stats.population)).toBe(true);
  expect(Number.isFinite(stats.balance)).toBe(true);
  expect(Number.isFinite(stats.estimatedRent)).toBe(true);
  expect(Number.isFinite(stats.rentBurden)).toBe(true);
  expect(stats.population).toBeGreaterThanOrEqual(0);
  expect(stats.housingVacancies).toBeGreaterThanOrEqual(0);
  expect(stats.housingCapacity).toBeGreaterThanOrEqual(0);
  expect(stats.happiness).toBeGreaterThanOrEqual(20);
  expect(stats.happiness).toBeLessThanOrEqual(98);
  expect(stats.affordability).toBeGreaterThanOrEqual(0);
  expect(stats.affordability).toBeLessThanOrEqual(100);
  expect(city.history.length).toBeLessThanOrEqual(120);
  expect(city.buildings.every(b=>b.residents>=0 && (b.kind!==1 || b.residents<=housingCapacity(b.level)))).toBe(true);
  expect(city.buildings.length).toBeLessThanOrEqual(city.land.length);
  validateCity(JSON.parse(JSON.stringify(city)));
}

function observe(label:string,city:City,elapsedMs:number):void {
  const stats=getStats(city);
  const bytes=new TextEncoder().encode(JSON.stringify(city)).byteLength;
  // Observability is intentional: this is reported by GitHub Actions logs.
  console.info(`[SOAK] ${label}: months=${city.month} population=${stats.population} funds=${city.funds} housingVacant=${stats.housingVacancies} buildings=${city.buildings.length} bytes=${bytes} elapsedMs=${Math.round(elapsedMs)}`);
  // Current 64x64 city model should remain substantially under 0.5MB.
  expect(bytes).toBeLessThan(500_000);
}

describe('100-year city simulation durability',()=>{
  it('continues deterministically for 100 years, both directly and across a save/reload',()=>{
    const original=createCity('世紀耐久検証',2084);
    const started=performance.now();
    const direct=advanceMonths(original,1200);
    observe('baseline_100y',direct,performance.now()-started);
    assertHealthySnapshot(direct);
    expect(direct.history).toHaveLength(120);
    expect(direct.month).toBe(1200);

    const halfway=advanceMonths(original,600);
    const serialized=JSON.stringify(halfway);
    const loaded=validateCity(JSON.parse(serialized));
    const continued=advanceMonths(loaded,600);
    expect(continued).toEqual(direct);
    expect(original.month).toBe(0);
    expect(Object.keys(direct).sort()).toEqual(Object.keys(original).sort());
    expect(JSON.stringify(direct)).not.toContain('roadVolume');
    expect(JSON.stringify(direct)).not.toContain('landValues');
    expect(JSON.stringify(direct)).not.toContain('rentHistory');
  },120_000);

  it('runs 100 years with a continuing public-transport operating subsidy',()=>{
    const city=createCity('交通政策検証',9183);
    city.policy='mobility';
    const started=performance.now();
    const result=advanceMonths(city,1200);
    observe('mobility_100y',result,performance.now()-started);
    assertHealthySnapshot(result);
    expect(result.policy).toBe('mobility');
    expect(result.month).toBe(1200);
  },120_000);

  it('models 30 years of employment collapse without negative occupants or broken saves',()=>{
    const city=createCity('産業縮小検証',9183);
    city.buildings=city.buildings.filter(b=>b.kind===1);
    city.zones=city.zones.map(z=>z===1?1:0);
    const initialPopulation=getStats(city).population;
    const started=performance.now();
    const result=advanceMonths(city,360);
    observe('no_jobs_30y',result,performance.now()-started);
    assertHealthySnapshot(result);
    expect(getStats(result).population).toBeLessThan(initialPopulation);
    expect(result.month).toBe(360);
  },120_000);
});
