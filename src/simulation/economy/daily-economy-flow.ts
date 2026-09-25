import type { CityWorldState } from '../world/city-world-state';
import { derivePopulationJobsStatistics } from '../population/population-jobs-statistics';

export const RESIDENT_TAX_PER_DAY = 3;
export const EMPLOYED_WORKER_TAX_PER_DAY = 7;
export const ROAD_NODE_MAINTENANCE_PER_DAY = 1;

export type DailyEconomyFlow = Readonly<{
  taxRevenue: number;
  operatingCost: number;
  net: number;
}>;

function safeMultiply(left: number, right: number, label: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must remain a safe integer`);
  }
  return result;
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must remain a safe integer`);
  }
  return result;
}

function safeSubtract(left: number, right: number, label: string): number {
  const result = left - right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must remain a safe integer`);
  }
  return result;
}

export function deriveDailyEconomyFlow(world: CityWorldState): DailyEconomyFlow {
  const statistics = derivePopulationJobsStatistics(world.households, world.companies);
  const residentTax = safeMultiply(
    statistics.population,
    RESIDENT_TAX_PER_DAY,
    'Resident tax revenue',
  );
  const employmentTax = safeMultiply(
    statistics.employed,
    EMPLOYED_WORKER_TAX_PER_DAY,
    'Employment tax revenue',
  );
  const taxRevenue = safeAdd(residentTax, employmentTax, 'Daily tax revenue');
  const operatingCost = safeMultiply(
    world.roads.nodes.length,
    ROAD_NODE_MAINTENANCE_PER_DAY,
    'Daily operating cost',
  );
  const net = safeSubtract(taxRevenue, operatingCost, 'Daily economy net');

  return {
    taxRevenue,
    operatingCost,
    net,
  };
}
