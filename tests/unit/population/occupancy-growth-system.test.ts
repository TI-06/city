import { describe, expect, it } from 'vitest';
import { cityWorldSaveCodec } from '../../../src/persistence/codec/city-world-codec';
import {
  createKernelSaveWithCodec,
  restoreKernelStateWithCodec,
} from '../../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../../src/simulation/core/simulation-engine';
import {
  createBuildingState,
  type BuildingUse,
} from '../../../src/simulation/buildings/building-state';
import {
  createCompanyState,
  type CompanyKind,
} from '../../../src/simulation/economy/company-state';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../../src/simulation/map/world-map-state';
import {
  createHouseholdState,
} from '../../../src/simulation/population/household-state';
import {
  createOccupancyGrowthSystem,
  COMMERCIAL_LEVEL_1_JOB_CAPACITY,
  INDUSTRIAL_LEVEL_1_JOB_CAPACITY,
} from '../../../src/simulation/population/occupancy-growth-system';
import { derivePopulationJobsStatistics } from '../../../src/simulation/population/population-jobs-statistics';
import { createEmptyRoadNetwork } from '../../../src/simulation/roads/road-network-state';
import {
  createCityWorldState,
  type CityWorldState,
} from '../../../src/simulation/world/city-world-state';

const SAVED_AT_ISO = '2026-09-25T00:00:00.000Z';

function createOccupancyWorld(
  uses: readonly BuildingUse[],
  options: Readonly<{
    occupiedResidentialBuildingIds?: readonly number[];
    occupiedCompanyBuildingIds?: readonly number[];
  }> = {},
): CityWorldState {
  const dimensions = createGridDimensions(Math.max(16, uses.length + 1), 16);
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: `occupancy-${uses.join('-')}`,
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
  const buildings = createBuildingState({
    version: uses.length,
    nextBuildingId: uses.length + 1,
    buildings: uses.map((use, index) => ({
      id: index + 1,
      x: index,
      y: 0,
      use,
      level: 1 as const,
    })),
  });

  const occupiedResidential = new Set(options.occupiedResidentialBuildingIds ?? []);
  const residentialBuildings = buildings.buildings.filter(
    (building) => building.use === 'residential' && occupiedResidential.has(building.id),
  );
  const households = createHouseholdState({
    version: residentialBuildings.length,
    nextHouseholdId: residentialBuildings.length + 1,
    households: residentialBuildings.map((building, index) => ({
      id: index + 1,
      homeBuildingId: building.id,
      memberCount: 2,
      workerCount: 1,
    })),
  });

  const occupiedCompanies = new Set(options.occupiedCompanyBuildingIds ?? []);
  const businessBuildings = buildings.buildings.filter(
    (building) => building.use !== 'residential' && occupiedCompanies.has(building.id),
  );
  const companies = createCompanyState({
    version: businessBuildings.length,
    nextCompanyId: businessBuildings.length + 1,
    companies: businessBuildings.map((building, index) => ({
      id: index + 1,
      buildingId: building.id,
      kind: building.use as CompanyKind,
      jobCapacity:
        building.use === 'commercial'
          ? COMMERCIAL_LEVEL_1_JOB_CAPACITY
          : INDUSTRIAL_LEVEL_1_JOB_CAPACITY,
    })),
  });

  return createCityWorldState(
    map,
    createEmptyRoadNetwork(),
    undefined,
    buildings,
    undefined,
    households,
    companies,
  );
}

function createOccupancyEngine(world: CityWorldState, seed = 'occupancy-engine') {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed,
    systems: [createOccupancyGrowthSystem()],
  });
}

