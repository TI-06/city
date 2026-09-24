import { describe, expect, it } from 'vitest';
import {
  cityWorldSaveCodec,
  decodeCityWorldState,
  encodeCityWorldState,
} from '../../../src/persistence/codec/city-world-codec';
import { worldMapSaveCodec } from '../../../src/persistence/codec/world-map-codec';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import {
  createCityWorldState,
  createStarterCityWorld,
} from '../../../src/simulation/world/city-world-state';
import { createStarterWorldMap } from '../../../src/simulation/map/starter-map-generator';
import { TerrainCode, type WorldMapState } from '../../../src/simulation/map/world-map-state';

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

describe('city world codec', () => {
  it('creates a deterministic starter city with an empty road network', () => {
    const city = createStarterCityWorld('city-world-seed');

    expect(city.roads).toEqual({
      topologyVersion: 0,
      nextNodeId: 1,
      nextEdgeId: 1,
      nodes: [],
      edges: [],
    });
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

  it('round-trips map terrain and road tuples', () => {
    const map = createStarterWorldMap('round-trip');
    const city = createCityWorldState(map, createRoadFixture());

    const encoded = encodeCityWorldState(city);
    const restored = decodeCityWorldState(encoded);

    expect(restored.roads).toEqual(city.roads);
    expect(restored.map.dimensions).toEqual(city.map.dimensions);
    expect(restored.map.terrain.copyChunks().map((chunk) => Array.from(chunk))).toEqual(
      city.map.terrain.copyChunks().map((chunk) => Array.from(chunk)),
    );
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

  it('encodes a JSON-safe world without runtime grid or lookup objects', () => {
    const city = createCityWorldState(createStarterWorldMap('json-safe'), createRoadFixture());
    const encoded = cityWorldSaveCodec.encode(city);
    const serialized = JSON.stringify(encoded);

    expect(serialized).not.toContain('Uint8Array');
    expect(serialized).not.toContain('commandId');
    expect(encoded.map.terrain.chunks.every((chunk) => typeof chunk === 'string')).toBe(true);
    expect(encoded.roads.nodes).toEqual([
      [1, 0, 0],
      [2, 1, 0],
    ]);
  });
});
