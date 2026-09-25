import {
  createBuildingState,
  createEmptyBuildingState,
  type BuildingState,
} from '../buildings/building-state';
import type { RandomSeed } from '../core/seeded-random';
import {
  createDefaultDevelopmentDemand,
  createDevelopmentDemandState,
  type DevelopmentDemandState,
} from '../development/development-demand-state';
import {
  createCompanyState,
  createEmptyCompanyState,
  type CompanyState,
} from '../economy/company-state';
import {
  createDefaultEconomyState,
  createEconomyState,
  type EconomyState,
} from '../economy/economy-state';
import { assertGridCoordinate, type GridDimensions } from '../map/grid-dimensions';
import { createStarterWorldMap } from '../map/starter-map-generator';
import { TerrainCode, type WorldMapState } from '../map/world-map-state';
import {
  createEmptyHouseholdState,
  createHouseholdState,
  type HouseholdState,
} from '../population/household-state';
import { createEmptyRoadNetwork, type RoadNetworkState } from '../roads/road-network-state';
import {
  createEmptyTrafficState,
  createTrafficState,
  type TrafficState,
} from '../traffic/traffic-state';
import { ZoneCode, createEmptyZoning, getZoneAt, type ZoningState } from '../zoning/zoning-state';

export type CityWorldState = Readonly<{
  map: WorldMapState;
  roads: RoadNetworkState;
  zoning: ZoningState;
  buildings: BuildingState;
  developmentDemand: DevelopmentDemandState;
  households: HouseholdState;
  companies: CompanyState;
  economy: EconomyState;
  traffic: TrafficState;
}>;

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function createCityWorldState(
  map: WorldMapState,
  roads: RoadNetworkState,
  zoning: ZoningState = createEmptyZoning(map.dimensions),
  buildings: BuildingState = createEmptyBuildingState(),
  developmentDemand: DevelopmentDemandState = createDefaultDevelopmentDemand(),
  households: HouseholdState = createEmptyHouseholdState(),
  companies: CompanyState = createEmptyCompanyState(),
  economy: EconomyState = createDefaultEconomyState(),
  traffic: TrafficState = createEmptyTrafficState(roads.topologyVersion),
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

  const validatedBuildings = createBuildingState(buildings);
  const buildingById = new Map(
    validatedBuildings.buildings.map((building) => [building.id, building]),
  );

  for (const building of validatedBuildings.buildings) {
    assertGridCoordinate(map.dimensions, building.x, building.y);

    if (map.terrain.get(building.x, building.y) !== TerrainCode.LAND) {
      throw new RangeError(`Building ${building.id} must be placed on LAND terrain`);
    }

    if (roadCoordinates.has(coordinateKey(building.x, building.y))) {
      throw new RangeError(`Building ${building.id} cannot overlap a road cell`);
    }
  }

  const validatedHouseholds = createHouseholdState(households);
  for (const household of validatedHouseholds.households) {
    const home = buildingById.get(household.homeBuildingId);
    if (home === undefined) {
      throw new RangeError(
        `Household ${household.id} home building ${household.homeBuildingId} must reference an existing building`,
      );
    }
    if (home.use !== 'residential') {
      throw new RangeError(
        `Household ${household.id} home building ${household.homeBuildingId} must be residential`,
      );
    }
  }

  const validatedCompanies = createCompanyState(companies);
  for (const company of validatedCompanies.companies) {
    const building = buildingById.get(company.buildingId);
    if (building === undefined) {
      throw new RangeError(
        `Company ${company.id} building ${company.buildingId} must reference an existing building`,
      );
    }
    if (building.use !== 'commercial' && building.use !== 'industrial') {
      throw new RangeError(
        `Company ${company.id} building ${company.buildingId} must be commercial or industrial`,
      );
    }
    if (company.kind !== building.use) {
      throw new RangeError(`Company ${company.id} kind must match building use ${building.use}`);
    }
  }

  const validatedTraffic = createTrafficState(traffic);
  if (validatedTraffic.roadTopologyVersion !== roads.topologyVersion) {
    throw new RangeError(
      `Traffic road topology version ${validatedTraffic.roadTopologyVersion} must match road topology version ${roads.topologyVersion}`,
    );
  }

  const roadEdgeIds = new Set(roads.edges.map((edge) => edge.id));
  for (const entry of validatedTraffic.edgeVolumes) {
    if (!roadEdgeIds.has(entry.edgeId)) {
      throw new RangeError(`Traffic edge ${entry.edgeId} must reference an existing road edge`);
    }
  }

  return {
    map,
    roads,
    zoning,
    buildings: validatedBuildings,
    developmentDemand: createDevelopmentDemandState(developmentDemand),
    households: validatedHouseholds,
    companies: validatedCompanies,
    economy: createEconomyState(economy),
    traffic: validatedTraffic,
  };
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
