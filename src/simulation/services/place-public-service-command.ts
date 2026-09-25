import type { CommandHandler } from '../core/command-handler';
import { spendTreasury } from '../economy/economy-state';
import { TerrainCode } from '../map/world-map-state';
import type { CityWorldState } from '../world/city-world-state';
import { ZoneCode, getZoneAt } from '../zoning/zoning-state';
import { getPublicServicePlacementCost } from './public-service-catalog';
import {
  createPublicServiceState,
  isPublicServiceKind,
  type PublicServiceKind,
} from './public-service-state';

export type PlacePublicServicePayload = Readonly<{
  kind: PublicServiceKind;
  x: number;
  y: number;
}>;

export type PlacePublicServiceDelta = Readonly<{
  serviceId: number;
  kind: PublicServiceKind;
  placementCost: number;
}>;

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parsePayload(payload: unknown): PlacePublicServicePayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new TypeError('PLACE_PUBLIC_SERVICE requires an object payload');
  }

  if (
    !('kind' in payload) ||
    typeof payload.kind !== 'string' ||
    !isPublicServiceKind(payload.kind)
  ) {
    throw new RangeError('PLACE_PUBLIC_SERVICE requires a valid public service kind');
  }

  if (
    !('x' in payload) ||
    !('y' in payload) ||
    typeof payload.x !== 'number' ||
    typeof payload.y !== 'number'
  ) {
    throw new TypeError('PLACE_PUBLIC_SERVICE requires numeric x and y coordinates');
  }

  return {
    kind: payload.kind,
    x: payload.x,
    y: payload.y,
  };
}

function validatePlacement(world: CityWorldState, payload: PlacePublicServicePayload): void {
  if (!Number.isSafeInteger(payload.x) || !Number.isSafeInteger(payload.y)) {
    throw new RangeError('Public service coordinate must use safe integers');
  }

  if (
    payload.x < 0 ||
    payload.y < 0 ||
    payload.x >= world.map.dimensions.width ||
    payload.y >= world.map.dimensions.height
  ) {
    throw new RangeError('Public service coordinate is outside map bounds');
  }

  if (world.map.terrain.get(payload.x, payload.y) !== TerrainCode.LAND) {
    throw new RangeError('Public service must be placed on LAND terrain');
  }

  if (getZoneAt(world.zoning, payload.x, payload.y) !== ZoneCode.NONE) {
    throw new RangeError('Public service cannot overlap a zone');
  }

  const key = coordinateKey(payload.x, payload.y);
  const roadCoordinates = new Set(
    world.roads.nodes.map((node) => coordinateKey(node.x, node.y)),
  );

  if (roadCoordinates.has(key)) {
    throw new RangeError('Public service cannot overlap a road');
  }

  if (
    world.buildings.buildings.some(
      (building) => building.x === payload.x && building.y === payload.y,
    )
  ) {
    throw new RangeError('Public service cannot overlap a building');
  }

  if (
    world.publicServices.services.some(
      (service) => service.x === payload.x && service.y === payload.y,
    )
  ) {
    throw new RangeError('Public service cannot overlap an existing service');
  }

  const hasRoadAccess =
    roadCoordinates.has(coordinateKey(payload.x, payload.y - 1)) ||
    roadCoordinates.has(coordinateKey(payload.x - 1, payload.y)) ||
    roadCoordinates.has(coordinateKey(payload.x + 1, payload.y)) ||
    roadCoordinates.has(coordinateKey(payload.x, payload.y + 1));

  if (!hasRoadAccess) {
    throw new RangeError('Public service must have adjacent road access');
  }
}

export const placePublicServiceHandler: CommandHandler<CityWorldState> = {
  type: 'PLACE_PUBLIC_SERVICE',
  apply: (world, payload) => {
    const parsed = parsePayload(payload);
    validatePlacement(world, parsed);

    const placementCost = getPublicServicePlacementCost(parsed.kind);
    const economy = spendTreasury(world.economy, placementCost);
    const serviceId = world.publicServices.nextServiceId;
    const publicServices = createPublicServiceState({
      version: world.publicServices.version + 1,
      nextServiceId: serviceId + 1,
      services: [
        ...world.publicServices.services,
        {
          id: serviceId,
          x: parsed.x,
          y: parsed.y,
          kind: parsed.kind,
        },
      ],
    });

    return {
      world: {
        ...world,
        economy,
        publicServices,
      },
      delta: {
        serviceId,
        kind: parsed.kind,
        placementCost,
      } satisfies PlacePublicServiceDelta,
    };
  },
};
