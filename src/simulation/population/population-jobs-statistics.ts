import type { CompanyState } from '../economy/company-state';
import type { HouseholdState } from './household-state';

export type PopulationJobsStatistics = Readonly<{
  population: number;
  laborForce: number;
  jobs: number;
  employed: number;
  unemployed: number;
}>;

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must remain a safe integer`);
  }
  return result;
}

export function derivePopulationJobsStatistics(
  households: HouseholdState,
  companies: CompanyState,
): PopulationJobsStatistics {
  let population = 0;
  let laborForce = 0;
  let jobs = 0;

  for (const household of households.households) {
    population = safeAdd(population, household.memberCount, 'Population');
    laborForce = safeAdd(laborForce, household.workerCount, 'Labor force');
  }

  for (const company of companies.companies) {
    jobs = safeAdd(jobs, company.jobCapacity, 'Jobs');
  }

  const employed = Math.min(laborForce, jobs);
  const unemployed = laborForce - employed;

  return {
    population,
    laborForce,
    jobs,
    employed,
    unemployed,
  };
}
