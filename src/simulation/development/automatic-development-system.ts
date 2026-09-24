import { createBuildingState, type BuildingUse } from '../buildings/building-state';
import type { SimulationSystem } from '../core/simulation-system';
import { createRoadAccessIndex, type RoadAccessIndex } from '../roads/road-access-index';
import type { CityWorldState } from '../world/city-world-state';
import { getDevelopmentDemandForZone } from './development-demand-state';
import { ZoneCode, getZoneAt, type ZoneCodeValue } from '../zoning/zoning-state';

export const DEVELOPMENT_ATTEMPTS_PER_HOUR = 16;

type DevelopmentCandidate = Readonly<{
  x: number;
  y: number;
  zone: ZoneCodeValue;
}>;

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

function buildingUseForZone(zone: ZoneCodeValue): BuildingUse {
  switch (zone) {
    case ZoneCode.RESIDENTIAL:
      return 'residential';
    case ZoneCode.COMMERCIAL:
      return 'commercial';
    case ZoneCode.INDUSTRIAL:
      return 'industrial';
    case ZoneCode.NONE:
      throw new RangeError('NONE zoning cannot create a building');
  }
}

function collectDevelopmentCandidates(world: CityWorldState): readonly DevelopmentCandidate[] {
  const candidates: DevelopmentCandidate[] = [];

  for (let y = 0; y < world.map.dimensions.height; y += 1) {
    for (let x = 0; x < world.map.dimensions.width; x += 1) {
      const zone = getZoneAt(world.zoning, x, y);
      if (zone !== ZoneCode.NONE) {
        candidates.push({ x, y, zone });
      }
    }
  }

  return candidates;
}

export function createAutomaticDevelopmentSystem(): SimulationSystem<CityWorldState> {
  let cachedZoningVersion: number | undefined;
  let candidates: readonly DevelopmentCandidate[] = [];

  let cachedRoadTopologyVersion: number | undefined;
  let roadAccess: RoadAccessIndex | undefined;

  let cachedBuildingVersion: number | undefined;
  let occupiedBuildingCoordinates = new Set<string>();

  return {
    id: 'automatic-development',
    step: (world, context) => {
      if (cachedZoningVersion !== world.zoning.version) {
        candidates = collectDevelopmentCandidates(world);
        cachedZoningVersion = world.zoning.version;
      }

      if (candidates.length === 0) {
        return world;
      }

      if (
        roadAccess === undefined ||
        cachedRoadTopologyVersion !== world.roads.topologyVersion
      ) {
        roadAccess = createRoadAccessIndex(world.roads);
        cachedRoadTopologyVersion = world.roads.topologyVersion;
      }

      if (cachedBuildingVersion !== world.buildings.version) {
        occupiedBuildingCoordinates = new Set(
          world.buildings.buildings.map((building) =>
            coordinateKey(building.x, building.y),
          ),
        );
        cachedBuildingVersion = world.buildings.version;
      }

      const startIndex = context.random.nextUint32() % candidates.length;
      const attemptCount = Math.min(DEVELOPMENT_ATTEMPTS_PER_HOUR, candidates.length);

      for (let offset = 0; offset < attemptCount; offset += 1) {
        const candidate = candidates[(startIndex + offset) % candidates.length]!;

        if (occupiedBuildingCoordinates.has(coordinateKey(candidate.x, candidate.y))) {
          continue;
        }

        if (!roadAccess.hasAdjacentRoad(candidate.x, candidate.y)) {
          continue;
        }

        const demand = getDevelopmentDemandForZone(world.developmentDemand, candidate.zone);
        if (demand <= 0) {
          continue;
        }

        const demandRoll = context.random.nextUint32() % 100;
        if (demandRoll >= demand) {
          continue;
        }

        const buildingId = world.buildings.nextBuildingId;
        const buildings = createBuildingState({
          version: world.buildings.version + 1,
          nextBuildingId: buildingId + 1,
          buildings: [
            ...world.buildings.buildings,
            {
              id: buildingId,
              x: candidate.x,
              y: candidate.y,
              use: buildingUseForZone(candidate.zone),
              level: 1,
            },
          ],
        });

        return {
          ...world,
          buildings,
        };
      }

      return world;
    },
  };
}
