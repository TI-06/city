import type { PublicServiceKind } from './public-service-state';

type PublicServiceCatalogEntry = Readonly<{
  placementCost: number;
  dailyOperatingCost: number;
  coverageDistance: number;
}>;

const PUBLIC_SERVICE_CATALOG: Readonly<Record<PublicServiceKind, PublicServiceCatalogEntry>> = {
  park: {
    placementCost: 5_000,
    dailyOperatingCost: 25,
    coverageDistance: 8,
  },
  school: {
    placementCost: 20_000,
    dailyOperatingCost: 100,
    coverageDistance: 16,
  },
  fire: {
    placementCost: 30_000,
    dailyOperatingCost: 150,
    coverageDistance: 24,
  },
  police: {
    placementCost: 30_000,
    dailyOperatingCost: 150,
    coverageDistance: 24,
  },
  hospital: {
    placementCost: 50_000,
    dailyOperatingCost: 250,
    coverageDistance: 32,
  },
};

export function getPublicServicePlacementCost(kind: PublicServiceKind): number {
  return PUBLIC_SERVICE_CATALOG[kind].placementCost;
}

export function getPublicServiceDailyOperatingCost(kind: PublicServiceKind): number {
  return PUBLIC_SERVICE_CATALOG[kind].dailyOperatingCost;
}

export function getPublicServiceCoverageDistance(kind: PublicServiceKind): number {
  return PUBLIC_SERVICE_CATALOG[kind].coverageDistance;
}
