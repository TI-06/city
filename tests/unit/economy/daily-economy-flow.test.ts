import { describe, expect, it } from 'vitest';
import { createBuildingState } from '../../../src/simulation/buildings/building-state';
import { createCompanyState } from '../../../src/simulation/economy/company-state';
import {
  EMPLOYED_WORKER_TAX_PER_DAY,
  RESIDENT_TAX_PER_DAY,
  ROAD_NODE_MAINTENANCE_PER_DAY,
  deriveDailyEconomyFlow,
} from '../../../src/simulation/economy/daily-economy-flow';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../../src/simulation/map/world-map-state';
import { createHouseholdState } from '../../../src/simulation/population/household-state';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import { createCityWorldState } from '../../../src/simulation/world/city-world-state';

function createAllLandMap(): WorldMapState {
  const dimensions = createGridDimensions(16, 16);
  return {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: 'economy-flow',
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
}

describe('daily economy flow', () => {
  it('uses the configured integer tax and maintenance constants', () => {
    expect(RESIDENT_TAX_PER_DAY).toBe(3);
    expect(EMPLOYED_WORKER_TAX_PER_DAY).toBe(7);
    expect(ROAD_NODE_MAINTENANCE_PER_DAY).toBe(1);
  });

  it('returns zero flow for an empty city', () => {
    const world = createCityWorldState(
      createAllLandMap(),
      createRoadNetworkState({
        topologyVersion: 0,
        nextNodeId: 1,
        nextEdgeId: 1,
        nodes: [],
        edges: [],
      }),
    );

    expect(deriveDailyEconomyFlow(world)).toEqual({
      taxRevenue: 0,
      operatingCost: 0,
      net: 0,
    });
  });

  it('derives tax from population and employed workers and maintenance from roads', () => {
    const map = createAllLandMap();
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
    const buildings = createBuildingState({
      version: 2,
      nextBuildingId: 3,
      buildings: [
        { id: 1, x: 2, y: 0, use: 'residential', level: 1 },
        { id: 2, x: 3, y: 0, use: 'commercial', level: 1 },
      ],
    });
    const households = createHouseholdState({
      version: 1,
      nextHouseholdId: 2,
      households: [{ id: 1, homeBuildingId: 1, memberCount: 3, workerCount: 2 }],
    });
    const companies = createCompanyState({
      version: 1,
      nextCompanyId: 2,
      companies: [{ id: 1, buildingId: 2, kind: 'commercial', jobCapacity: 8 }],
    });
    const world = createCityWorldState(
      map,
      roads,
      undefined,
      buildings,
      undefined,
      households,
      companies,
    );

    expect(deriveDailyEconomyFlow(world)).toEqual({
      taxRevenue: 23,
      operatingCost: 2,
      net: 21,
    });
  });

  it('does not tax unemployed workers as employed', () => {
    const map = createAllLandMap();
    const buildings = createBuildingState({
      version: 3,
      nextBuildingId: 4,
      buildings: [
        { id: 1, x: 0, y: 1, use: 'residential', level: 1 },
        { id: 2, x: 1, y: 1, use: 'residential', level: 1 },
        { id: 3, x: 2, y: 1, use: 'industrial', level: 1 },
      ],
    });
    const households = createHouseholdState({
      version: 2,
      nextHouseholdId: 3,
      households: [
        { id: 1, homeBuildingId: 1, memberCount: 4, workerCount: 2 },
        { id: 2, homeBuildingId: 2, memberCount: 3, workerCount: 2 },
      ],
    });
    const companies = createCompanyState({
      version: 1,
      nextCompanyId: 2,
      companies: [{ id: 1, buildingId: 3, kind: 'industrial', jobCapacity: 1 }],
    });
    const world = createCityWorldState(
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
      undefined,
      households,
      companies,
    );

    expect(deriveDailyEconomyFlow(world)).toEqual({
      taxRevenue: 28,
      operatingCost: 0,
      net: 28,
    });
  });
});
