import { describe, expect, it } from 'vitest';
import { advanceMonths, createCity, getStats, validateCity, type City, type Building, SIZE } from '../src/core/city';
import { analyzeTraffic, buildingRoadAccess, ROAD_CAPACITY } from '../src/core/traffic';

function testTown(roadCells: readonly [number, number][], residents = 100, jobs = 20): City {
  const city = createCity('交通実験都市', 42);
  city.roads.fill(0);
  city.zones.fill(0);
  city.services = [];
  const home: Building = { id: 1, x: 10, y: 9, kind: 1, level: 1, residents, jobs: 0 };
  const company: Building = { id: 2, x: 20, y: 9, kind: 3, level: 1, residents: 0, jobs };
  city.buildings = [home, company];
  for (const [x, y] of roadCells) city.roads[y * SIZE + x] = 1;
  return city;
}

describe('Phase 2 aggregate road connectivity and congestion', () => {
  it('treats a road-disconnected workplace as unreachable, regardless of citywide vacant jobs', () => {
    const disconnected = testTown([[10, 10], [20, 10]]);
    expect(analyzeTraffic(disconnected).roadVolume).toHaveLength(SIZE * SIZE);
    expect(analyzeTraffic(disconnected).roadComponents).toBe(2);
    expect(getStats(disconnected).employed).toBe(0);
    expect(getStats(disconnected).vacancies).toBe(20);
    const connected = testTown(Array.from({ length: 11 }, (_, i) => [10 + i, 10] as [number, number]));
    expect(analyzeTraffic(connected).roadComponents).toBe(1);
    expect(getStats(connected).employed).toBe(20);
    expect(getStats(connected).income).toBeGreaterThan(getStats(disconnected).income);
  });

  it('routes commuting pressure on actual connected road cells only', () => {
    const road = Array.from({ length: 11 }, (_, i) => [10 + i, 10] as [number, number]);
    const city = testTown(road);
    const result = analyzeTraffic(city);
    expect(result.roadVolume[15 + 10 * SIZE]).toBeGreaterThan(0);
    expect(result.roadVolume[4 + 4 * SIZE]).toBe(0);
    expect(result.averageCommute).toBeGreaterThanOrEqual(0);
    expect(buildingRoadAccess(city.roads, 10, 9)).toBe(10 + 10 * SIZE);
    expect(buildingRoadAccess(city.roads, 0, 0)).toBeUndefined();
  });

  it('penalizes heavy congestion without growing saved road history', () => {
    const road = Array.from({ length: 11 }, (_, i) => [10 + i, 10] as [number, number]);
    const low = testTown(road, 100, 20);
    const high = testTown(road, 2000, 1100);
    const a = analyzeTraffic(low), b = analyzeTraffic(high);
    expect(b.worstRoadLoad).toBeGreaterThan(ROAD_CAPACITY);
    expect(b.congestedRoads).toBeGreaterThan(0);
    expect(b.congestion).toBeGreaterThan(a.congestion);
    expect(b.productivity).toBeLessThan(a.productivity);
    expect(getStats(high).happiness).toBeLessThan(getStats(low).happiness);
    const encoded = JSON.stringify(high);
    expect(encoded).not.toContain('roadVolume');
    expect(encoded).not.toContain('roadComponents');
    expect(validateCity(JSON.parse(encoded))).toEqual(high);
  });

  it('reproduces road traffic and finances after a save-and-restore continuation', () => {
    const initial = createCity('再現性都市', 678);
    const continuous = advanceMonths(initial, 36);
    const restored = advanceMonths(validateCity(JSON.parse(JSON.stringify(advanceMonths(initial, 12)))), 24);
    expect(continuous).toEqual(restored);
    expect(analyzeTraffic(continuous).congestion).toBe(analyzeTraffic(restored).congestion);
    expect(Array.from(analyzeTraffic(continuous).roadVolume)).toEqual(Array.from(analyzeTraffic(restored).roadVolume));
  });

  it('does not add one traffic record per simulated month to the save schema', () => {
    const start = createCity('長期交通都市', 3);
    const future = advanceMonths(start, 120);
    expect(future.history).toHaveLength(120);
    expect(Object.keys(future).sort()).toEqual(Object.keys(start).sort());
    expect(JSON.stringify(future)).not.toContain('roadVolume');
    expect(JSON.stringify(future)).not.toContain('trafficHistory');
  });
});
