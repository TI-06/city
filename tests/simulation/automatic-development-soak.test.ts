import { describe, expect, it } from 'vitest';
import { cityWorldSaveCodec } from '../../src/persistence/codec/city-world-codec';
import { measureJsonBytes } from '../../src/shared/serialization/measure-json-bytes';
import {
  createBuildingState,
  createEmptyBuildingState,
  type Building,
  type BuildingUse,
} from '../../src/simulation/buildings/building-state';
import {
  createKernelSaveWithCodec,
  restoreKernelStateWithCodec,
} from '../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../src/simulation/core/simulation-engine';
import { createAutomaticDevelopmentSystem } from '../../src/simulation/development/automatic-development-system';
import { createDevelopmentDemandState } from '../../src/simulation/development/development-demand-state';
import { ChunkedByteGrid } from '../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../src/simulation/map/grid-dimensions';
import { createStarterCityWorld } from '../../src/simulation/world/city-world-state';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../src/simulation/map/world-map-state';
import {
  createEmptyRoadNetwork,
  createRoadNetworkState,
  type RoadEdge,
  type RoadNode,
} from '../../src/simulation/roads/road-network-state';
import {
  createCityWorldState,
  type CityWorldState,
} from '../../src/simulation/world/city-world-state';
import {
  ZoneCode,
  createEmptyZoning,
  createZoningState,
} from '../../src/simulation/zoning/zoning-state';

const SAVED_AT_ISO = '2026-09-25T00:00:00.000Z';

function createAllLandMap(width: number, height: number, seed: string): WorldMapState {
  const dimensions = createGridDimensions(width, height);
  return {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: seed,
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
}

function createBuildingFixtureWorld(count: number): CityWorldState {
  const map = createAllLandMap(128, 128, 'building-save-fixture');
  const uses: readonly BuildingUse[] = ['residential', 'commercial', 'industrial'];
  const buildings: Building[] = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    x: index % map.dimensions.width,
    y: Math.floor(index / map.dimensions.width),
    use: uses[index % uses.length]!,
    level: 1,
  }));

  return createCityWorldState(
    map,
    createEmptyRoadNetwork(),
    createEmptyZoning(map.dimensions),
    createBuildingState({
      version: count,
      nextBuildingId: count + 1,
      buildings,
    }),
    createDevelopmentDemandState({
      version: 0,
      residential: 60,
      commercial: 60,
      industrial: 60,
    }),
  );
}

function createDenseDevelopmentWorld(size = 128): CityWorldState {
  const map = createAllLandMap(size, size, `dense-development-${size}`);
  const nodes: RoadNode[] = [];
  const edges: RoadEdge[] = [];
  let nextNodeId = 1;
  let nextEdgeId = 1;

  for (let y = 0; y < size; y += 2) {
    let previousNodeId: number | undefined;
    for (let x = 0; x < size; x += 1) {
      const nodeId = nextNodeId;
      nextNodeId += 1;
      nodes.push({ id: nodeId, x, y });

      if (previousNodeId !== undefined) {
        edges.push({
          id: nextEdgeId,
          nodeA: previousNodeId,
          nodeB: nodeId,
          roadType: 'two-lane',
          laneCount: 2,
          lengthCells: 1,
        });
        nextEdgeId += 1;
      }
      previousNodeId = nodeId;
    }
  }

  const roads = createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId,
    nextEdgeId,
    nodes,
    edges,
  });

  let grid = ChunkedByteGrid.filled(map.dimensions, ZoneCode.NONE);
  for (let y = 1; y < size; y += 2) {
    for (let x = 0; x < size; x += 1) {
      const selector = (x + y) % 3;
      const zone =
        selector === 0
          ? ZoneCode.RESIDENTIAL
          : selector === 1
            ? ZoneCode.COMMERCIAL
            : ZoneCode.INDUSTRIAL;
      grid = grid.withCell(x, y, zone);
    }
  }

  return createCityWorldState(
    map,
    roads,
    createZoningState(1, grid),
    createEmptyBuildingState(),
    createDevelopmentDemandState({
      version: 0,
      residential: 100,
      commercial: 100,
      industrial: 100,
    }),
  );
}

function createEngine(world: CityWorldState, seed = 'automatic-development-soak') {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed,
    systems: [createAutomaticDevelopmentSystem()],
  });
}

