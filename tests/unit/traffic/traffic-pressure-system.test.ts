import { describe, expect, it } from 'vitest';
import { cityWorldSaveCodec } from '../../../src/persistence/codec/city-world-codec';
import {
  createKernelSaveWithCodec,
  restoreKernelStateWithCodec,
} from '../../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../../src/simulation/core/simulation-engine';
import { createBuildingState } from '../../../src/simulation/buildings/building-state';
import { createCompanyState } from '../../../src/simulation/economy/company-state';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../../src/simulation/map/world-map-state';
import { createHouseholdState } from '../../../src/simulation/population/household-state';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import {
  createTrafficPressureSystem,
  MAX_TRAFFIC_COHORTS,
} from '../../../src/simulation/traffic/traffic-pressure-system';
import {
  createCityWorldState,
  type CityWorldState,
} from '../../../src/simulation/world/city-world-state';

const SAVED_AT_ISO = '2026-09-25T00:00:00.000Z';

function createLandMap(width: number, height: number, seed: string): WorldMapState {
  const dimensions = createGridDimensions(width, height);
  return {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: seed,
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
}

function createConnectedCommuteWorld(workerCount = 2, jobCapacity = 8): CityWorldState {
  const map = createLandMap(16, 16, 'traffic-connected');
  const roads = createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId: 5,
    nextEdgeId: 4,
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 2, y: 0 },
      { id: 4, x: 3, y: 0 },
    ],
    edges: [
      { id: 1, nodeA: 1, nodeB: 2, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
      { id: 2, nodeA: 2, nodeB: 3, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
      { id: 3, nodeA: 3, nodeB: 4, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
    ],
  });
  const buildings = createBuildingState({
    version: 2,
    nextBuildingId: 3,
    buildings: [
      { id: 1, x: 0, y: 1, use: 'residential', level: 1 },
      { id: 2, x: 3, y: 1, use: 'commercial', level: 1 },
    ],
  });
  const households = createHouseholdState({
    version: 1,
    nextHouseholdId: 2,
    households: [
      {
        id: 1,
        homeBuildingId: 1,
        memberCount: Math.max(2, workerCount),
        workerCount,
      },
    ],
  });
  const companies = createCompanyState({
    version: 1,
    nextCompanyId: 2,
    companies: [{ id: 1, buildingId: 2, kind: 'commercial', jobCapacity }],
  });

  return createCityWorldState(map, roads, undefined, buildings, undefined, households, companies);
}

function createNoEmploymentWorld(): CityWorldState {
  const base = createConnectedCommuteWorld();
  return createCityWorldState(
    base.map,
    base.roads,
    base.zoning,
    base.buildings,
    base.developmentDemand,
    createHouseholdState({
      version: 0,
      nextHouseholdId: 1,
      households: [],
    }),
    base.companies,
    base.economy,
    base.traffic,
  );
}

function createDisconnectedWorld(): CityWorldState {
  const map = createLandMap(16, 16, 'traffic-disconnected');
  const roads = createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId: 5,
    nextEdgeId: 3,
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 4, y: 0 },
      { id: 4, x: 5, y: 0 },
    ],
    edges: [
      { id: 1, nodeA: 1, nodeB: 2, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
      { id: 2, nodeA: 3, nodeB: 4, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
    ],
  });
  const buildings = createBuildingState({
    version: 2,
    nextBuildingId: 3,
    buildings: [
      { id: 1, x: 0, y: 1, use: 'residential', level: 1 },
      { id: 2, x: 5, y: 1, use: 'industrial', level: 1 },
    ],
  });
  const households = createHouseholdState({
    version: 1,
    nextHouseholdId: 2,
    households: [{ id: 1, homeBuildingId: 1, memberCount: 2, workerCount: 2 }],
  });
  const companies = createCompanyState({
    version: 1,
    nextCompanyId: 2,
    companies: [{ id: 1, buildingId: 2, kind: 'industrial', jobCapacity: 12 }],
  });

  return createCityWorldState(map, roads, undefined, buildings, undefined, households, companies);
}

function createLargeEmploymentWorld(): CityWorldState {
  const householdCount = 500;
  const companyBuildingId = householdCount + 1;
  const map = createLandMap(512, 16, 'traffic-large-employment');

  const roads = createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId: 502,
    nextEdgeId: 501,
    nodes: Array.from({ length: 501 }, (_, index) => ({
      id: index + 1,
      x: index,
      y: 0,
    })),
    edges: Array.from({ length: 500 }, (_, index) => ({
      id: index + 1,
      nodeA: index + 1,
      nodeB: index + 2,
      roadType: 'two-lane' as const,
      laneCount: 2 as const,
      lengthCells: 1 as const,
    })),
  });

  const buildings = createBuildingState({
    version: companyBuildingId,
    nextBuildingId: companyBuildingId + 1,
    buildings: [
      ...Array.from({ length: householdCount }, (_, index) => ({
        id: index + 1,
        x: index,
        y: 1,
        use: 'residential' as const,
        level: 1 as const,
      })),
      {
        id: companyBuildingId,
        x: householdCount,
        y: 1,
        use: 'commercial' as const,
        level: 1 as const,
      },
    ],
  });

  const households = createHouseholdState({
    version: householdCount,
    nextHouseholdId: householdCount + 1,
    households: Array.from({ length: householdCount }, (_, index) => ({
      id: index + 1,
      homeBuildingId: index + 1,
      memberCount: 2,
      workerCount: 2,
    })),
  });

  const companies = createCompanyState({
    version: 1,
    nextCompanyId: 2,
    companies: [
      {
        id: 1,
        buildingId: companyBuildingId,
        kind: 'commercial',
        jobCapacity: 1_000,
      },
    ],
  });

  return createCityWorldState(map, roads, undefined, buildings, undefined, households, companies);
}

