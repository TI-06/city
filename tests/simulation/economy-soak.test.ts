import { describe, expect, it } from 'vitest';
import { cityWorldSaveCodec } from '../../src/persistence/codec/city-world-codec';
import { measureJsonBytes } from '../../src/shared/serialization/measure-json-bytes';
import {
  createKernelSaveWithCodec,
  restoreKernelStateWithCodec,
} from '../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../src/simulation/core/simulation-engine';
import { SIMULATION_HOURS_PER_YEAR } from '../../src/simulation/core/simulation-clock';
import { createBuildingState, type BuildingUse } from '../../src/simulation/buildings/building-state';
import { createCompanyState } from '../../src/simulation/economy/company-state';
import { createDailyEconomySystem } from '../../src/simulation/economy/daily-economy-system';
import { deriveDailyEconomyFlow } from '../../src/simulation/economy/daily-economy-flow';
import { ChunkedByteGrid } from '../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../src/simulation/map/world-map-state';
import { createHouseholdState } from '../../src/simulation/population/household-state';
import { createRoadNetworkState } from '../../src/simulation/roads/road-network-state';
import {
  createCityWorldState,
  type CityWorldState,
} from '../../src/simulation/world/city-world-state';

const SAVED_AT_ISO = '2026-09-25T00:00:00.000Z';

function createDevelopedEconomyWorld(buildingCount: number, roadNodeCount: number): CityWorldState {
  const residentialCount = Math.floor(buildingCount / 2);
  const commercialCount = Math.floor((buildingCount - residentialCount) / 2);
  const industrialCount = buildingCount - residentialCount - commercialCount;
  const dimensions = createGridDimensions(128, Math.max(16, 2 + Math.ceil(buildingCount / 128)));
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: `economy-soak-${buildingCount}-${roadNodeCount}`,
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };

  const nodes = Array.from({ length: roadNodeCount }, (_, index) => ({
    id: index + 1,
    x: index,
    y: 0,
  }));
  const edges = Array.from({ length: Math.max(0, roadNodeCount - 1) }, (_, index) => ({
    id: index + 1,
    nodeA: index + 1,
    nodeB: index + 2,
    roadType: 'two-lane' as const,
    laneCount: 2 as const,
    lengthCells: 1 as const,
  }));
  const roads = createRoadNetworkState({
    topologyVersion: roadNodeCount > 0 ? 1 : 0,
    nextNodeId: roadNodeCount + 1,
    nextEdgeId: edges.length + 1,
    nodes,
    edges,
  });

  const useAt = (index: number): BuildingUse => {
    if (index < residentialCount) return 'residential';
    if (index < residentialCount + commercialCount) return 'commercial';
    return 'industrial';
  };
  const buildings = createBuildingState({
    version: buildingCount,
    nextBuildingId: buildingCount + 1,
    buildings: Array.from({ length: buildingCount }, (_, index) => ({
      id: index + 1,
      x: index % dimensions.width,
      y: 1 + Math.floor(index / dimensions.width),
      use: useAt(index),
      level: 1 as const,
    })),
  });

  const households = createHouseholdState({
    version: residentialCount,
    nextHouseholdId: residentialCount + 1,
    households: Array.from({ length: residentialCount }, (_, index) => ({
      id: index + 1,
      homeBuildingId: index + 1,
      memberCount: 3,
      workerCount: 2,
    })),
  });

  const firstBusinessBuildingId = residentialCount + 1;
  const companies = createCompanyState({
    version: commercialCount + industrialCount,
    nextCompanyId: commercialCount + industrialCount + 1,
    companies: Array.from({ length: commercialCount + industrialCount }, (_, index) => {
      const commercial = index < commercialCount;
      return {
        id: index + 1,
        buildingId: firstBusinessBuildingId + index,
        kind: commercial ? ('commercial' as const) : ('industrial' as const),
        jobCapacity: commercial ? 8 : 12,
      };
    }),
  });

  return createCityWorldState(
    map,
    roads,
    undefined,
    buildings,
    undefined,
    households,
    companies,
  );
}

