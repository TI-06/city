import { describe, expect, it } from 'vitest';
import { cityWorldSaveCodec } from '../../src/persistence/codec/city-world-codec';
import { measureJsonBytes } from '../../src/shared/serialization/measure-json-bytes';
import type { GameCommand } from '../../src/shared/transport/game-command';
import {
  createKernelSaveWithCodec,
  restoreKernelStateWithCodec,
} from '../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../src/simulation/core/simulation-engine';
import { ChunkedByteGrid } from '../../src/simulation/map/chunked-byte-grid';
import {
  createGridDimensions,
  type GridDimensions,
} from '../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../src/simulation/map/world-map-state';
import {
  buildRoadPathHandler,
  type BuildRoadPathPayload,
} from '../../src/simulation/roads/build-road-command';
import type { RoadGridPoint } from '../../src/simulation/roads/road-build-plan';
import { createEmptyRoadNetwork } from '../../src/simulation/roads/road-network-state';
import {
  createCityWorldState,
  type CityWorldState,
} from '../../src/simulation/world/city-world-state';

const SAVED_AT_ISO = '2026-09-24T00:00:00.000Z';

function createAllLandCityWorld(
  width = 128,
  height = 128,
  mapSeed = 'all-land-road-soak',
): CityWorldState {
  const dimensions = createGridDimensions(width, height);
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed,
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };

  return createCityWorldState(map, createEmptyRoadNetwork());
}

function createRoadEngine(world = createAllLandCityWorld()) {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed: `road-soak-engine:${world.map.mapSeed}`,
    handlers: [buildRoadPathHandler],
  });
}

function dispatchRoad(
  engine: SimulationEngine<CityWorldState>,
  commandId: string,
  cells: readonly RoadGridPoint[],
): void {
  const command: GameCommand<'BUILD_ROAD_PATH', BuildRoadPathPayload> = {
    commandId,
    baseRevision: engine.state.revision,
    type: 'BUILD_ROAD_PATH',
    payload: { cells },
  };
  engine.dispatch(command);
}

