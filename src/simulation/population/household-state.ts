export type Household = Readonly<{
  id: number;
  homeBuildingId: number;
  memberCount: number;
  workerCount: number;
}>;

export type HouseholdState = Readonly<{
  version: number;
  nextHouseholdId: number;
  households: readonly Household[];
}>;

export type HouseholdStateInput = Readonly<{
  version: number;
  nextHouseholdId: number;
  households: readonly Household[];
}>;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

export function createEmptyHouseholdState(): HouseholdState {
  return {
    version: 0,
    nextHouseholdId: 1,
    households: [],
  };
}

export function createHouseholdState(input: HouseholdStateInput): HouseholdState {
  assertNonNegativeSafeInteger(input.version, 'Household version');
  assertPositiveSafeInteger(input.nextHouseholdId, 'Next household ID');

  const householdIds = new Set<number>();
  const homeBuildingIds = new Set<number>();
  let maximumId = 0;

  const households = input.households.map((household) => {
    assertPositiveSafeInteger(household.id, 'Household ID');
    assertPositiveSafeInteger(household.homeBuildingId, 'Home building ID');

    if (householdIds.has(household.id)) {
      throw new RangeError(`Duplicate household ID: ${household.id}`);
    }
    householdIds.add(household.id);

    if (homeBuildingIds.has(household.homeBuildingId)) {
      throw new RangeError(`Duplicate household home building ID: ${household.homeBuildingId}`);
    }
    homeBuildingIds.add(household.homeBuildingId);

    if (
      !Number.isSafeInteger(household.memberCount) ||
      household.memberCount < 1 ||
      household.memberCount > 4
    ) {
      throw new RangeError('Household member count must be a safe integer between 1 and 4');
    }

    const maximumWorkers = Math.min(2, household.memberCount);
    if (
      !Number.isSafeInteger(household.workerCount) ||
      household.workerCount < 1 ||
      household.workerCount > maximumWorkers
    ) {
      throw new RangeError(
        `Household worker count must be a safe integer between 1 and ${maximumWorkers}`,
      );
    }

    maximumId = Math.max(maximumId, household.id);
    return {
      id: household.id,
      homeBuildingId: household.homeBuildingId,
      memberCount: household.memberCount,
      workerCount: household.workerCount,
    } satisfies Household;
  });

  if (input.nextHouseholdId <= maximumId) {
    throw new RangeError(
      `Next household ID ${input.nextHouseholdId} must be greater than existing maximum household ID ${maximumId}`,
    );
  }

  return {
    version: input.version,
    nextHouseholdId: input.nextHouseholdId,
    households,
  };
}

export function findHouseholdByHomeBuildingId(
  state: HouseholdState,
  homeBuildingId: number,
): Household | undefined {
  return state.households.find((household) => household.homeBuildingId === homeBuildingId);
}
