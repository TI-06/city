import { describe, expect, it } from 'vitest';
import { cityWorldSaveCodec } from '../../../src/persistence/codec/city-world-codec';
import {
  createKernelSaveWithCodec,
  restoreKernelStateWithCodec,
} from '../../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../../src/simulation/core/simulation-engine';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../../src/simulation/map/world-map-state';
import { createBuildingState, createEmptyBuildingState } from '../../../src/simulation/buildings/building-state';
import {
  createAutomaticDevelopmentSystem,
  DEVELOPMENT_ATTEMPTS_PER_HOUR,
} from '../../../src/simulation/development/automatic-development-system';
import { createDevelopmentDemandState } from '../../../src/simulation/development/development-demand-state';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import { createCityWorldState, type CityWorldState } from '../../../src/simulation/world/city-world-state';
import { ZoneCode, createZoningState, type ZoneCodeValue } from '../../../src/simulation/zoning/zoning-state';

const SAVED_AT_ISO = '2026-09-25T00:00:00.000Z';

function createLinearDevelopmentWorld(options: Readonly<{
  zone?: ZoneCodeValue;
  demand?: number;
  candidateCount?: number;
  withRoad?: boolean;
  occupiedFirstCell?: boolean;
}> = {}): CityWorldState {
  const zone = options.zone ?? ZoneCode.RESIDENTIAL;
  const demandValue = options.demand ?? 100;
  const candidateCount = options.candidateCount ?? 1;
  const withRoad = options.withRoad ?? true;
  const dimensions = createGridDimensions(Math.max(16, candidateCount), 16);
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: `development-${zone}-${candidateCount}-${withRoad}`,
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };

  const roadNodes = withRoad
    ? Array.from({ length: candidateCount }, (_, x) => ({ id: x + 1, x, y: 0 }))
    : [];
  const roadEdges = withRoad
    ? Array.from({ length: Math.max(0, candidateCount - 1) }, (_, index) => ({
        id: index + 1,
        nodeA: index + 1,
        nodeB: index + 2,
        roadType: 'two-lane' as const,
        laneCount: 2 as const,
        lengthCells: 1 as const,
      }))
    : [];
  const roads = createRoadNetworkState({
    topologyVersion: withRoad ? 1 : 0,
    nextNodeId: roadNodes.length + 1,
    nextEdgeId: roadEdges.length + 1,
    nodes: roadNodes,
    edges: roadEdges,
  });

  let zoneGrid = ChunkedByteGrid.filled(dimensions, ZoneCode.NONE);
  for (let x = 0; x < candidateCount; x += 1) {
    zoneGrid = zoneGrid.withCell(x, 1, zone);
  }
  const zoning = createZoningState(candidateCount > 0 ? 1 : 0, zoneGrid);

  const buildings =
    options.occupiedFirstCell === true
      ? createBuildingState({
          version: 1,
          nextBuildingId: 2,
          buildings: [{ id: 1, x: 0, y: 1, use: 'residential', level: 1 }],
        })
      : createEmptyBuildingState();

  const developmentDemand = createDevelopmentDemandState({
    version: 0,
    residential: demandValue,
    commercial: demandValue,
    industrial: demandValue,
  });

  return createCityWorldState(map, roads, zoning, buildings, developmentDemand);
}

function createDevelopmentEngine(world: CityWorldState, seed = 'development-engine') {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed,
    systems: [createAutomaticDevelopmentSystem()],
  });
}

describe('automatic development system', () => {
  it('checks at most the configured bounded number of candidates per hour', () => {
    expect(DEVELOPMENT_ATTEMPTS_PER_HOUR).toBe(16);
  });

  it('does not build when demand is zero', () => {
    const engine = createDevelopmentEngine(createLinearDevelopmentWorld({ demand: 0 }));

    engine.step(1);

    expect(engine.state.world.buildings.buildings).toHaveLength(0);
    expect(engine.state.world.buildings.version).toBe(0);
  });

  it('does not build without orthogonally adjacent road access', () => {
    const engine = createDevelopmentEngine(
      createLinearDevelopmentWorld({ demand: 100, withRoad: false }),
    );

    engine.step(4);

    expect(engine.state.world.buildings.buildings).toHaveLength(0);
  });

  it.each([
    [ZoneCode.RESIDENTIAL, 'residential'],
    [ZoneCode.COMMERCIAL, 'commercial'],
    [ZoneCode.INDUSTRIAL, 'industrial'],
  ] as const)('spawns the matching level-1 building for zone %s', (zone, use) => {
    const engine = createDevelopmentEngine(
      createLinearDevelopmentWorld({ zone, demand: 100 }),
      `zone-${zone}`,
    );

    engine.step(1);

    expect(engine.state.world.buildings).toEqual({
      version: 1,
      nextBuildingId: 2,
      buildings: [{ id: 1, x: 0, y: 1, use, level: 1 }],
    });
  });

  it('skips an already occupied candidate instead of creating a duplicate coordinate', () => {
    const world = createLinearDevelopmentWorld({
      demand: 100,
      occupiedFirstCell: true,
    });
    const engine = createDevelopmentEngine(world);
    const buildingsBefore = engine.state.world.buildings;

    engine.step(1);

    expect(engine.state.world.buildings).toBe(buildingsBefore);
    expect(engine.state.world.buildings.buildings).toHaveLength(1);
  });

  it('creates at most one building per simulated hour', () => {
    const engine = createDevelopmentEngine(
      createLinearDevelopmentWorld({ demand: 100, candidateCount: 16 }),
    );

    engine.step(1);

    expect(engine.state.world.buildings.buildings).toHaveLength(1);
    expect(engine.state.world.buildings.version).toBe(1);
  });

  it('returns the same world and consumes no random state when there are no zoned candidates', () => {
    const world = createLinearDevelopmentWorld({ candidateCount: 0, withRoad: false });
    const engine = createDevelopmentEngine(world);
    const randomBefore = engine.state.randomState;

    engine.step(1);

    expect(engine.state.world).toBe(world);
    expect(engine.state.randomState).toEqual(randomBefore);
  });

  it('produces identical development for the same seed, state, and horizon', () => {
    const world = createLinearDevelopmentWorld({ demand: 73, candidateCount: 32 });
    const a = createDevelopmentEngine(world, 'same-development-seed');
    const b = createDevelopmentEngine(world, 'same-development-seed');

    a.step(72);
    b.step(72);

    expect(a.state.world.buildings).toEqual(b.state.world.buildings);
    expect(a.state.randomState).toEqual(b.state.randomState);
  });

  it('matches uninterrupted 48h simulation after save at 24h and restore with fresh caches', () => {
    const world = createLinearDevelopmentWorld({ demand: 67, candidateCount: 64 });

    const uninterrupted = createDevelopmentEngine(world, 'restore-development-seed');
    uninterrupted.step(48);

    const staged = createDevelopmentEngine(world, 'restore-development-seed');
    staged.step(24);
    const save = createKernelSaveWithCodec(staged, SAVED_AT_ISO, cityWorldSaveCodec);
    const restoredState = restoreKernelStateWithCodec(save, cityWorldSaveCodec);
    const restored = SimulationEngine.restore<CityWorldState>({
      state: restoredState,
      systems: [createAutomaticDevelopmentSystem()],
    });
    restored.step(24);

    expect(restored.state.world.buildings).toEqual(uninterrupted.state.world.buildings);
    expect(restored.state.randomState).toEqual(uninterrupted.state.randomState);
    expect(restored.state.clock).toEqual(uninterrupted.state.clock);
    expect(restored.state.revision).toBe(uninterrupted.state.revision);
  });
});