function createEconomyEngine(world: CityWorldState, seed = 'economy-soak') {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed,
    systems: [createDailyEconomySystem()],
  });
}

function save(engine: SimulationEngine<CityWorldState>) {
  return createKernelSaveWithCodec(engine, SAVED_AT_ISO, cityWorldSaveCodec);
}

describe('economy long-run persistence', () => {
  it('keeps a 5,000-building developed city below 512 KiB and stable across 20 years', () => {
    const engine = createEconomyEngine(createDevelopedEconomyWorld(5_000, 128));
    const initialBytes = measureJsonBytes(save(engine));
    const dailyFlow = deriveDailyEconomyFlow(engine.state.world);

    engine.step(SIMULATION_HOURS_PER_YEAR * 10);
    const tenYearSave = save(engine);
    const tenYearBytes = measureJsonBytes(tenYearSave);
    const tenYearTreasury = engine.state.world.economy.treasury;

    engine.step(SIMULATION_HOURS_PER_YEAR * 10);
    const twentyYearSave = save(engine);
    const twentyYearBytes = measureJsonBytes(twentyYearSave);

    console.info(
      `economy-storage-metric buildings=5000 initialBytes=${initialBytes} tenYearBytes=${tenYearBytes} twentyYearBytes=${twentyYearBytes} dailyRevenue=${dailyFlow.taxRevenue} dailyCost=${dailyFlow.operatingCost} tenYearTreasury=${tenYearTreasury}`,
    );

    expect(initialBytes).toBeLessThan(512 * 1024);
    expect(tenYearBytes).toBeLessThan(512 * 1024);
    expect(twentyYearBytes).toBeLessThan(512 * 1024);
    expect(Math.abs(twentyYearBytes - tenYearBytes)).toBeLessThan(128);
    expect(Number.isSafeInteger(engine.state.world.economy.treasury)).toBe(true);

    const serialized = JSON.stringify(twentyYearSave);
    expect(serialized).not.toContain('dailyHistory');
    expect(serialized).not.toContain('ledger');
    expect(serialized).not.toContain('transactions');
    expect(serialized).not.toContain('taxRevenue');
    expect(serialized).not.toContain('operatingCost');
  }, 20_000);

  it('matches a 10-year uninterrupted treasury after midpoint save and restore', () => {
    const world = createDevelopedEconomyWorld(500, 64);

    const uninterrupted = createEconomyEngine(world, 'economy-restore-soak');
    uninterrupted.step(SIMULATION_HOURS_PER_YEAR * 10);

    const staged = createEconomyEngine(world, 'economy-restore-soak');
    staged.step(SIMULATION_HOURS_PER_YEAR * 5);
    const saved = save(staged);
    const restoredState = restoreKernelStateWithCodec(saved, cityWorldSaveCodec);
    const restored = SimulationEngine.restore<CityWorldState>({
      state: restoredState,
      systems: [createDailyEconomySystem()],
    });
    restored.step(SIMULATION_HOURS_PER_YEAR * 5);

    expect(restored.state.world.economy).toEqual(uninterrupted.state.world.economy);
    expect(restored.state.clock).toEqual(uninterrupted.state.clock);
    expect(restored.state.randomState).toEqual(uninterrupted.state.randomState);
    expect(restored.state.revision).toBe(uninterrupted.state.revision);
  }, 15_000);

  it('remains deterministic and safe over 50 simulated years', () => {
    const world = createDevelopedEconomyWorld(100, 32);
    const a = createEconomyEngine(world, 'economy-50-year');
    const b = createEconomyEngine(world, 'economy-50-year');

    a.step(SIMULATION_HOURS_PER_YEAR * 50);
    b.step(SIMULATION_HOURS_PER_YEAR * 50);

    expect(a.state.world.economy).toEqual(b.state.world.economy);
    expect(a.state.clock).toEqual(b.state.clock);
    expect(a.state.randomState).toEqual(b.state.randomState);
    expect(Number.isSafeInteger(a.state.world.economy.treasury)).toBe(true);
    expect(a.state.world.economy.version).toBe(365 * 50);
  }, 15_000);
});
