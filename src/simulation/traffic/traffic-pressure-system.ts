import type { Building } from '../buildings/building-state';
import type { SimulationSystem } from '../core/simulation-system';
import { derivePopulationJobsStatistics } from '../population/population-jobs-statistics';
import type { CityWorldState } from '../world/city-world-state';
import {
  createRoadRoutingIndex,
  type RoadRoutingIndex,
} from './road-routing-index';
import {
  replaceTrafficVolumes,
  type TrafficEdgeVolume,
} from './traffic-state';

export const MAX_TRAFFIC_COHORTS = 64;

type TrafficSourceSnapshot = Readonly<{
  roadTopologyVersion: number;
  buildingVersion: number;
  householdVersion: number;
  companyVersion: number;
}>;

type TrafficEndpoint = Readonly<{
  id: number;
  nodeId: number;
}>;

export type TrafficPressureSystem = SimulationSystem<CityWorldState> &
  Readonly<{
    getRecalculationCount: () => number;
    getLastRouteSearchCount: () => number;
    getLastCohortWeight: () => number;
  }>;

function sameSnapshot(
  left: TrafficSourceSnapshot | undefined,
  right: TrafficSourceSnapshot,
): boolean {
  return (
    left !== undefined &&
    left.roadTopologyVersion === right.roadTopologyVersion &&
    left.buildingVersion === right.buildingVersion &&
    left.householdVersion === right.householdVersion &&
    left.companyVersion === right.companyVersion
  );
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must remain a safe integer`);
  }
  return result;
}

function createSourceSnapshot(world: CityWorldState): TrafficSourceSnapshot {
  return {
    roadTopologyVersion: world.roads.topologyVersion,
    buildingVersion: world.buildings.version,
    householdVersion: world.households.version,
    companyVersion: world.companies.version,
  };
}

function collectHouseholdOrigins(
  world: CityWorldState,
  buildingById: ReadonlyMap<number, Building>,
  routing: RoadRoutingIndex,
): readonly TrafficEndpoint[] {
  return [...world.households.households]
    .sort((left, right) => left.id - right.id)
    .flatMap((household) => {
      const building = buildingById.get(household.homeBuildingId);
      if (building === undefined) {
        return [];
      }

      const nodeId = routing.findBuildingAccessNode(building.x, building.y);
      return nodeId === undefined ? [] : [{ id: household.id, nodeId }];
    });
}

function collectCompanyDestinations(
  world: CityWorldState,
  buildingById: ReadonlyMap<number, Building>,
  routing: RoadRoutingIndex,
): readonly TrafficEndpoint[] {
  return [...world.companies.companies]
    .sort((left, right) => left.id - right.id)
    .flatMap((company) => {
      const building = buildingById.get(company.buildingId);
      if (building === undefined) {
        return [];
      }

      const nodeId = routing.findBuildingAccessNode(building.x, building.y);
      return nodeId === undefined ? [] : [{ id: company.id, nodeId }];
    });
}

function replaceWorldTraffic(
  world: CityWorldState,
  edgeVolumes: readonly TrafficEdgeVolume[],
): CityWorldState {
  const traffic = replaceTrafficVolumes(
    world.traffic,
    world.roads.topologyVersion,
    edgeVolumes,
  );

  if (traffic === world.traffic) {
    return world;
  }

  return {
    ...world,
    traffic,
  };
}

export function createTrafficPressureSystem(): TrafficPressureSystem {
  let lastSourceSnapshot: TrafficSourceSnapshot | undefined;

  let cachedRoutingTopologyVersion: number | undefined;
  let routingIndex: RoadRoutingIndex | undefined;

  let cachedBuildingVersion: number | undefined;
  let buildingById = new Map<number, Building>();

  let recalculationCount = 0;
  let lastRouteSearchCount = 0;
  let lastCohortWeight = 0;

  return {
    id: 'traffic-pressure',

    step: (world, context) => {
      if ((context.clock.elapsedHours + 1) % 24 !== 0) {
        return world;
      }

      const sourceSnapshot = createSourceSnapshot(world);
      if (sameSnapshot(lastSourceSnapshot, sourceSnapshot)) {
        return world;
      }

      recalculationCount += 1;
      lastRouteSearchCount = 0;
      lastCohortWeight = 0;

      const statistics = derivePopulationJobsStatistics(
        world.households,
        world.companies,
      );

      if (statistics.employed === 0) {
        lastSourceSnapshot = sourceSnapshot;
        return replaceWorldTraffic(world, []);
      }

      if (
        routingIndex === undefined ||
        cachedRoutingTopologyVersion !== world.roads.topologyVersion
      ) {
        routingIndex = createRoadRoutingIndex(world.roads);
        cachedRoutingTopologyVersion = world.roads.topologyVersion;
      }

      if (cachedBuildingVersion !== world.buildings.version) {
        buildingById = new Map(
          world.buildings.buildings.map((building) => [building.id, building]),
        );
        cachedBuildingVersion = world.buildings.version;
      }

      const origins = collectHouseholdOrigins(world, buildingById, routingIndex);
      const destinations = collectCompanyDestinations(
        world,
        buildingById,
        routingIndex,
      );

      if (origins.length === 0 || destinations.length === 0) {
        lastSourceSnapshot = sourceSnapshot;
        return replaceWorldTraffic(world, []);
      }

      const cohortCount = Math.min(
        MAX_TRAFFIC_COHORTS,
        statistics.employed,
        origins.length,
      );

      if (cohortCount <= 0) {
        lastSourceSnapshot = sourceSnapshot;
        return replaceWorldTraffic(world, []);
      }

      const baseWeight = Math.floor(statistics.employed / cohortCount);
      const remainder = statistics.employed % cohortCount;
      const volumeByEdgeId = new Map<number, number>();

      for (let index = 0; index < cohortCount; index += 1) {
        const originIndex = Math.floor((index * origins.length) / cohortCount);
        const origin = origins[originIndex]!;
        const destination = destinations[index % destinations.length]!;
        const weight = baseWeight + (index < remainder ? 1 : 0);

        lastCohortWeight = safeAdd(
          lastCohortWeight,
          weight,
          'Traffic cohort weight total',
        );
        lastRouteSearchCount += 1;

        const edgeIds = routingIndex.findShortestPathEdgeIds(
          origin.nodeId,
          destination.nodeId,
        );
        if (edgeIds === undefined) {
          continue;
        }

        for (const edgeId of edgeIds) {
          const current = volumeByEdgeId.get(edgeId) ?? 0;
          volumeByEdgeId.set(
            edgeId,
            safeAdd(current, weight, `Traffic edge ${edgeId} volume`),
          );
        }
      }

      const edgeVolumes = [...volumeByEdgeId.entries()]
        .filter(([, volume]) => volume > 0)
        .sort(([leftEdgeId], [rightEdgeId]) => leftEdgeId - rightEdgeId)
        .map(([edgeId, volume]) => ({ edgeId, volume }));

      lastSourceSnapshot = sourceSnapshot;
      return replaceWorldTraffic(world, edgeVolumes);
    },

    getRecalculationCount: () => recalculationCount,
    getLastRouteSearchCount: () => lastRouteSearchCount,
    getLastCohortWeight: () => lastCohortWeight,
  };
}
