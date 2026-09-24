import { describe, expect, it } from 'vitest';
import { cityWorldSaveCodec } from '../../src/persistence/codec/city-world-codec';
import { measureJsonBytes } from '../../src/shared/serialization/measure-json-bytes';
import {
  createKernelSaveWithCodec,
  restoreKernelStateWithCodec,
} from '../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../src/simulation/core/simulation-engine';
import {
  createBuildingState,
  type BuildingUse,
} from '../../src/simulation/buildings/building-state';
import { createCompanyState } from '../../src/simulation/economy/company-state';
import { ChunkedByteGrid } from '../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../src/simulation/map/world-map-state';
import { createHouseholdState } from '../../src/simulation/population/household-state';
import {
  COMMERCIAL_LEVEL_1_JOB_CAPACITY,
  createOccupancyGrowthSystem,
  INDUSTRIAL_LEVEL_1_JOB_CAPACITY,
} from '../../src/simulation/population/occupancy-growth-system';
import { derivePopulationJobsStatistics } from '../../src/simulation/population/population-jobs-statistics';
import { createEmptyRoadNetwork } from '../../src/simulation/roads/road-network-state';
import {
  createCityWorldState,
  type CityWorldState,
} from '../../src/simulation/world/city-world-state';

const SAVED_AT_ISO = '2026-09-25T00:00:00.000Z';
const RESIDENTIAL_BUILDINGS = 2_500;
const COMMERCIAL_BUILDINGS = 1_250;
const INDUSTRIAL_BUILDINGS = 1_250;
const TOTAL_BUILDINGS = RESIDENTIAL_BUILDINGS + COMMERCIAL_BUILDINGS + INDUSTRIAL_BUILDINGS;

function buildingUseAt(index: number): BuildingUse {
  if (index < RESIDENTIAL_BUILDINGS) return 'residential';
  if (index < RESIDENTIAL_BUILDINGS + COMMERCIAL_BUILDINGS) return 'commercial';
  return 'industrial';
}

function createFiveThousandBuildingWorld(): CityWorldState {
  const dimensions = createGridDimensions(128, 64);
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: 'population-jobs-soak',
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
  const buildings = createBuildingState({
    version: TOTAL_BUILDINGS,
    nextBuildingId: TOTAL_BUILDINGS + 1,
    buildings: Array.from({ length: TOTAL_BUILDINGS }, (_, index) => ({
      id: index + 1,
      x: index % dimensions.width,
      y: Math.floor(index / dimensions.width),
      use: buildingUseAt(index),
      level: 1 as const,
    })),
  });

  return createCityWorldState(map, createEmptyRoadNetwork(), undefined, buildings);
}

function createFullyOccupiedWorld(): CityWorldState {
  const base = createFiveThousandBuildingWorld();

  const households = createHouseholdState({
    version: RESIDENTIAL_BUILDINGS,
    nextHouseholdId: RESIDENTIAL_BUILDINGS + 1,
    households: Array.from({ length: RESIDENTIAL_BUILDINGS }, (_, index) => ({
      id: index + 1,
      homeBuildingId: index + 1,
      memberCount: 3,
      workerCount: 2,
    })),
  });

  const firstBusinessBuildingId = RESIDENTIAL_BUILDINGS + 1;
  const companies = createCompanyState({
    version: COMMERCIAL_BUILDINGS + INDUSTRIAL_BUILDINGS,
    nextCompanyId: COMMERCIAL_BUILDINGS + INDUSTRIAL_BUILDINGS + 1,
    companies: Array.from({ length: COMMERCIAL_BUILDINGS + INDUSTRIAL_BUILDINGS }, (_, index) => {
      const buildingId = firstBusinessBuildingId + index;
      const isCommercial = index < COMMERCIAL_BUILDINGS;
      return {
        id: index + 1,
        buildingId,
        kind: isCommercial ? ('commercial' as const) : ('industrial' as const),
        jobCapacity: isCommercial
          ? COMMERCIAL_LEVEL_1_JOB_CAPACITY
          : INDUSTRIAL_LEVEL_1_JOB_CAPACITY,
      };
    }),
  });

  return createCityWorldState(
    base.map,
    base.roads,
    base.zoning,
    base.buildings,
    base.developmentDemand,
    households,
    companies,
  );
}

function createOccupancyEngine(world: CityWorldState, seed = 'population-jobs-soak-engine') {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed,
    systems: [createOccupancyGrowthSystem()],
  });
}

function save(engine: SimulationEngine<CityWorldState>) {
  return createKernelSaveWithCodec(engine, SAVED_AT_ISO, cityWorldSaveCodec);
}

