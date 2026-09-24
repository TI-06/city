import { describe, expect, it } from 'vitest';
import { measureJsonBytes } from '../../../src/shared/serialization/measure-json-bytes';
import { ORDINARY_RESPONSE_TARGET_BYTES } from '../../../src/shared/transport/command-budget';
import type { GameCommand, MutationResponse } from '../../../src/shared/transport/game-command';
import { SimulationEngine } from '../../../src/simulation/core/simulation-engine';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../../src/simulation/map/world-map-state';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import {
  createCityWorldState,
  createStarterCityWorld,
  type CityWorldState,
} from '../../../src/simulation/world/city-world-state';
import {
  MAX_ZONE_CELLS_PER_COMMAND,
  ZoningValidationError,
  setZoneCellsHandler,
  type SetZoneCellsDelta,
  type SetZoneCellsPayload,
} from '../../../src/simulation/zoning/set-zone-command';
import { ZoneCode } from '../../../src/simulation/zoning/zoning-state';

function createEngine(world = createStarterCityWorld('zone-command')) {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed: 'zone-command-engine',
    handlers: [setZoneCellsHandler],
  });
}

function zoneCommand(
  commandId: string,
  baseRevision: number,
  zone: SetZoneCellsPayload['zone'],
  cells: SetZoneCellsPayload['cells'],
): GameCommand<'SET_ZONE_CELLS', SetZoneCellsPayload> {
  return {
    commandId,
    baseRevision,
    type: 'SET_ZONE_CELLS',
    payload: { zone, cells },
  };
}

function findWaterCell(world: CityWorldState): Readonly<{ x: number; y: number }> {
  for (let y = 0; y < world.map.dimensions.height; y += 1) {
    for (let x = 0; x < world.map.dimensions.width; x += 1) {
      if (world.map.terrain.get(x, y) === TerrainCode.WATER) {
        return { x, y };
      }
    }
  }

  throw new Error('Fixture world did not contain water');
}

function createAllLandWorld(width: number, height: number): CityWorldState {
  const dimensions = createGridDimensions(width, height);
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: 'all-land-zone-command',
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };

  return createCityWorldState(
    map,
    createRoadNetworkState({
      topologyVersion: 0,
      nextNodeId: 1,
      nextEdgeId: 1,
      nodes: [],
      edges: [],
    }),
  );
}