function saveEngine(engine: SimulationEngine<CityWorldState>) {
  return createKernelSaveWithCodec(engine, SAVED_AT_ISO, cityWorldSaveCodec);
}

describe('automatic development long-run persistence', () => {
  it('keeps a 128x128 starter CityWorld v2 save below 128 KiB', () => {
    const engine = createEngine(createStarterCityWorld('building-starter-size'));
    const bytes = measureJsonBytes(saveEngine(engine));

    console.info(`building-storage-metric starter128Bytes=${bytes}`);
    expect(bytes).toBeLessThan(128 * 1024);
  });

  it('keeps a 512x512 empty CityWorld v2 save below 1 MiB', () => {
    const engine = createEngine(
      createStarterCityWorld('building-max-size', createGridDimensions(512, 512)),
    );
    const bytes = measureJsonBytes(saveEngine(engine));

    console.info(`building-storage-metric max512Bytes=${bytes}`);
    expect(bytes).toBeLessThan(1024 * 1024);
  });

  it('keeps 5,000 current buildings below 512 KiB without runtime index data', () => {
    const engine = createEngine(createBuildingFixtureWorld(5_000));
    const save = saveEngine(engine);
    const bytes = measureJsonBytes(save);
    const serialized = JSON.stringify(save);

    console.info(`building-storage-metric buildings5000Bytes=${bytes}`);

    expect(bytes).toBeLessThan(512 * 1024);
    expect(save.state.world.buildings.buildings).toHaveLength(5_000);
    expect(serialized).not.toContain('cachedZoningVersion');
    expect(serialized).not.toContain('occupiedBuildingCoordinates');
    expect(serialized).not.toContain('RoadAccessIndex');
    expect(serialized).not.toContain('automatic-development');
  });

  it('stays normalized and within budget across 2,000 simulated development hours', () => {
    const engine = createEngine(createDenseDevelopmentWorld(128), 'development-2000h');

    engine.step(2_000);

    const buildings = engine.state.world.buildings;
    const ids = new Set(buildings.buildings.map((building) => building.id));
    const coordinates = new Set(
      buildings.buildings.map((building) => `${building.x},${building.y}`),
    );
    const roadCoordinates = new Set(
      engine.state.world.roads.nodes.map((node) => `${node.x},${node.y}`),
    );
    const bytes = measureJsonBytes(saveEngine(engine));

    console.info(
      `building-storage-metric hours=2000 buildings=${buildings.buildings.length} saveBytes=${bytes}`,
    );

    expect(buildings.buildings.length).toBeGreaterThan(1_500);
    expect(buildings.buildings.length).toBeLessThanOrEqual(2_000);
    expect(ids.size).toBe(buildings.buildings.length);
    expect(coordinates.size).toBe(buildings.buildings.length);
    expect(Number.isSafeInteger(buildings.version)).toBe(true);
    expect(Number.isSafeInteger(buildings.nextBuildingId)).toBe(true);
    expect(buildings.nextBuildingId).toBeGreaterThan(buildings.buildings.length);

    for (const building of buildings.buildings) {
      expect(Number.isSafeInteger(building.id)).toBe(true);
      expect(building.id).toBeGreaterThan(0);
      expect(roadCoordinates.has(`${building.x},${building.y}`)).toBe(false);
      expect(engine.state.world.map.terrain.get(building.x, building.y)).toBe(TerrainCode.LAND);
    }

    expect(bytes).toBeLessThan(1024 * 1024);
  });

  it('matches a long uninterrupted run after save/restore with fresh derived caches', () => {
    const world = createDenseDevelopmentWorld(64);

    const uninterrupted = createEngine(world, 'development-long-restore');
    uninterrupted.step(400);

    const staged = createEngine(world, 'development-long-restore');
    staged.step(200);
    const save = saveEngine(staged);
    const restoredState = restoreKernelStateWithCodec(save, cityWorldSaveCodec);
    const restored = SimulationEngine.restore<CityWorldState>({
      state: restoredState,
      systems: [createAutomaticDevelopmentSystem()],
    });
    restored.step(200);

    expect(restored.state.world.buildings).toEqual(uninterrupted.state.world.buildings);
    expect(restored.state.randomState).toEqual(uninterrupted.state.randomState);
    expect(restored.state.clock).toEqual(uninterrupted.state.clock);
    expect(restored.state.revision).toBe(uninterrupted.state.revision);
  });
});
