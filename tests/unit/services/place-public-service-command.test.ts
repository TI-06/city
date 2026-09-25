import { describe, expect, it } from 'vitest';
import { measureJsonBytes } from '../../../src/shared/serialization/measure-json-bytes';
import { ORDINARY_RESPONSE_TARGET_BYTES } from '../../../src/shared/transport/command-budget';
import type { GameCommand, MutationResponse } from '../../../src/shared/transport/game-command';
import { createBuildingState } from '../../../src/simulation/buildings/building-state';
import { SimulationEngine } from '../../../src/simulation/core/simulation-engine';
import { createEconomyState } from '../../../src/simulation/economy/economy-state';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../../src/simulation/map/world-map-state';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import {
  getPublicServicePlacementCost,
} from '../../../src/simulation/services/public-service-catalog';
import {
  placePublicServiceHandler,
  type PlacePublicServiceDelta,
  type PlacePublicServicePayload,
} from '../../../src/simulation/services/place-public-service-command';
import { createPublicServiceState } from '../../../src/simulation/services/public-service-state';
import {
  createCityWorldState,
  type CityWorldState,
} from '../../../src/simulation/world/city-world-state';
import {
  ZoneCode,
  createZoningState,
} from '../../../src/simulation/zoning/zoning-state';

function createLandMap(): WorldMapState {
  const dimensions = createGridDimensions(16, 16);
  return {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: 'place-public-service',
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
}

function createRoads() {
  return createRoadNetworkState({
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
}

function createWorld(): CityWorldState {
  return createCityWorldState(createLandMap(), createRoads());
}

function createEngine(world = createWorld()) {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed: 'place-public-service-engine',
    handlers: [placePublicServiceHandler],
  });
}

function serviceCommand(
  commandId: string,
  baseRevision: number,
  payload: PlacePublicServicePayload,
): GameCommand<'PLACE_PUBLIC_SERVICE', PlacePublicServicePayload> {
  return {
    commandId,
    baseRevision,
    type: 'PLACE_PUBLIC_SERVICE',
    payload,
  };
}

describe('PLACE_PUBLIC_SERVICE command', () => {
  it.each(['park', 'school', 'fire', 'police', 'hospital'] as const)(
    'places %s atomically and charges its catalog cost',
    (kind) => {
      const engine = createEngine();
      const placementCost = getPublicServicePlacementCost(kind);

      const response = engine.dispatch(
        serviceCommand(`service-${kind}`, 0, { kind, x: 0, y: 1 }),
      ) as MutationResponse<PlacePublicServiceDelta>;

      expect(response).toEqual({
        commandId: `service-${kind}`,
        revision: 1,
        delta: {
          serviceId: 1,
          kind,
          placementCost,
        },
        events: [],
      });
      expect(engine.state.world.publicServices).toEqual({
        version: 1,
        nextServiceId: 2,
        services: [{ id: 1, x: 0, y: 1, kind }],
      });
      expect(engine.state.world.economy.treasury).toBe(1_000_000 - placementCost);
      expect(engine.state.world.economy.version).toBe(1);
    },
  );

  it('replays a duplicate command without placing or charging twice', () => {
    const engine = createEngine();
    const command = serviceCommand('service-duplicate', 0, {
      kind: 'fire',
      x: 0,
      y: 1,
    });

    const first = engine.dispatch(command);
    const duplicate = engine.dispatch(command);

    expect(duplicate).toEqual(first);
    expect(engine.state.world.publicServices.services).toHaveLength(1);
    expect(engine.state.world.economy.treasury).toBe(
      1_000_000 - getPublicServicePlacementCost('fire'),
    );
    expect(engine.state.revision).toBe(1);
  });

  it('returns a revision conflict without charging or placing', () => {
    const engine = createEngine();
    const before = engine.state;

    expect(
      engine.dispatch(
        serviceCommand('service-stale', 99, {
          kind: 'park',
          x: 0,
          y: 1,
        }),
      ),
    ).toEqual({
      kind: 'REVISION_CONFLICT',
      expectedRevision: 99,
      actualRevision: 0,
    });

    expect(engine.state).toEqual(before);
  });

  it('rejects insufficient funds before authoritative mutation/cache', () => {
    const base = createWorld();
    const economy = createEconomyState({
      version: 0,
      treasury: getPublicServicePlacementCost('hospital') - 1,
    });
    const engine = createEngine(
      createCityWorldState(
        base.map,
        base.roads,
        base.zoning,
        base.buildings,
        base.developmentDemand,
        base.households,
        base.companies,
        economy,
        base.traffic,
        base.publicServices,
      ),
    );
    const before = engine.state;

    expect(() =>
      engine.dispatch(
        serviceCommand('service-no-money', 0, {
          kind: 'hospital',
          x: 0,
          y: 1,
        }),
      ),
    ).toThrow(/insufficient.*fund/i);

    expect(engine.state).toEqual(before);
    expect(engine.recentCommandCount).toBe(0);
  });

  it('rejects water, zoning, road, building, existing service, and no-road-access cells', () => {
    const base = createWorld();

    const waterWorld = createCityWorldState(
      {
        ...base.map,
        terrain: base.map.terrain.withCell(0, 1, TerrainCode.WATER),
      },
      base.roads,
    );
    expect(() =>
      createEngine(waterWorld).dispatch(
        serviceCommand('service-water', 0, { kind: 'park', x: 0, y: 1 }),
      ),
    ).toThrow(/land/i);

    const zoning = createZoningState(
      1,
      base.zoning.grid.withCell(0, 1, ZoneCode.RESIDENTIAL),
    );
    expect(() =>
      createEngine(createCityWorldState(base.map, base.roads, zoning)).dispatch(
        serviceCommand('service-zone', 0, { kind: 'school', x: 0, y: 1 }),
      ),
    ).toThrow(/zone/i);

    expect(() =>
      createEngine().dispatch(
        serviceCommand('service-road', 0, { kind: 'fire', x: 0, y: 0 }),
      ),
    ).toThrow(/road/i);

    const buildings = createBuildingState({
      version: 1,
      nextBuildingId: 2,
      buildings: [{ id: 1, x: 0, y: 1, use: 'residential', level: 1 }],
    });
    expect(() =>
      createEngine(
        createCityWorldState(base.map, base.roads, undefined, buildings),
      ).dispatch(
        serviceCommand('service-building', 0, { kind: 'police', x: 0, y: 1 }),
      ),
    ).toThrow(/building/i);

    const existingServices = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 0, y: 1, kind: 'park' }],
    });
    expect(() =>
      createEngine(
        createCityWorldState(
          base.map,
          base.roads,
          base.zoning,
          base.buildings,
          base.developmentDemand,
          base.households,
          base.companies,
          base.economy,
          base.traffic,
          existingServices,
        ),
      ).dispatch(
        serviceCommand('service-existing', 0, { kind: 'hospital', x: 0, y: 1 }),
      ),
    ).toThrow(/service/i);

    expect(() =>
      createEngine().dispatch(
        serviceCommand('service-no-road', 0, { kind: 'hospital', x: 10, y: 10 }),
      ),
    ).toThrow(/road access/i);
  });

  it('rejects invalid coordinates, out-of-bounds coordinates, and unknown kinds', () => {
    const engine = createEngine();
    const before = engine.state;

    expect(() =>
      engine.dispatch(
        serviceCommand('service-fractional', 0, {
          kind: 'park',
          x: 0.5,
          y: 1,
        }),
      ),
    ).toThrow(/coordinate/i);

    expect(() =>
      engine.dispatch(
        serviceCommand('service-bounds', 0, {
          kind: 'park',
          x: 16,
          y: 1,
        }),
      ),
    ).toThrow(/bounds|coordinate/i);

    expect(() =>
      engine.dispatch(
        serviceCommand('service-kind', 0, {
          kind: 'clinic' as PlacePublicServicePayload['kind'],
          x: 0,
          y: 1,
        }),
      ),
    ).toThrow(/kind/i);

    expect(engine.state).toEqual(before);
    expect(engine.recentCommandCount).toBe(0);
  });

  it('keeps the mutation response below the ordinary response budget', () => {
    const response = createEngine().dispatch(
      serviceCommand('service-budget', 0, {
        kind: 'hospital',
        x: 0,
        y: 1,
      }),
    );

    expect(measureJsonBytes(response)).toBeLessThan(ORDINARY_RESPONSE_TARGET_BYTES);
  });
});