function createSnakePath(dimensions: GridDimensions): readonly RoadGridPoint[] {
  const points: RoadGridPoint[] = [];

  for (let y = 0; y < dimensions.height; y += 1) {
    if (y % 2 === 0) {
      for (let x = 0; x < dimensions.width; x += 1) {
        points.push({ x, y });
      }
    } else {
      for (let x = dimensions.width - 1; x >= 0; x -= 1) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

function buildSnakeUntil(engine: SimulationEngine<CityWorldState>, targetNodeCount: number): void {
  const points = createSnakePath(engine.state.world.map.dimensions);
  let nextPointIndex = 0;
  let commandIndex = 0;

  while (
    engine.state.world.roads.nodes.length < targetNodeCount &&
    nextPointIndex < points.length
  ) {
    const sliceStart = nextPointIndex === 0 ? 0 : nextPointIndex - 1;
    const sliceEnd = Math.min(sliceStart + 256, points.length);
    const cells = points.slice(sliceStart, sliceEnd);

    dispatchRoad(engine, `snake-${commandIndex}`, cells);
    nextPointIndex = sliceEnd;
    commandIndex += 1;
  }
}

function saveRoadEngine(engine: SimulationEngine<CityWorldState>) {
  return createKernelSaveWithCodec(engine, SAVED_AT_ISO, cityWorldSaveCodec);
}

describe('road network long-run persistence', () => {
  it('continues monotonic node and edge ids after save and restore', () => {
    const engine = createRoadEngine();

    dispatchRoad(engine, 'first-road', [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    const beforeSave = saveRoadEngine(engine);
    const beforeEncodedRoads = beforeSave.state.world.roads;

    const restoredState = restoreKernelStateWithCodec(beforeSave, cityWorldSaveCodec);
    const restored = SimulationEngine.restore<CityWorldState>({
      state: restoredState,
      handlers: [buildRoadPathHandler],
    });

    expect(saveRoadEngine(restored).state.world.roads).toEqual(beforeEncodedRoads);

    dispatchRoad(restored, 'second-road', [
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);

    expect(restored.state.world.roads.nodes.map((node) => node.id)).toEqual([1, 2, 3, 4, 5]);
    expect(restored.state.world.roads.edges.map((edge) => edge.id)).toEqual([1, 2, 3, 4]);
    expect(restored.state.world.roads.nextNodeId).toBe(6);
    expect(restored.state.world.roads.nextEdgeId).toBe(5);
    expect(new Set(restored.state.world.roads.nodes.map((node) => node.id)).size).toBe(5);
    expect(new Set(restored.state.world.roads.edges.map((edge) => edge.id)).size).toBe(4);
  });

  it('produces the same encoded city save for the same command sequence and seed', () => {
    const a = createRoadEngine(createAllLandCityWorld(128, 128, 'deterministic-road-save'));
    const b = createRoadEngine(createAllLandCityWorld(128, 128, 'deterministic-road-save'));
    const paths: readonly (readonly RoadGridPoint[])[] = [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      [
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
      ],
      [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 4, y: 2 },
      ],
    ];

    for (let index = 0; index < paths.length; index += 1) {
      dispatchRoad(a, `det-${index}`, paths[index]!);
      dispatchRoad(b, `det-${index}`, paths[index]!);
    }

    expect(saveRoadEngine(a)).toEqual(saveRoadEngine(b));
  });

  it('does not grow durable road state with 10,000 historical no-op commands', () => {
    const engine = createRoadEngine();
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ] as const;

    dispatchRoad(engine, 'initial-road', path);
    const topologyVersion = engine.state.world.roads.topologyVersion;
    const nodeCount = engine.state.world.roads.nodes.length;
    const edgeCount = engine.state.world.roads.edges.length;
    const beforeBytes = measureJsonBytes(saveRoadEngine(engine));

    for (let index = 0; index < 10_000; index += 1) {
      dispatchRoad(engine, `noop-road-${index}`, path);
    }

    const after = saveRoadEngine(engine);
    const afterBytes = measureJsonBytes(after);
    const deltaBytes = afterBytes - beforeBytes;

    console.info(
      `road-storage-metric noopBeforeBytes=${beforeBytes} noopAfterBytes=${afterBytes} noopDeltaBytes=${deltaBytes}`,
    );

    expect(engine.recentCommandCount).toBe(256);
    expect(engine.state.world.roads.topologyVersion).toBe(topologyVersion);
    expect(engine.state.world.roads.nodes).toHaveLength(nodeCount);
    expect(engine.state.world.roads.edges).toHaveLength(edgeCount);
    expect(Math.abs(deltaBytes)).toBeLessThan(128);
    expect(JSON.stringify(after)).not.toContain('noop-road-9999');
  });

  it('keeps an 8,000+ node normalized road network below 1 MiB encoded city save', () => {
    const engine = createRoadEngine();

    buildSnakeUntil(engine, 8_000);

    const roads = engine.state.world.roads;
    const save = saveRoadEngine(engine);
    const bytes = measureJsonBytes(save);
    const nodeIds = new Set(roads.nodes.map((node) => node.id));
    const coordinateKeys = new Set(roads.nodes.map((node) => `${node.x},${node.y}`));
    const edgePairKeys = new Set(roads.edges.map((edge) => `${edge.nodeA}:${edge.nodeB}`));

    console.info(
      `road-storage-metric nodes=${roads.nodes.length} edges=${roads.edges.length} saveBytes=${bytes}`,
    );

    expect(roads.nodes.length).toBeGreaterThanOrEqual(8_000);
    expect(bytes).toBeLessThan(1024 * 1024);
    expect(nodeIds.size).toBe(roads.nodes.length);
    expect(coordinateKeys.size).toBe(roads.nodes.length);
    expect(edgePairKeys.size).toBe(roads.edges.length);

    for (const edge of roads.edges) {
      expect(nodeIds.has(edge.nodeA)).toBe(true);
      expect(nodeIds.has(edge.nodeB)).toBe(true);
    }
  });
});
