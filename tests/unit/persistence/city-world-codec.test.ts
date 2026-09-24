import { describe, expect, it } from 'vitest';
import {
  CITY_WORLD_CODEC_VERSION,
  cityWorldSaveCodec,
  decodeCityWorldState,
  encodeCityWorldState,
  type EncodedCityWorldState,
} from '../../../src/persistence/codec/city-world-codec';
import { worldMapSaveCodec } from '../../../src/persistence/codec/world-map-codec';
import { createBuildingState } from '../../../src/simulation/buildings/building-state';
import { createDevelopmentDemandState } from '../../../src/simulation/development/development-demand-state';
import { createCompanyState } from '../../../src/simulation/economy/company-state';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import { createStarterWorldMap } from '../../../src/simulation/map/starter-map-generator';
import { TerrainCode, type WorldMapState } from '../../../src/simulation/map/world-map-state';
import { createHouseholdState } from '../../../src/simulation/population/household-state';
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
  it('creates a deterministic starter city with empty roads, zoning, buildings, and demand', () => {
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
    expect(city.buildings).toEqual({
      version: 0,
      nextBuildingId: 1,
      buildings: [],
    });
    expect(city.developmentDemand).toEqual({
      version: 0,
      residential: 60,
      commercial: 60,
      industrial: 60,
    });
    expect(city.households).toEqual({
      version: 0,
      nextHouseholdId: 1,
      households: [],
    });
    expect(city.companies).toEqual({
      version: 0,
      nextCompanyId: 1,
      companies: [],
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

  it('rejects zoning dimensions that do not match the map', () => {
    const map = createStarterWorldMap('zoning-dimensions');
    const zoning = createEmptyZoning(createGridDimensions(16, 16));

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
    ).toThrow(/zoning dimensions.*map/i);
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
      ChunkedByteGrid.filled(map.dimensions, ZoneCode.NONE).withCell(0, 0, ZoneCode.COMMERCIAL),
    );

    expect(() => createCityWorldState(map, roads, zoning)).toThrow(/zone.*road/i);
  });

  it('rejects a building outside map bounds', () => {
    const map = createStarterWorldMap('building-bounds');
    const buildings = createBuildingState({
      version: 1,
      nextBuildingId: 2,
      buildings: [
        {
          id: 1,
          x: map.dimensions.width,
          y: 0,
          use: 'residential',
          level: 1,
        },
      ],
    });

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
        undefined,
        buildings,
      ),
    ).toThrow(/grid coordinate/i);
  });

  it('rejects a building placed on water', () => {
    const map = createStarterWorldMap('building-water');
    const water = findWaterCell(map);
    const buildings = createBuildingState({
      version: 1,
      nextBuildingId: 2,
      buildings: [
        {
          id: 1,
          x: water.x,
          y: water.y,
          use: 'commercial',
          level: 1,
        },
      ],
    });

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
        undefined,
        buildings,
      ),
    ).toThrow(/building.*land/i);
  });

  it('rejects a building that overlaps a road', () => {
    const map = createStarterWorldMap('building-road');
    const buildings = createBuildingState({
      version: 1,
      nextBuildingId: 2,
      buildings: [
        {
          id: 1,
          x: 0,
          y: 0,
          use: 'industrial',
          level: 1,
        },
      ],
    });

    expect(() => createCityWorldState(map, createRoadFixture(), undefined, buildings)).toThrow(
      /building.*road/i,
    );
  });

  it('allows an existing building to survive zoning changes or zone clearing', () => {
    const map = createStarterWorldMap('building-rezone');
    const cell = findLandCell(map);
    const buildings = createBuildingState({
      version: 1,
      nextBuildingId: 2,
      buildings: [
        {
          id: 1,
          x: cell.x,
          y: cell.y,
          use: 'residential',
          level: 1,
        },
      ],
    });
    const zoning = createZoningState(
      2,
      ChunkedByteGrid.filled(map.dimensions, ZoneCode.NONE).withCell(
        cell.x,
        cell.y,
        ZoneCode.INDUSTRIAL,
      ),
    );

    const city = createCityWorldState(
      map,
      createRoadNetworkState({
        topologyVersion: 0,
        nextNodeId: 1,
        nextEdgeId: 1,
        nodes: [],
        edges: [],
      }),
      zoning,
      buildings,
    );

    expect(city.buildings.buildings[0]?.use).toBe('residential');
    expect(city.zoning.grid.get(cell.x, cell.y)).toBe(ZoneCode.INDUSTRIAL);
  });

  it('accepts valid household and company building references', () => {
    const map = createStarterWorldMap('population-valid');
    const buildings = createBuildingState({
      version: 3,
      nextBuildingId: 4,
      buildings: [
        { id: 1, x: 2, y: 0, use: 'residential', level: 1 },
        { id: 2, x: 3, y: 0, use: 'commercial', level: 1 },
        { id: 3, x: 4, y: 0, use: 'industrial', level: 1 },
      ],
    });
    const households = createHouseholdState({
      version: 1,
      nextHouseholdId: 2,
      households: [{ id: 1, homeBuildingId: 1, memberCount: 3, workerCount: 2 }],
    });
    const companies = createCompanyState({
      version: 2,
      nextCompanyId: 3,
      companies: [
        { id: 1, buildingId: 2, kind: 'commercial', jobCapacity: 8 },
        { id: 2, buildingId: 3, kind: 'industrial', jobCapacity: 12 },
      ],
    });

    const city = createCityWorldState(
      map,
      createRoadFixture(),
      undefined,
      buildings,
      undefined,
      households,
      companies,
    );

    expect(city.households).toEqual(households);
    expect(city.companies).toEqual(companies);
  });

  it('rejects dangling or wrong-use household building references', () => {
    const map = createStarterWorldMap('population-household-invalid');
    const buildings = createBuildingState({
      version: 2,
      nextBuildingId: 3,
      buildings: [
        { id: 1, x: 2, y: 0, use: 'residential', level: 1 },
        { id: 2, x: 3, y: 0, use: 'commercial', level: 1 },
      ],
    });
    const dangling = createHouseholdState({
      version: 1,
      nextHouseholdId: 2,
      households: [{ id: 1, homeBuildingId: 99, memberCount: 2, workerCount: 1 }],
    });
    const wrongUse = createHouseholdState({
      version: 1,
      nextHouseholdId: 2,
      households: [{ id: 1, homeBuildingId: 2, memberCount: 2, workerCount: 1 }],
    });

    expect(() =>
      createCityWorldState(map, createRoadFixture(), undefined, buildings, undefined, dangling),
    ).toThrow(/household.*building/i);
    expect(() =>
      createCityWorldState(map, createRoadFixture(), undefined, buildings, undefined, wrongUse),
    ).toThrow(/household.*residential/i);
  });

  it('rejects dangling, residential, or kind-mismatched company references', () => {
    const map = createStarterWorldMap('population-company-invalid');
    const buildings = createBuildingState({
      version: 3,
      nextBuildingId: 4,
      buildings: [
        { id: 1, x: 2, y: 0, use: 'residential', level: 1 },
        { id: 2, x: 3, y: 0, use: 'commercial', level: 1 },
        { id: 3, x: 4, y: 0, use: 'industrial', level: 1 },
      ],
    });
    const dangling = createCompanyState({
      version: 1,
      nextCompanyId: 2,
      companies: [{ id: 1, buildingId: 99, kind: 'commercial', jobCapacity: 8 }],
    });
    const residential = createCompanyState({
      version: 1,
      nextCompanyId: 2,
      companies: [{ id: 1, buildingId: 1, kind: 'commercial', jobCapacity: 8 }],
    });
    const mismatched = createCompanyState({
      version: 1,
      nextCompanyId: 2,
      companies: [{ id: 1, buildingId: 2, kind: 'industrial', jobCapacity: 12 }],
    });

    expect(() =>
      createCityWorldState(
        map,
        createRoadFixture(),
        undefined,
        buildings,
        undefined,
        undefined,
        dangling,
      ),
    ).toThrow(/company.*building/i);
    expect(() =>
      createCityWorldState(
        map,
        createRoadFixture(),
        undefined,
        buildings,
        undefined,
        undefined,
        residential,
      ),
    ).toThrow(/company.*commercial|industrial/i);
    expect(() =>
      createCityWorldState(
        map,
        createRoadFixture(),
        undefined,
        buildings,
        undefined,
        undefined,
        mismatched,
      ),
    ).toThrow(/company.*kind|building use/i);
  });

  it('round-trips compact household and company references through CityWorld v3', () => {
    const map = createStarterWorldMap('population-round-trip');
    const buildings = createBuildingState({
      version: 2,
      nextBuildingId: 3,
      buildings: [
        { id: 1, x: 2, y: 0, use: 'residential', level: 1 },
        { id: 2, x: 3, y: 0, use: 'industrial', level: 1 },
      ],
    });
    const households = createHouseholdState({
      version: 1,
      nextHouseholdId: 2,
      households: [{ id: 1, homeBuildingId: 1, memberCount: 4, workerCount: 2 }],
    });
    const companies = createCompanyState({
      version: 1,
      nextCompanyId: 2,
      companies: [{ id: 1, buildingId: 2, kind: 'industrial', jobCapacity: 12 }],
    });
    const city = createCityWorldState(
      map,
      createRoadFixture(),
      undefined,
      buildings,
      undefined,
      households,
      companies,
    );

    const encoded = encodeCityWorldState(city);
    const restored = decodeCityWorldState(encoded);

    expect(encoded.codecVersion).toBe(CITY_WORLD_CODEC_VERSION);
    expect(encoded.households.households).toEqual([[1, 1, 4, 2]]);
    expect(encoded.companies.companies).toEqual([[1, 2, 2, 12]]);
    expect(restored.households).toEqual(households);
    expect(restored.companies).toEqual(companies);
    expect(JSON.stringify(encoded.households)).not.toContain('"x"');
    expect(JSON.stringify(encoded.companies)).not.toContain('"use"');
  });

  it('round-trips map terrain, road tuples, zoning, buildings, and demand', () => {
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
    const buildings = createBuildingState({
      version: 2,
      nextBuildingId: 2,
      buildings: [
        {
          id: 1,
          x: land.x,
          y: land.y,
          use: 'industrial',
          level: 1,
        },
      ],
    });
    const demand = createDevelopmentDemandState({
      version: 5,
      residential: 10,
      commercial: 20,
      industrial: 90,
    });
    const city = createCityWorldState(map, roads, zoning, buildings, demand);

    const encoded = encodeCityWorldState(city);
    const restored = decodeCityWorldState(encoded);

    expect(encoded.codecVersion).toBe(CITY_WORLD_CODEC_VERSION);
    expect(restored.roads).toEqual(city.roads);
    expect(restored.zoning.version).toBe(3);
    expect(restored.buildings).toEqual(city.buildings);
    expect(restored.developmentDemand).toEqual(demand);
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
    expect(encoded.buildings.buildings).toEqual([]);
    expect(encoded.developmentDemand.values).toEqual([0, 60, 60, 60]);
    expect(encoded.roads.nodes).toEqual([
      [1, 0, 0],
      [2, 1, 0],
    ]);
  });
});