describe('SET_ZONE_CELLS command', () => {
  it.each([
    ['residential', ZoneCode.RESIDENTIAL],
    ['commercial', ZoneCode.COMMERCIAL],
    ['industrial', ZoneCode.INDUSTRIAL],
  ] as const)('sets %s zoning without requiring road access', (_label, zone) => {
    const engine = createEngine();

    const response = engine.dispatch(
      zoneCommand('zone-1', 0, zone, [{ x: 0, y: 0 }]),
    ) as MutationResponse<SetZoneCellsDelta>;

    expect(response).toEqual({
      commandId: 'zone-1',
      revision: 1,
      delta: {
        zoningVersion: 1,
        changedCellCount: 1,
      },
      events: [],
    });
    expect(engine.state.world.zoning.grid.get(0, 0)).toBe(zone);
    expect(engine.state.world.zoning.version).toBe(1);
    expect(engine.state.world.roads.nodes).toHaveLength(0);
  });

  it('preserves map and road identity when zoning changes', () => {
    const engine = createEngine();
    const map = engine.state.world.map;
    const roads = engine.state.world.roads;

    engine.dispatch(zoneCommand('zone-identity', 0, ZoneCode.RESIDENTIAL, [{ x: 0, y: 0 }]));

    expect(engine.state.world.map).toBe(map);
    expect(engine.state.world.roads).toBe(roads);
  });

  it('clears an existing zone back to NONE', () => {
    const engine = createEngine();

    engine.dispatch(zoneCommand('zone-set', 0, ZoneCode.INDUSTRIAL, [{ x: 0, y: 0 }]));
    engine.dispatch(zoneCommand('zone-clear', 1, ZoneCode.NONE, [{ x: 0, y: 0 }]));

    expect(engine.state.world.zoning.grid.get(0, 0)).toBe(ZoneCode.NONE);
    expect(engine.state.world.zoning.version).toBe(2);
  });

  it('allows NONE on a water cell as a valid no-op', () => {
    const engine = createEngine();
    const water = findWaterCell(engine.state.world);
    const zoningBefore = engine.state.world.zoning;

    const response = engine.dispatch(
      zoneCommand('zone-water-clear', 0, ZoneCode.NONE, [water]),
    ) as MutationResponse<SetZoneCellsDelta>;

    expect(response.delta).toEqual({
      zoningVersion: 0,
      changedCellCount: 0,
    });
    expect(engine.state.world.zoning).toBe(zoningBefore);
    expect(engine.state.revision).toBe(1);
  });

  it('rejects non-NONE zoning on water before state commit', () => {
    const engine = createEngine();
    const water = findWaterCell(engine.state.world);
    const before = engine.state;

    expect(() =>
      engine.dispatch(zoneCommand('zone-water', 0, ZoneCode.RESIDENTIAL, [{ x: 0, y: 0 }, water])),
    ).toThrow(ZoningValidationError);

    expect(engine.state).toEqual(before);
    expect(engine.recentCommandCount).toBe(0);
  });

  it('rejects non-NONE zoning on a road cell', () => {
    const map = createStarterCityWorld('zone-road').map;
    const roads = createRoadNetworkState({
      topologyVersion: 1,
      nextNodeId: 3,
      nextEdgeId: 2,
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
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
      ],
    });
    const engine = createEngine(createCityWorldState(map, roads));
    const before = engine.state;

    expect(() =>
      engine.dispatch(zoneCommand('zone-road-cell', 0, ZoneCode.COMMERCIAL, [{ x: 0, y: 0 }])),
    ).toThrow(ZoningValidationError);

    expect(engine.state).toEqual(before);
  });

  it('rejects empty, oversized, repeated, invalid, and out-of-bounds cell selections', () => {
    const engine = createEngine(createAllLandWorld(512, 16));
    const tooMany = Array.from({ length: MAX_ZONE_CELLS_PER_COMMAND + 1 }, (_, x) => ({ x, y: 0 }));

    expect(() => engine.dispatch(zoneCommand('zone-empty', 0, ZoneCode.RESIDENTIAL, []))).toThrow(
      ZoningValidationError,
    );
    expect(() =>
      engine.dispatch(zoneCommand('zone-large', 0, ZoneCode.RESIDENTIAL, tooMany)),
    ).toThrow(ZoningValidationError);
    expect(() =>
      engine.dispatch(
        zoneCommand('zone-repeat', 0, ZoneCode.RESIDENTIAL, [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ]),
      ),
    ).toThrow(ZoningValidationError);
    expect(() =>
      engine.dispatch(
        zoneCommand('zone-invalid-coordinate', 0, ZoneCode.RESIDENTIAL, [{ x: 1.5, y: 0 }]),
      ),
    ).toThrow(ZoningValidationError);
    expect(() =>
      engine.dispatch(
        zoneCommand('zone-out-of-bounds', 0, ZoneCode.RESIDENTIAL, [{ x: 512, y: 0 }]),
      ),
    ).toThrow(ZoningValidationError);

    expect(engine.state.revision).toBe(0);
    expect(engine.recentCommandCount).toBe(0);
  });

  it('rejects an unknown zone code before mutation', () => {
    const engine = createEngine();
    const before = engine.state;
    const invalid = zoneCommand('zone-invalid-code', 0, 4 as SetZoneCellsPayload['zone'], [
      { x: 0, y: 0 },
    ]);

    expect(() => engine.dispatch(invalid)).toThrow(ZoningValidationError);
    expect(engine.state).toEqual(before);
  });

  it('keeps zoning version and object identity for an all-existing no-op', () => {
    const engine = createEngine();
    const cells = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ] as const;

    engine.dispatch(zoneCommand('zone-first', 0, ZoneCode.RESIDENTIAL, cells));
    const zoning = engine.state.world.zoning;

    const response = engine.dispatch(
      zoneCommand('zone-noop', 1, ZoneCode.RESIDENTIAL, cells),
    ) as MutationResponse<SetZoneCellsDelta>;

    expect(response).toEqual({
      commandId: 'zone-noop',
      revision: 2,
      delta: {
        zoningVersion: 1,
        changedCellCount: 0,
      },
      events: [],
    });
    expect(engine.state.world.zoning).toBe(zoning);
    expect(engine.state.world.zoning.version).toBe(1);
  });

  it('replays a duplicate command id without reapplying zoning', () => {
    const engine = createEngine();
    const command = zoneCommand('zone-duplicate', 0, ZoneCode.RESIDENTIAL, [{ x: 0, y: 0 }]);

    const first = engine.dispatch(command);
    const duplicate = engine.dispatch(command);

    expect(duplicate).toEqual(first);
    expect(engine.state.revision).toBe(1);
    expect(engine.state.world.zoning.version).toBe(1);
  });

  it('returns a revision conflict without zoning mutation', () => {
    const engine = createEngine();
    const before = engine.state;

    expect(
      engine.dispatch(zoneCommand('zone-stale', 99, ZoneCode.RESIDENTIAL, [{ x: 0, y: 0 }])),
    ).toEqual({
      kind: 'REVISION_CONFLICT',
      expectedRevision: 99,
      actualRevision: 0,
    });
    expect(engine.state).toEqual(before);
  });

  it('keeps the maximum 256-cell response below the ordinary response budget', () => {
    const engine = createEngine(createAllLandWorld(256, 16));
    const cells = Array.from({ length: MAX_ZONE_CELLS_PER_COMMAND }, (_, x) => ({ x, y: 0 }));

    const response = engine.dispatch(
      zoneCommand('zone-256', 0, ZoneCode.INDUSTRIAL, cells),
    ) as MutationResponse<SetZoneCellsDelta>;

    expect(response.delta.changedCellCount).toBe(MAX_ZONE_CELLS_PER_COMMAND);
    expect(measureJsonBytes(response)).toBeLessThan(ORDINARY_RESPONSE_TARGET_BYTES);
  });
});
