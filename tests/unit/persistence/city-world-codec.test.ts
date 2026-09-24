import { describe, expect, it } from 'vitest';
import {
  CITY_WORLD_CODEC_VERSION,
  cityWorldSaveCodec,
  decodeCityWorldState,
  encodeCityWorldState,
  type EncodedCityWorldState,
} from '../../../src/persistence/codec/city-world-codec';
import { worldMapSaveCodec } from '../../../src/persistence/codec/world-map-codec';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import { createStarterWorldMap } from '../../../src/simulation/map/starter-map-generator';
import { TerrainCode, type WorldMapState } from '../../../src/simulation/map/world-map-state';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import {
  createCityWorldState,
  createStarterCityWorld,
} from '../../../src/simulation/world/city-world-state';
import {
  ZoneCode,
  createEmptyZoning,
  createZoningState,
} from '../../../src/simulation/zoning/zoning-state';

function createRoadFixture() {
  return createRoadNetworkState({
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
}

function findWaterCell(map: WorldMapState): Readonly<{ x: number; y: number }> {
  for (let y = 0; y < map.dimensions.height; y += 1) {
    for (let x = 0; x < map.dimensions.width; x += 1) {
      if (map.terrain.get(x, y) === TerrainCode.WATER) {
        return { x, y };
      }
    }
  }

  throw new Error('Fixture map did not contain water');
}

function findLandCell(
  map: WorldMapState,
  excluded: ReadonlySet<string> = new Set(),
): Readonly<{ x: number; y: number }> {
  for (let y = 0; y < map.dimensions.height; y += 1) {
    for (let x = 0; x < map.dimensions.width; x += 1) {
      if (map.terrain.get(x, y) === TerrainCode.LAND && !excluded.has(`${x},${y}`)) {
        return { x, y };
      }
    }
  }

  throw new Error('Fixture map did not contain an available land cell');
}

describe('city world codec', () => {
  it('creates a deterministic starter city with empty roads and zoning', () => {
    const city = createStarterCityWorld('city-world-seed');

    expect(city.roads).toEqual({
      topologyVersion: 0,
      nextNodeId: 1,
      nextEdgeId: 1,
      nodes: [],
      edges: [],
    });
    expect(city.zoning.version).toBe(0);
    expect(city.zoning.grid.dimensions).toEqual(city.map.dimensions);
    expect(city.zoning.grid.get(0, 0)).toBe(ZoneCode.NONE);
    expect(city.map.mapSeed).toBe('city-world-seed');
  });

  it('rejects a road node outside map bounds', () => {
    const map = createStarterWorldMap('out-of-bounds');
    const roads = createRoadNetworkState({
      topologyVersion: 0,
      nextNodeId: 2,
      nextEdgeId: 1,
      nodes: [{ id: 1, x: map.dimensions.width, y: 0 }],
      edges: [],
    });

    expect(() => createCityWorldState(map, roads)).toThrow(/grid coordinate/i);
  });

  it('rejects a road node placed on water', () => {
    const map = createStarterWorldMap('water-road');
    const water = findWaterCell(map);
    const roads = createRoadNetworkState({
      topologyVersion: 0,
      nextNodeId: 2,
      nextEdgeId: 1,
      nodes: [{ id: 1, x: water.x, y: water.y }],
      edges: [],
    });

    expect(() => createCityWorldState(map, roads)).toThrow(/road node.*land/i);
  });

  it('rejects zoning dimensions that do not match the map', () => {
    const map = createStarterWorldMap('zoning-dimensions');
    const zoning = createEmptyZoning(createGridDimensions(16, 16));

    expect(() => createCityWorldState(map, createRoadNetworkState({
      topologyVersion: 0,
      nextNodeId: 1,
      nextEdgeId: 1,
      nodes: [],
      edges: [],
    }), zoning)).toThrow(/zoning dimensions.*map/i);
  });

  it('rejects non-empty zoning placed on water', () => {
    const map = createStarterWorldMap('zoning-water');
    const water = findWaterCell(map);
    const zoning = createZoningState(
      1,
      ChunkedByteGrid.filled(map.dimensions, ZoneCode.NONE).withCell(
        water.x,
        water.y,
        ZoneCode.RESIDENTIAL,
      ),
    );

    expect(() =>
      createCityWorldState(
        map,
        createRoadNetworkState({
          topologyVersion: 0,
          nextNodeId: 1,
          nextEdgeId: 1,
          nodes: [],
          edges: [],
        }),
        zoning,
      ),
    ).toThrow(/zone.*land/i);
  });

  it('rejects non-empty zoning on a road cell', () => {
    const map = createStarterWorldMap('zoning-road-conflict');
    const roads = createRoadFixture();
    const zoning = createZoningState(
      1,
      ChunkedByteGrid.filled(map.dimensions, ZoneCode.NONE).withCell(
        0,
        0,
        ZoneCode.COMMERCIAL,
      ),
    );

    expect(() => createCityWorldState(map, roads, zoning)).toThrow(/zone.*road/i);
  });

  it('round-trips map terrain, road tuples, and zoning bytes', () => {
    const map = createStarterWorldMap('round-trip');
    const roads = createRoadFixture();
    const land = findLandCell(map, new Set(['0,0', '1,0']));
    const zoning = createZoningState(
      3,
      ChunkedByteGrid.filled(map.dimensions, ZoneCode.NONE).withCell(
        land.x,
        land.y,
        ZoneCode.INDUSTRIAL,
      ),
    );
    const city = createCityWorldState(map, roads, zoning);

    const encoded = encodeCityWorldState(city);
    const restored = decodeCityWorldState(encoded);

    expect(encoded.codecVersion).toBe(CITY_WORLD_CODEC_VERSION);
    expect(restored.roads).toEqual(city.roads);
    expect(restored.zoning.version).toBe(3);
    expect(restored.zoning.grid.copyChunks().map((chunk) => Array.from(chunk))).toEqual(
      city.zoning.grid.copyChunks().map((chunk) => Array.from(chunk)),
    );
    expect(restored.map.dimensions).toEqual(city.map.dimensions);
    expect(restored.map.terrain.copyChunks().map((chunk) => Array.from(chunk))).toEqual(
      city.map.terrain.copyChunks().map((chunk) => Array.from(chunk)),
    );
  });

  it('rejects an unsupported city world codec version', () => {
    const encoded = encodeCityWorldState(createStarterCityWorld('city-codec-version'));

    expect(() =>
      decodeCityWorldState({
        ...encoded,
        codecVersion: CITY_WORLD_CODEC_VERSION + 1,
      } as unknown as EncodedCityWorldState),
    ).toThrow(/city world codec version/i);
  });

  it('rejects malformed encoded city roads outside the map', () => {
    const city = createCityWorldState(createStarterWorldMap('encoded-bounds'), createRoadFixture());
    const encoded = encodeCityWorldState(city);
    const invalid = {
      ...encoded,
      roads: {
        ...encoded.roads,
        nodes: [[1, encoded.map.terrain.width, 0] as const],
        edges: [],
        nextNodeId: 2,
        nextEdgeId: 1,
      },
    };

    expect(() => decodeCityWorldState(invalid)).toThrow(/grid coordinate/i);
  });

  it('rejects malformed encoded city roads on water', () => {
    const map = createStarterWorldMap('encoded-water');
    const water = findWaterCell(map);
    const city = createCityWorldState(map, createRoadFixture());
    const encoded = encodeCityWorldState(city);
    const invalid = {
      ...encoded,
      roads: {
        ...encoded.roads,
        nodes: [[1, water.x, water.y] as const],
        edges: [],
        nextNodeId: 2,
        nextEdgeId: 1,
      },
    };

    expect(() => decodeCityWorldState(invalid)).toThrow(/road node.*land/i);
  });

  it('keeps the map-only codec backward-compatible', () => {
    const map = createStarterWorldMap('map-only');
    const restored = worldMapSaveCodec.decode(worldMapSaveCodec.encode(map));

    expect(restored.mapSeed).toBe(map.mapSeed);
    expect(restored.dimensions).toEqual(map.dimensions);
  });

  it('encodes a JSON-safe world without runtime grids, lookup objects, or command history', () => {
    const city = createCityWorldState(createStarterWorldMap('json-safe'), createRoadFixture());
    const encoded = cityWorldSaveCodec.encode(city);
    const serialized = JSON.stringify(encoded);

    expect(serialized).not.toContain('Uint8Array');
    expect(serialized).not.toContain('commandId');
    expect(serialized).not.toContain('RoadAccessIndex');
    expect(encoded.map.terrain.chunks.every((chunk) => typeof chunk === 'string')).toBe(true);
    expect(encoded.zoning.grid.chunks.every((chunk) => typeof chunk === 'string')).toBe(true);
    expect(encoded.roads.nodes).toEqual([
      [1, 0, 0],
      [2, 1, 0],
    ]);
  });
});
