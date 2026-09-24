import type { RandomSeed } from '../core/seeded-random';
import { assertGridCoordinate, type GridDimensions } from '../map/grid-dimensions';
import { createStarterWorldMap } from '../map/starter-map-generator';
import { TerrainCode, type WorldMapState } from '../map/world-map-state';
import { createEmptyRoadNetwork, type RoadNetworkState } from '../roads/road-network-state';
import { ZoneCode, createEmptyZoning, getZoneAt, type ZoningState } from '../zoning/zoning-state';

export type CityWorldState = Readonly<{
  map: WorldMapState;
  roads: RoadNetworkState;
  zoning: ZoningState;
}>;

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function createCityWorldState(
  map: WorldMapState,
  roads: RoadNetworkState,
  zoning: ZoningState = createEmptyZoning(map.dimensions),
): CityWorldState {
  const zoningDimensions = zoning.grid.dimensions;
  if (
    zoningDimensions.width !== map.dimensions.width ||
    zoningDimensions.height !== map.dimensions.height
  ) {
    throw new RangeError('Zoning dimensions must match map dimensions');
  }

  const roadCoordinates = new Set<string>();

  for (const node of roads.nodes) {
    assertGridCoordinate(map.dimensions, node.x, node.y);

    if (map.terrain.get(node.x, node.y) !== TerrainCode.LAND) {
      throw new RangeError(`Road node ${node.id} must be placed on LAND terrain`);
    }

    roadCoordinates.add(coordinateKey(node.x, node.y));
  }

  for (let y = 0; y < map.dimensions.height; y += 1) {
    for (let x = 0; x < map.dimensions.width; x += 1) {
      const zone = getZoneAt(zoning, x, y);
      if (zone === ZoneCode.NONE) {
        continue;
      }

      if (map.terrain.get(x, y) !== TerrainCode.LAND) {
        throw new RangeError(`Zone at ${x},${y} must be placed on LAND terrain`);
      }

      if (roadCoordinates.has(coordinateKey(x, y))) {
        throw new RangeError(`Zone at ${x},${y} cannot overlap a road cell`);
      }
    }
  }

  return { map, roads, zoning };
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