describe('population and jobs long-run persistence', () => {
  it('keeps 5,000 fully occupied mixed buildings below 512 KiB', () => {
    const engine = createOccupancyEngine(createFullyOccupiedWorld());
    const encoded = save(engine);
    const bytes = measureJsonBytes(encoded);
    const stats = derivePopulationJobsStatistics(
      engine.state.world.households,
      engine.state.world.companies,
    );

    console.info(
      `population-jobs-storage-metric buildings=${TOTAL_BUILDINGS} households=${engine.state.world.households.households.length} companies=${engine.state.world.companies.companies.length} population=${stats.population} jobs=${stats.jobs} saveBytes=${bytes}`,
    );

    expect(engine.state.world.households.households).toHaveLength(RESIDENTIAL_BUILDINGS);
    expect(engine.state.world.companies.companies).toHaveLength(
      COMMERCIAL_BUILDINGS + INDUSTRIAL_BUILDINGS,
    );
    expect(bytes).toBeLessThan(512 * 1024);
    expect(JSON.stringify(encoded)).not.toContain('candidate');
    expect(JSON.stringify(encoded)).not.toContain('buildingById');
  });

  it('fills current occupancy, remains valid through 5,000 hours, and stops growing after saturation', () => {
    const engine = createOccupancyEngine(createFiveThousandBuildingWorld());

    engine.step(2_500);

    expect(engine.state.world.households.households).toHaveLength(RESIDENTIAL_BUILDINGS);
    expect(engine.state.world.companies.companies).toHaveLength(
      COMMERCIAL_BUILDINGS + INDUSTRIAL_BUILDINGS,
    );

    const saturatedSave = save(engine);
    const saturatedBytes = measureJsonBytes(saturatedSave);
    const randomAtSaturation = engine.state.randomState;

    engine.step(2_500);

    const after = save(engine);
    const afterBytes = measureJsonBytes(after);
    const deltaBytes = afterBytes - saturatedBytes;

    console.info(
      `population-jobs-storage-metric saturatedBeforeBytes=${saturatedBytes} saturatedAfterBytes=${afterBytes} saturatedDeltaBytes=${deltaBytes}`,
    );

    expect(engine.state.randomState).toEqual(randomAtSaturation);
    expect(engine.state.world.households.households).toHaveLength(RESIDENTIAL_BUILDINGS);
    expect(engine.state.world.companies.companies).toHaveLength(
      COMMERCIAL_BUILDINGS + INDUSTRIAL_BUILDINGS,
    );
    expect(Math.abs(deltaBytes)).toBeLessThan(128);

    const householdIds = new Set(
      engine.state.world.households.households.map((entity) => entity.id),
    );
    const householdBuildings = new Set(
      engine.state.world.households.households.map((entity) => entity.homeBuildingId),
    );
    const companyIds = new Set(engine.state.world.companies.companies.map((entity) => entity.id));
    const companyBuildings = new Set(
      engine.state.world.companies.companies.map((entity) => entity.buildingId),
    );
    const buildingById = new Map(
      engine.state.world.buildings.buildings.map((building) => [building.id, building]),
    );

    expect(householdIds.size).toBe(engine.state.world.households.households.length);
    expect(householdBuildings.size).toBe(engine.state.world.households.households.length);
    expect(companyIds.size).toBe(engine.state.world.companies.companies.length);
    expect(companyBuildings.size).toBe(engine.state.world.companies.companies.length);

    for (const household of engine.state.world.households.households) {
      expect(buildingById.get(household.homeBuildingId)?.use).toBe('residential');
    }
    for (const company of engine.state.world.companies.companies) {
      expect(buildingById.get(company.buildingId)?.use).toBe(company.kind);
    }

    const stats = derivePopulationJobsStatistics(
      engine.state.world.households,
      engine.state.world.companies,
    );
    expect(Number.isSafeInteger(stats.population)).toBe(true);
    expect(Number.isSafeInteger(stats.laborForce)).toBe(true);
    expect(Number.isSafeInteger(stats.jobs)).toBe(true);
    expect(Number.isSafeInteger(stats.employed)).toBe(true);
    expect(Number.isSafeInteger(stats.unemployed)).toBe(true);
  });

  it('matches long-horizon uninterrupted occupancy after save and restore', () => {
    const world = createFiveThousandBuildingWorld();

    const uninterrupted = createOccupancyEngine(world, 'population-jobs-restore');
    uninterrupted.step(2_500);

    const staged = createOccupancyEngine(world, 'population-jobs-restore');
    staged.step(1_000);
    const saved = save(staged);
    const restoredState = restoreKernelStateWithCodec(saved, cityWorldSaveCodec);
    const restored = SimulationEngine.restore<CityWorldState>({
      state: restoredState,
      systems: [createOccupancyGrowthSystem()],
    });
    restored.step(1_500);

    expect(restored.state.world.households).toEqual(uninterrupted.state.world.households);
    expect(restored.state.world.companies).toEqual(uninterrupted.state.world.companies);
    expect(restored.state.randomState).toEqual(uninterrupted.state.randomState);
    expect(restored.state.clock).toEqual(uninterrupted.state.clock);
    expect(restored.state.revision).toBe(uninterrupted.state.revision);
  });
});