function createEngine(world: CityWorldState, system = createTrafficPressureSystem()) {
  return {
    engine: SimulationEngine.create<CityWorldState>({
      world,
      seed: 'traffic-pressure-engine',
      systems: [system],
    }),
    system,
  };
}

describe('traffic pressure system', () => {
  it('recalculates only at the end of a simulated day', () => {
    const { engine, system } = createEngine(createConnectedCommuteWorld());

    engine.step(23);
    expect(system.getRecalculationCount()).toBe(0);
    expect(engine.state.world.traffic.edgeVolumes).toEqual([]);

    engine.step(1);

    expect(system.getRecalculationCount()).toBe(1);
    expect(engine.state.world.traffic.edgeVolumes).toEqual([
      { edgeId: 1, volume: 2 },
      { edgeId: 2, volume: 2 },
      { edgeId: 3, volume: 2 },
    ]);
  });

  it('keeps traffic empty when there is no employment', () => {
    const { engine, system } = createEngine(createNoEmploymentWorld());

    engine.step(24);

    expect(system.getRecalculationCount()).toBe(1);
    expect(system.getLastRouteSearchCount()).toBe(0);
    expect(system.getLastCohortWeight()).toBe(0);
    expect(engine.state.world.traffic.edgeVolumes).toEqual([]);
  });

  it('does not load edges for a disconnected commute pair', () => {
    const { engine, system } = createEngine(createDisconnectedWorld());

    engine.step(24);

    expect(system.getRecalculationCount()).toBe(1);
    expect(system.getLastRouteSearchCount()).toBe(1);
    expect(system.getLastCohortWeight()).toBe(2);
    expect(engine.state.world.traffic.edgeVolumes).toEqual([]);
  });

  it('bounds 1,000 employed workers to at most 64 route searches', () => {
    const { engine, system } = createEngine(createLargeEmploymentWorld());

    engine.step(24);

    expect(system.getRecalculationCount()).toBe(1);
    expect(system.getLastRouteSearchCount()).toBe(MAX_TRAFFIC_COHORTS);
    expect(system.getLastCohortWeight()).toBe(1_000);
    expect(engine.state.world.traffic.edgeVolumes.length).toBeGreaterThan(0);
    expect(Math.max(...engine.state.world.traffic.edgeVolumes.map((entry) => entry.volume))).toBe(
      1_000,
    );
  });

  it('skips unchanged subsequent days and preserves traffic identity', () => {
    const { engine, system } = createEngine(createConnectedCommuteWorld());

    engine.step(24);
    const traffic = engine.state.world.traffic;

    engine.step(24);

    expect(system.getRecalculationCount()).toBe(1);
    expect(engine.state.world.traffic).toBe(traffic);
  });

  it('does not consume RNG', () => {
    const { engine } = createEngine(createConnectedCommuteWorld());
    const randomBefore = engine.state.randomState;

    engine.step(24);

    expect(engine.state.randomState).toEqual(randomBefore);
  });

  it('matches save/restore continuation with fresh runtime routing caches', () => {
    const world = createLargeEmploymentWorld();

    const uninterruptedSystem = createTrafficPressureSystem();
    const uninterrupted = createEngine(world, uninterruptedSystem).engine;
    uninterrupted.step(48);

    const stagedSystem = createTrafficPressureSystem();
    const staged = createEngine(world, stagedSystem).engine;
    staged.step(24);
    const save = createKernelSaveWithCodec(staged, SAVED_AT_ISO, cityWorldSaveCodec);
    const restoredState = restoreKernelStateWithCodec(save, cityWorldSaveCodec);
    const restoredSystem = createTrafficPressureSystem();
    const restored = SimulationEngine.restore<CityWorldState>({
      state: restoredState,
      systems: [restoredSystem],
    });
    restored.step(24);

    expect(restored.state.world.traffic).toEqual(uninterrupted.state.world.traffic);
    expect(restored.state.randomState).toEqual(uninterrupted.state.randomState);
    expect(restored.state.clock).toEqual(uninterrupted.state.clock);
    expect(restored.state.revision).toBe(uninterrupted.state.revision);
  });
});
