import type { RandomSeed } from '../core/seeded-random';
import { assertGridCoordinate, type GridDimensions } from '../map/grid-dimensions';
import { createStarterWorldMap } from '../map/starter-map-generator';
import { TerrainCode, type WorldMapState } from '../map/world-map-state';
import { createEmptyRoadNetwork, type RoadNetworkState } from '../roads/road-network-state';

export type CityWorldState = Readonly<{
  map: WorldMapState;
  roads: RoadNetworkState;
}>;

export function createCityWorldState(map: WorldMapState, roads: RoadNetworkState): CityWorldState {
  for (const node of roads.nodes) {
    assertGridCoordinate(map.dimensions, node.x, node.y);

    if (map.terrain.get(node.x, node.y) !== TerrainCode.LAND) {
      throw new RangeError(`Road node ${node.id} must be placed on LAND terrain`);
    }
  }

  return { map, roads };
}

export function createStarterCityWorld(
  seed: RandomSeed,
  dimensions?: GridDimensions,
): CityWorldState {
  const map =
    dimensions === undefined
      ? createStarterWorldMap(seed)
      : createStarterWorldMap(seed, dimensions);

  return createCityWorldState(map, createEmptyRoadNetwork());
}
