import type { RoadAccessIndex } from '../roads/road-access-index';
import { ZoneCode, getZoneAt, type ZoningState } from './zoning-state';

export function isZonedCellRoadAccessible(
  zoning: ZoningState,
  roadAccess: RoadAccessIndex,
  x: number,
  y: number,
): boolean {
  return getZoneAt(zoning, x, y) !== ZoneCode.NONE && roadAccess.hasAdjacentRoad(x, y);
}
