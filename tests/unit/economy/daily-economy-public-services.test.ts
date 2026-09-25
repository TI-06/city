import { describe, expect, it } from 'vitest';
import { deriveDailyEconomyFlow } from '../../../src/simulation/economy/daily-economy-flow';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../../src/simulation/map/world-map-state';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import { createPublicServiceState } from '../../../src/simulation/services/public-service-state';
import { createCityWorldState } from '../../../src/simulation/world/city-world-state';

function createWorldWithAllServiceKinds() {
  const dimensions = createGridDimensions(16, 16);
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: 'economy-public-services',
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
  const roads = createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId: 6,
    nextEdgeId: 5,
    nodes: Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      x: index,
      y: 0,
    })),
    edges: Array.from({ length: 4 }, (_, index) => ({
      id: index + 1,
      nodeA: index + 1,
      nodeB: index + 2,
      roadType: 'two-lane' as const,
      laneCount: 2 as const,
      lengthCells: 1 as const,
    })),
  });
  const publicServices = createPublicServiceState({
    version: 5,
    nextServiceId: 6,
    services: [
      { id: 1, x: 0, y: 1, kind: 'park' },
      { id: 2, x: 1, y: 1, kind: 'school' },
      { id: 3, x: 2, y: 1, kind: 'fire' },
      { id: 4, x: 3, y: 1, kind: 'police' },
      { id: 5, x: 4, y: 1, kind: 'hospital' },
    ],
  });

  return createCityWorldState(
    map,
    roads,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    publicServices,
  );
}

describe('daily economy flow with public services', () => {
  it('adds service operating costs to road maintenance', () => {
    expect(deriveDailyEconomyFlow(createWorldWithAllServiceKinds())).toEqual({
      taxRevenue: 0,
      operatingCost: 680,
      net: -680,
    });
  });
});
