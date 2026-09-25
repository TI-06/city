import { describe, expect, it } from 'vitest';
import { cityWorldSaveCodec } from '../../../src/persistence/codec/city-world-codec';
import {
  createKernelSaveWithCodec,
  restoreKernelStateWithCodec,
} from '../../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../../src/simulation/core/simulation-engine';
import { createBuildingState } from '../../../src/simulation/buildings/building-state';
import { createCompanyState } from '../../../src/simulation/economy/company-state';
import { createDailyEconomySystem } from '../../../src/simulation/economy/daily-economy-system';
import { createEconomyState } from '../../../src/simulation/economy/economy-state';
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
  createCityWorldState,
  type CityWorldState,
} from '../../../src/simulation/world/city-world-state';

const SAVED_AT_ISO = '2026-09-25T00:00:00.000Z';

function createEconomyWorld(options: Readonly<{ populated?: boolean; roadNodes?: number }> = {}) {
  const dimensions = createGridDimensions(16, 16);
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: 'daily-economy',
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
  const roadNodeCount = options.roadNodes ?? 0;
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

  if (options.populated !== true) {
    return createCityWorldState(
      map,
      roads,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createEconomyState({ version: 0, treasury: 1_000 }),
    );
  }

  const buildings = createBuildingState({
    version: 2,
    nextBuildingId: 3,
    buildings: [
      { id: 1, x: 0, y: 1, use: 'residential', level: 1 },
      { id: 2, x: 1, y: 1, use: 'commercial', level: 1 },
    ],
  });
  const households = createHouseholdState({
    version: 1,
    nextHouseholdId: 2,
    households: [{ id: 1, homeBuildingId: 1, memberCount: 3, workerCount: 2 }],
  });
  const companies = createCompanyState({
    version: 1,
    nextCompanyId: 2,
    companies: [{ id: 1, buildingId: 2, kind: 'commercial', jobCapacity: 8 }],
  });

  return createCityWorldState(
    map,
    roads,
    undefined,
    buildings,
    undefined,
    households,
    companies,
    createEconomyState({ version: 0, treasury: 1_000 }),
  );
}

function createEngine(world: CityWorldState, seed = 'daily-economy-engine') {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed,
    systems: [createDailyEconomySystem()],
  });
}

describe('daily economy system', () => {
  it('does not settle before the 24th simulated hour', () => {
    const engine = createEngine(createEconomyWorld({ populated: true, roadNodes: 2 }));
    const economyBefore = engine.state.world.economy;

    engine.step(23);

    expect(engine.state.world.economy).toBe(economyBefore);
    expect(engine.state.world.economy.treasury).toBe(1_000);
  });

  it('settles exactly once at the end of the first day', () => {
    const engine = createEngine(createEconomyWorld({ populated: true, roadNodes: 2 }));

    engine.step(24);

    expect(engine.state.world.economy).toEqual({
      version: 1,
      treasury: 1_021,
    });
  });

  it('settles exactly twice over 48 simulated hours', () => {
    const engine = createEngine(createEconomyWorld({ populated: true, roadNodes: 2 }));

    engine.step(48);

    expect(engine.state.world.economy).toEqual({
      version: 2,
      treasury: 1_042,
    });
  });

  it('allows road maintenance to move treasury below zero', () => {
    const world = createEconomyWorld({ roadNodes: 2 });
    const engine = createEngine({
      ...world,
      economy: createEconomyState({ version: 0, treasury: 0 }),
    });

    engine.step(24);

    expect(engine.state.world.economy).toEqual({
      version: 1,
      treasury: -2,
    });
  });

  it('preserves world/economy identity on a zero-net daily settlement', () => {
    const world = createEconomyWorld();
    const engine = createEngine(world);
    const economyBefore = engine.state.world.economy;

    engine.step(24);

    expect(engine.state.world).toBe(world);
    expect(engine.state.world.economy).toBe(economyBefore);
  });

  it('consumes no random state', () => {
    const engine = createEngine(createEconomyWorld({ populated: true, roadNodes: 2 }));
    const randomBefore = engine.state.randomState;

    engine.step(48);

    expect(engine.state.randomState).toEqual(randomBefore);
  });

  it('matches uninterrupted 30-day treasury after midpoint save and restore', () => {
    const world = createEconomyWorld({ populated: true, roadNodes: 2 });

    const uninterrupted = createEngine(world, 'economy-restore');
    uninterrupted.step(24 * 30);

    const staged = createEngine(world, 'economy-restore');
    staged.step(24 * 15);
    const save = createKernelSaveWithCodec(staged, SAVED_AT_ISO, cityWorldSaveCodec);
    const restoredState = restoreKernelStateWithCodec(save, cityWorldSaveCodec);
    const restored = SimulationEngine.restore<CityWorldState>({
      state: restoredState,
      systems: [createDailyEconomySystem()],
    });
    restored.step(24 * 15);

    expect(restored.state.world.economy).toEqual(uninterrupted.state.world.economy);
    expect(restored.state.randomState).toEqual(uninterrupted.state.randomState);
    expect(restored.state.clock).toEqual(uninterrupted.state.clock);
    expect(restored.state.revision).toBe(uninterrupted.state.revision);
  });
});
