import { createCompanyState, type CompanyKind } from '../economy/company-state';
import type { SimulationSystem } from '../core/simulation-system';
import { createHouseholdState } from './household-state';
import type { CityWorldState } from '../world/city-world-state';

export const COMMERCIAL_LEVEL_1_JOB_CAPACITY = 8;
export const INDUSTRIAL_LEVEL_1_JOB_CAPACITY = 12;

function companyJobCapacity(kind: CompanyKind): number {
  return kind === 'commercial'
    ? COMMERCIAL_LEVEL_1_JOB_CAPACITY
    : INDUSTRIAL_LEVEL_1_JOB_CAPACITY;
}

function collectResidentialCandidates(world: CityWorldState): number[] {
  const occupied = new Set(
    world.households.households.map((household) => household.homeBuildingId),
  );

  return world.buildings.buildings
    .filter((building) => building.use === 'residential' && !occupied.has(building.id))
    .map((building) => building.id)
    .sort((left, right) => left - right);
}

function collectCompanyCandidates(world: CityWorldState): number[] {
  const occupied = new Set(world.companies.companies.map((company) => company.buildingId));

  return world.buildings.buildings
    .filter((building) => building.use !== 'residential' && !occupied.has(building.id))
    .map((building) => building.id)
    .sort((left, right) => left - right);
}

export function createOccupancyGrowthSystem(): SimulationSystem<CityWorldState> {
  let residentialBuildingVersion: number | undefined;
  let householdVersion: number | undefined;
  let residentialCandidates: number[] = [];

  let companyBuildingVersion: number | undefined;
  let companyVersion: number | undefined;
  let companyCandidates: number[] = [];

  return {
    id: 'occupancy-growth',
    step: (world, context) => {
      if (
        residentialBuildingVersion !== world.buildings.version ||
        householdVersion !== world.households.version
      ) {
        residentialCandidates = collectResidentialCandidates(world);
        residentialBuildingVersion = world.buildings.version;
        householdVersion = world.households.version;
      }

      if (
        companyBuildingVersion !== world.buildings.version ||
        companyVersion !== world.companies.version
      ) {
        companyCandidates = collectCompanyCandidates(world);
        companyBuildingVersion = world.buildings.version;
        companyVersion = world.companies.version;
      }

      if (residentialCandidates.length === 0 && companyCandidates.length === 0) {
        return world;
      }

      let nextWorld = world;

      if (residentialCandidates.length > 0) {
        const candidateIndex = context.random.nextUint32() % residentialCandidates.length;
        const homeBuildingId = residentialCandidates[candidateIndex]!;
        const memberCount = 1 + (context.random.nextUint32() % 4);
        const maximumWorkers = Math.min(2, memberCount);
        const workerCount = 1 + (context.random.nextUint32() % maximumWorkers);
        const householdId = world.households.nextHouseholdId;

        const households = createHouseholdState({
          version: world.households.version + 1,
          nextHouseholdId: householdId + 1,
          households: [
            ...world.households.households,
            {
              id: householdId,
              homeBuildingId,
              memberCount,
              workerCount,
            },
          ],
        });

        residentialCandidates.splice(candidateIndex, 1);
        householdVersion = households.version;
        nextWorld = {
          ...nextWorld,
          households,
        };
      }

      if (companyCandidates.length > 0) {
        const candidateIndex = context.random.nextUint32() % companyCandidates.length;
        const buildingId = companyCandidates[candidateIndex]!;
        const building = world.buildings.buildings.find((candidate) => candidate.id === buildingId);

        if (building === undefined || building.use === 'residential') {
          throw new RangeError(
            `Occupancy company candidate ${buildingId} must reference a commercial or industrial building`,
          );
        }

        const kind: CompanyKind = building.use;
        const companyId = world.companies.nextCompanyId;
        const companies = createCompanyState({
          version: world.companies.version + 1,
          nextCompanyId: companyId + 1,
          companies: [
            ...world.companies.companies,
            {
              id: companyId,
              buildingId,
              kind,
              jobCapacity: companyJobCapacity(kind),
            },
          ],
        });

        companyCandidates.splice(candidateIndex, 1);
        companyVersion = companies.version;
        nextWorld = {
          ...nextWorld,
          companies,
        };
      }

      return nextWorld;
    },
  };
}
