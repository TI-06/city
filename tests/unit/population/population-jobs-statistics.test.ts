import { describe, expect, it } from 'vitest';
import { createCompanyState } from '../../../src/simulation/economy/company-state';
import { createHouseholdState } from '../../../src/simulation/population/household-state';
import { derivePopulationJobsStatistics } from '../../../src/simulation/population/population-jobs-statistics';

describe('population and jobs statistics', () => {
  it('returns zeroes for an empty city', () => {
    const households = createHouseholdState({
      version: 0,
      nextHouseholdId: 1,
      households: [],
    });
    const companies = createCompanyState({
      version: 0,
      nextCompanyId: 1,
      companies: [],
    });

    expect(derivePopulationJobsStatistics(households, companies)).toEqual({
      population: 0,
      laborForce: 0,
      jobs: 0,
      employed: 0,
      unemployed: 0,
    });
  });

  it('caps employment at available jobs when labor force is larger', () => {
    const households = createHouseholdState({
      version: 2,
      nextHouseholdId: 3,
      households: [
        { id: 1, homeBuildingId: 10, memberCount: 4, workerCount: 2 },
        { id: 2, homeBuildingId: 11, memberCount: 3, workerCount: 2 },
      ],
    });
    const companies = createCompanyState({
      version: 1,
      nextCompanyId: 2,
      companies: [{ id: 1, buildingId: 20, kind: 'commercial', jobCapacity: 3 }],
    });

    expect(derivePopulationJobsStatistics(households, companies)).toEqual({
      population: 7,
      laborForce: 4,
      jobs: 3,
      employed: 3,
      unemployed: 1,
    });
  });

  it('caps employment at labor force when jobs are larger', () => {
    const households = createHouseholdState({
      version: 1,
      nextHouseholdId: 2,
      households: [{ id: 1, homeBuildingId: 10, memberCount: 2, workerCount: 1 }],
    });
    const companies = createCompanyState({
      version: 2,
      nextCompanyId: 3,
      companies: [
        { id: 1, buildingId: 20, kind: 'commercial', jobCapacity: 8 },
        { id: 2, buildingId: 21, kind: 'industrial', jobCapacity: 12 },
      ],
    });

    expect(derivePopulationJobsStatistics(households, companies)).toEqual({
      population: 2,
      laborForce: 1,
      jobs: 20,
      employed: 1,
      unemployed: 0,
    });
  });

  it('rejects safe-integer overflow in derived job totals', () => {
    const households = createHouseholdState({
      version: 0,
      nextHouseholdId: 1,
      households: [],
    });
    const companies = createCompanyState({
      version: 2,
      nextCompanyId: 3,
      companies: [
        {
          id: 1,
          buildingId: 20,
          kind: 'commercial',
          jobCapacity: Number.MAX_SAFE_INTEGER,
        },
        {
          id: 2,
          buildingId: 21,
          kind: 'industrial',
          jobCapacity: 1,
        },
      ],
    });

    expect(() => derivePopulationJobsStatistics(households, companies)).toThrow(/safe integer/i);
  });
});