describe('occupancy growth system', () => {
  it('returns the same world and consumes no RNG when there are no buildings', () => {
    const world = createOccupancyWorld([]);
    const engine = createOccupancyEngine(world);
    const randomBefore = engine.state.randomState;

    engine.step(1);

    expect(engine.state.world).toBe(world);
    expect(engine.state.randomState).toEqual(randomBefore);
  });

  it('creates one compact household in an eligible residential building', () => {
    const engine = createOccupancyEngine(createOccupancyWorld(['residential']));

    engine.step(1);

    expect(engine.state.world.households.households).toHaveLength(1);
    const household = engine.state.world.households.households[0]!;
    expect(household.id).toBe(1);
    expect(household.homeBuildingId).toBe(1);
    expect(household.memberCount).toBeGreaterThanOrEqual(1);
    expect(household.memberCount).toBeLessThanOrEqual(4);
    expect(household.workerCount).toBeGreaterThanOrEqual(1);
    expect(household.workerCount).toBeLessThanOrEqual(Math.min(2, household.memberCount));
    expect(engine.state.world.companies.companies).toHaveLength(0);
  });

  it.each([
    ['commercial', COMMERCIAL_LEVEL_1_JOB_CAPACITY],
    ['industrial', INDUSTRIAL_LEVEL_1_JOB_CAPACITY],
  ] as const)('creates a %s company with the expected job capacity', (use, jobCapacity) => {
    const engine = createOccupancyEngine(createOccupancyWorld([use]), `company-${use}`);

    engine.step(1);

    expect(engine.state.world.households.households).toHaveLength(0);
    expect(engine.state.world.companies.companies).toEqual([
      {
        id: 1,
        buildingId: 1,
        kind: use,
        jobCapacity,
      },
    ]);
  });

  it('creates at most one household and one company per simulated hour', () => {
    const engine = createOccupancyEngine(
      createOccupancyWorld([
        'residential',
        'residential',
        'residential',
        'commercial',
        'industrial',
        'commercial',
      ]),
    );

    engine.step(1);

    expect(engine.state.world.households.households).toHaveLength(1);
    expect(engine.state.world.companies.companies).toHaveLength(1);
  });

  it('does not duplicate occupancy and consumes no RNG when every building is occupied', () => {
    const world = createOccupancyWorld(['residential', 'commercial'], {
      occupiedResidentialBuildingIds: [1],
      occupiedCompanyBuildingIds: [2],
    });
    const engine = createOccupancyEngine(world);
    const randomBefore = engine.state.randomState;

    engine.step(1);

    expect(engine.state.world).toBe(world);
    expect(engine.state.randomState).toEqual(randomBefore);
    expect(engine.state.world.households.households).toHaveLength(1);
    expect(engine.state.world.companies.companies).toHaveLength(1);
  });

  it('produces identical occupancy for the same seed, state, and horizon', () => {
    const uses = Array.from({ length: 24 }, (_, index): BuildingUse =>
      index % 3 === 0 ? 'residential' : index % 3 === 1 ? 'commercial' : 'industrial',
    );
    const world = createOccupancyWorld(uses);
    const a = createOccupancyEngine(world, 'same-occupancy-seed');
    const b = createOccupancyEngine(world, 'same-occupancy-seed');

    a.step(24);
    b.step(24);

    expect(a.state.world.households).toEqual(b.state.world.households);
    expect(a.state.world.companies).toEqual(b.state.world.companies);
    expect(a.state.randomState).toEqual(b.state.randomState);
  });

  it('matches uninterrupted simulation after save/restore with fresh occupancy caches', () => {
    const uses = [
      ...Array.from({ length: 32 }, () => 'residential' as const),
      ...Array.from({ length: 16 }, () => 'commercial' as const),
      ...Array.from({ length: 16 }, () => 'industrial' as const),
    ];
    const world = createOccupancyWorld(uses);

    const uninterrupted = createOccupancyEngine(world, 'restore-occupancy-seed');
    uninterrupted.step(48);

    const staged = createOccupancyEngine(world, 'restore-occupancy-seed');
    staged.step(24);
    const save = createKernelSaveWithCodec(staged, SAVED_AT_ISO, cityWorldSaveCodec);
    const restoredState = restoreKernelStateWithCodec(save, cityWorldSaveCodec);
    const restored = SimulationEngine.restore<CityWorldState>({
      state: restoredState,
      systems: [createOccupancyGrowthSystem()],
    });
    restored.step(24);

    expect(restored.state.world.households).toEqual(uninterrupted.state.world.households);
    expect(restored.state.world.companies).toEqual(uninterrupted.state.world.companies);
    expect(restored.state.randomState).toEqual(uninterrupted.state.randomState);
    expect(restored.state.clock).toEqual(uninterrupted.state.clock);
  });

  it('makes derived population and jobs grow as occupancy appears', () => {
    const engine = createOccupancyEngine(
      createOccupancyWorld(['residential', 'commercial']),
      'population-jobs-growth',
    );

    expect(
      derivePopulationJobsStatistics(
        engine.state.world.households,
        engine.state.world.companies,
      ),
    ).toEqual({
      population: 0,
      laborForce: 0,
      jobs: 0,
      employed: 0,
      unemployed: 0,
    });

    engine.step(1);

    const stats = derivePopulationJobsStatistics(
      engine.state.world.households,
      engine.state.world.companies,
    );
    expect(stats.population).toBeGreaterThan(0);
    expect(stats.laborForce).toBeGreaterThan(0);
    expect(stats.jobs).toBe(COMMERCIAL_LEVEL_1_JOB_CAPACITY);
    expect(stats.employed).toBe(Math.min(stats.laborForce, stats.jobs));
    expect(stats.unemployed).toBe(stats.laborForce - stats.employed);
  });
});
