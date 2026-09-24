import { describe, expect, it } from 'vitest';
import { measureJsonBytes } from '../../../src/shared/serialization/measure-json-bytes';
import { ORDINARY_RESPONSE_TARGET_BYTES } from '../../../src/shared/transport/command-budget';
import type { GameCommand, MutationResponse } from '../../../src/shared/transport/game-command';
import { SimulationEngine } from '../../../src/simulation/core/simulation-engine';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import { TerrainCode } from '../../../src/simulation/map/world-map-state';
import {
  buildRoadPathHandler,
  type BuildRoadPathDelta,
  type BuildRoadPathPayload,
} from '../../../src/simulation/roads/build-road-command';
import { RoadBuildValidationError } from '../../../src/simulation/roads/road-build-plan';
import {
  createCityWorldState,
  createStarterCityWorld,
  type CityWorldState,
} from '../../../src/simulation/world/city-world-state';
import { ZoneCode, createZoningState } from '../../../src/simulation/zoning/zoning-state';

function createEngine(world = createStarterCityWorld('road-command')) {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed: 'road-command-engine',
    handlers: [buildRoadPathHandler],
  });
}

function buildCommand(
  commandId: string,
  baseRevision: number,
  cells: BuildRoadPathPayload['cells'],
): GameCommand<'BUILD_ROAD_PATH', BuildRoadPathPayload> {
  return {
    commandId,
    baseRevision,
    type: 'BUILD_ROAD_PATH',
    payload: { cells },
  };
}

describe('BUILD_ROAD_PATH command', () => {
  it('builds two adjacent land cells and returns a compact road delta', () => {
    const engine = createEngine();
    const originalMap = engine.state.world.map;

    const response = engine.dispatch(
      buildCommand('road-1', 0, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ) as MutationResponse<BuildRoadPathDelta>;

    expect(response).toEqual({
      commandId: 'road-1',
      revision: 1,
      delta: {
        topologyVersion: 1,
        addedNodeIds: [1, 2],
        addedEdgeIds: [1],
        constructionCost: 200,
      },
      events: [],
    });
    expect(engine.state.world.map).toBe(originalMap);
    expect(engine.state.world.roads.nodes).toHaveLength(2);
    expect(engine.state.world.roads.edges).toHaveLength(1);
    expect(engine.state.revision).toBe(1);
  });

  it('replays a duplicate command id without rebuilding the road', () => {
    const engine = createEngine();
    const command = buildCommand('road-duplicate', 0, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);

    const first = engine.dispatch(command);
    const duplicate = engine.dispatch(command);

    expect(duplicate).toEqual(first);
    expect(engine.state.revision).toBe(1);
    expect(engine.state.world.roads.topologyVersion).toBe(1);
    expect(engine.state.world.roads.nodes).toHaveLength(2);
    expect(engine.state.world.roads.edges).toHaveLength(1);
  });

  it('returns a revision conflict without mutating roads', () => {
    const engine = createEngine();
    const before = engine.state;

    const response = engine.dispatch(
      buildCommand('road-stale', 99, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    );

    expect(response).toEqual({
      kind: 'REVISION_CONFLICT',
      expectedRevision: 99,
      actualRevision: 0,
    });
    expect(engine.state).toEqual(before);
  });

  it('rejects a water path before state commit or command caching', () => {
    const engine = createEngine();
    const before = engine.state;
    let water: Readonly<{ x: number; y: number }> | undefined;

    for (let y = 0; y < engine.state.world.map.dimensions.height && water === undefined; y += 1) {
      for (let x = 0; x < engine.state.world.map.dimensions.width; x += 1) {
        if (engine.state.world.map.terrain.get(x, y) === TerrainCode.WATER) {
          water = { x, y };
          break;
        }
      }
    }

    expect(water).toBeDefined();
    const waterCell = water!;
    const neighborX =
      waterCell.x + 1 < engine.state.world.map.dimensions.width ? waterCell.x + 1 : waterCell.x - 1;

    expect(() =>
      engine.dispatch(buildCommand('road-water', 0, [waterCell, { x: neighborX, y: waterCell.y }])),
    ).toThrow(RoadBuildValidationError);

    expect(engine.state).toEqual(before);
    expect(engine.recentCommandCount).toBe(0);
  });

  it('rejects a non-adjacent path before state commit', () => {
    const engine = createEngine();
    const before = engine.state;

    expect(() =>
      engine.dispatch(
        buildCommand('road-gap', 0, [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ]),
      ),
    ).toThrow(RoadBuildValidationError);

    expect(engine.state).toEqual(before);
  });

  it('rejects road construction through an existing zone before state commit', () => {
    const base = createStarterCityWorld('road-zone-conflict');
    const zoning = createZoningState(1, base.zoning.grid.withCell(1, 0, ZoneCode.RESIDENTIAL));
    const engine = createEngine(createCityWorldState(base.map, base.roads, zoning));
    const before = engine.state;

    expect(() =>
      engine.dispatch(
        buildCommand('road-zone-conflict', 0, [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ]),
      ),
    ).toThrow(/zone.*road|overlap/i);

    expect(engine.state).toEqual(before);
    expect(engine.recentCommandCount).toBe(0);
  });

  it('treats an all-existing path as a road-topology no-op while revision advances', () => {
    const engine = createEngine();
    const cells = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ] as const;

    engine.dispatch(buildCommand('road-first', 0, cells));
    const roadsAfterFirst = engine.state.world.roads;

    const response = engine.dispatch(
      buildCommand('road-existing', 1, cells),
    ) as MutationResponse<BuildRoadPathDelta>;

    expect(response).toEqual({
      commandId: 'road-existing',
      revision: 2,
      delta: {
        topologyVersion: 1,
        addedNodeIds: [],
        addedEdgeIds: [],
        constructionCost: 0,
      },
      events: [],
    });
    expect(engine.state.world.roads).toBe(roadsAfterFirst);
    expect(engine.state.world.roads.topologyVersion).toBe(1);
    expect(engine.state.world.roads.nextNodeId).toBe(3);
    expect(engine.state.world.roads.nextEdgeId).toBe(2);
  });

  it('keeps the maximum 256-cell command response below the ordinary response budget', () => {
    const world = createStarterCityWorld('road-max-response', createGridDimensions(256, 16));
    const engine = createEngine(world);
    const cells = Array.from({ length: 256 }, (_, x) => ({ x, y: 0 }));

    const response = engine.dispatch(
      buildCommand('road-256', 0, cells),
    ) as MutationResponse<BuildRoadPathDelta>;

    expect(response.delta.addedNodeIds).toHaveLength(256);
    expect(measureJsonBytes(response)).toBeLessThan(ORDINARY_RESPONSE_TARGET_BYTES);
  });
});
