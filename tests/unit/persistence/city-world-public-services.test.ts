import { describe, expect, it } from 'vitest';
import {
  CITY_WORLD_CODEC_VERSION,
  decodeCityWorldState,
  encodeCityWorldState,
} from '../../../src/persistence/codec/city-world-codec';
import { createBuildingState } from '../../../src/simulation/buildings/building-state';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../../src/simulation/map/world-map-state';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import { createPublicServiceState } from '../../../src/simulation/services/public-service-state';
import {
  createCityWorldState,
  createStarterCityWorld,
} from '../../../src/simulation/world/city-world-state';
import { ZoneCode, createZoningState } from '../../../src/simulation/zoning/zoning-state';

function createLandMap(): WorldMapState {
  const dimensions = createGridDimensions(16, 16);
  return {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: 'public-service-city-world',
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
}

function createRoads() {
  return createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId: 4,
    nextEdgeId: 3,
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 2, y: 0 },
    ],
    edges: [
      { id: 1, nodeA: 1, nodeB: 2, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
      { id: 2, nodeA: 2, nodeB: 3, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
    ],
  });
}

describe('CityWorld public services', () => {
  it('creates starter cities with empty public services', () => {
    expect(createStarterCityWorld('public-services-starter').publicServices).toEqual({
      version: 0,
      nextServiceId: 1,
      services: [],
    });
  });

  it('accepts and round-trips a valid road-accessible public service', () => {
    const services = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 0, y: 1, kind: 'fire' }],
    });
    const city = createCityWorldState(
      createLandMap(),
      createRoads(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      services,
    );

    const encoded = encodeCityWorldState(city);
    const restored = decodeCityWorldState(encoded);

    expect(encoded.codecVersion).toBe(CITY_WORLD_CODEC_VERSION);
    expect(encoded.publicServices).toEqual({
      codecVersion: 1,
      meta: [1, 2],
      services: [[1, 0, 1, 3]],
    });
    expect(restored.publicServices).toEqual(services);
  });

  it('rejects a public service outside map bounds', () => {
    const services = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 16, y: 0, kind: 'park' }],
    });

    expect(() =>
      createCityWorldState(
        createLandMap(),
        createRoads(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        services,
      ),
    ).toThrow(/grid coordinate/i);
  });

  it('rejects a public service on water, zoning, road, or building cells', () => {
    const map = createLandMap();
    const waterMap: WorldMapState = {
      ...map,
      terrain: map.terrain.withCell(0, 1, TerrainCode.WATER),
    };
    const serviceAt01 = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 0, y: 1, kind: 'hospital' }],
    });

    expect(() =>
      createCityWorldState(
        waterMap,
        createRoads(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        serviceAt01,
      ),
    ).toThrow(/service.*land/i);

    const zoning = createZoningState(
      1,
      ChunkedByteGrid.filled(map.dimensions, ZoneCode.NONE).withCell(0, 1, ZoneCode.RESIDENTIAL),
    );
    expect(() =>
      createCityWorldState(
        map,
        createRoads(),
        zoning,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        serviceAt01,
      ),
    ).toThrow(/service.*zone/i);

    const serviceOnRoad = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 0, y: 0, kind: 'police' }],
    });
    expect(() =>
      createCityWorldState(
        map,
        createRoads(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        serviceOnRoad,
      ),
    ).toThrow(/service.*road/i);

    const buildings = createBuildingState({
      version: 1,
      nextBuildingId: 2,
      buildings: [{ id: 1, x: 0, y: 1, use: 'residential', level: 1 }],
    });
    expect(() =>
      createCityWorldState(
        map,
        createRoads(),
        undefined,
        buildings,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        serviceAt01,
      ),
    ).toThrow(/service.*building/i);
  });

  it('rejects a service without orthogonally adjacent road access', () => {
    const services = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 10, y: 10, kind: 'school' }],
    });

    expect(() =>
      createCityWorldState(
        createLandMap(),
        createRoads(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        services,
      ),
    ).toThrow(/service.*road access/i);
  });

  it('does not serialize coverage indexes or distances', () => {
    const services = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 0, y: 1, kind: 'park' }],
    });
    const encoded = encodeCityWorldState(
      createCityWorldState(
        createLandMap(),
        createRoads(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        services,
      ),
    );
    const serialized = JSON.stringify(encoded);

    expect(serialized).not.toContain('coverageIndex');
    expect(serialized).not.toContain('distanceByNode');
    expect(serialized).not.toContain('routeCache');
  });
});
