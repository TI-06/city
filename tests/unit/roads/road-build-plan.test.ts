import { describe, expect, it } from 'vitest';
import { createStarterWorldMap } from '../../../src/simulation/map/starter-map-generator';
import { TerrainCode, type WorldMapState } from '../../../src/simulation/map/world-map-state';
import {
  MAX_ROAD_PATH_CELLS,
  ROAD_TWO_LANE_CELL_COST,
  RoadBuildValidationError,
  planRoadBuild,
  type RoadBuildValidationCode,
  type RoadGridPoint,
} from '../../../src/simulation/roads/road-build-plan';
import {
  createEmptyRoadNetwork,
  createRoadNetworkState,
  type RoadNetworkState,
} from '../../../src/simulation/roads/road-network-state';

function expectValidationCode(action: () => unknown, code: RoadBuildValidationCode): void {
  try {
    action();
    throw new Error('Expected road build validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(RoadBuildValidationError);
    expect((error as RoadBuildValidationError).code).toBe(code);
  }
}

function findWaterCell(map: WorldMapState): RoadGridPoint {
  for (let y = 0; y < map.dimensions.height; y += 1) {
    for (let x = 0; x < map.dimensions.width; x += 1) {
      if (map.terrain.get(x, y) === TerrainCode.WATER) {
        return { x, y };
      }
    }
  }

  throw new Error('Fixture map did not contain water');
}

function createLNetwork(): RoadNetworkState {
  return createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId: 4,
    nextEdgeId: 3,
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 0, y: 1 },
    ],
    edges: [
      {
        id: 1,
        nodeA: 1,
        nodeB: 2,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
      {
        id: 2,
        nodeA: 1,
        nodeB: 3,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
    ],
  });
}

describe('road build planning', () => {
  it('plans two adjacent land cells on an empty network', () => {
    const map = createStarterWorldMap('basic-road');
    const roads = createEmptyRoadNetwork();

    const plan = planRoadBuild(map, roads, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);

    expect(ROAD_TWO_LANE_CELL_COST).toBe(100);
    expect(MAX_ROAD_PATH_CELLS).toBe(256);
    expect(plan.constructionCost).toBe(2 * ROAD_TWO_LANE_CELL_COST);
    expect(plan.nodesToAdd).toEqual([
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
    ]);
    expect(plan.edgesToAdd).toEqual([
      {
        id: 1,
        nodeA: 1,
        nodeB: 2,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
    ]);
  });

  it('rejects a one-cell path', () => {
    const map = createStarterWorldMap('short-road');

    expectValidationCode(
      () => planRoadBuild(map, createEmptyRoadNetwork(), [{ x: 0, y: 0 }]),
      'PATH_TOO_SHORT',
    );
  });

  it('rejects a path over 256 cells before coordinate validation', () => {
    const map = createStarterWorldMap('long-road');
    const cells = Array.from({ length: 257 }, (_, x) => ({ x, y: 0 }));

    expectValidationCode(
      () => planRoadBuild(map, createEmptyRoadNetwork(), cells),
      'PATH_TOO_LONG',
    );
  });

  it.each([[{ x: 1.5, y: 0 }], [{ x: Number.NaN, y: 0 }], [{ x: 0, y: Number.POSITIVE_INFINITY }]])(
    'rejects invalid coordinates',
    (invalid) => {
      const map = createStarterWorldMap('invalid-coordinate');

      expectValidationCode(
        () => planRoadBuild(map, createEmptyRoadNetwork(), [{ x: 0, y: 0 }, invalid!]),
        'INVALID_COORDINATE',
      );
    },
  );

  it('rejects an out-of-bounds coordinate', () => {
    const map = createStarterWorldMap('out-of-bounds');

    expectValidationCode(
      () =>
        planRoadBuild(map, createEmptyRoadNetwork(), [
          { x: map.dimensions.width - 1, y: 0 },
          { x: map.dimensions.width, y: 0 },
        ]),
      'OUT_OF_BOUNDS',
    );
  });

  it('rejects construction on water', () => {
    const map = createStarterWorldMap('water-road');
    const water = findWaterCell(map);

    expectValidationCode(
      () =>
        planRoadBuild(map, createEmptyRoadNetwork(), [
          { x: water.x, y: water.y },
          { x: water.x + 1, y: water.y },
        ]),
      'WATER',
    );
  });

  it('rejects repeated path cells', () => {
    const map = createStarterWorldMap('repeat-road');

    expectValidationCode(
      () =>
        planRoadBuild(map, createEmptyRoadNetwork(), [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 0 },
        ]),
      'REPEATED_CELL',
    );
  });

  it.each([
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ],
  ])('rejects diagonal or gapped path cells', (first, second) => {
    const map = createStarterWorldMap('non-adjacent');

    expectValidationCode(
      () => planRoadBuild(map, createEmptyRoadNetwork(), [first, second]),
      'NON_ADJACENT',
    );
  });

  it('leaves source road state unchanged when validation fails', () => {
    const map = createStarterWorldMap('no-mutation');
    const roads = createLNetwork();
    const before = JSON.stringify(roads);

    expectValidationCode(
      () =>
        planRoadBuild(map, roads, [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ]),
      'NON_ADJACENT',
    );
    expect(JSON.stringify(roads)).toBe(before);
  });

  it('reuses an existing intersection and connects every adjacent road cell once', () => {
    const map = createStarterWorldMap('intersection');
    const roads = createLNetwork();

    const plan = planRoadBuild(map, roads, [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);

    expect(plan.constructionCost).toBe(200);
    expect(plan.nodesToAdd).toEqual([
      { id: 4, x: 1, y: 1 },
      { id: 5, x: 2, y: 1 },
    ]);
    expect(plan.edgesToAdd).toEqual([
      {
        id: 3,
        nodeA: 2,
        nodeB: 4,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
      {
        id: 4,
        nodeA: 3,
        nodeB: 4,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
      {
        id: 5,
        nodeA: 4,
        nodeB: 5,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
    ]);

    const pairs = plan.edgesToAdd.map((edge) => `${edge.nodeA}:${edge.nodeB}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('produces an empty zero-cost plan for an all-existing path', () => {
    const map = createStarterWorldMap('existing-path');
    const roads = createLNetwork();

    const plan = planRoadBuild(map, roads, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);

    expect(plan).toEqual({
      nodesToAdd: [],
      edgesToAdd: [],
      constructionCost: 0,
    });
  });
});
