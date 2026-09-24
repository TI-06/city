import {
  createHouseholdState,
  type Household,
  type HouseholdState,
} from '../../simulation/population/household-state';

export const HOUSEHOLD_CODEC_VERSION = 1;

export type EncodedHouseholdState = Readonly<{
  codecVersion: typeof HOUSEHOLD_CODEC_VERSION;
  version: number;
  nextHouseholdId: number;
  households: readonly (readonly [
    id: number,
    homeBuildingId: number,
    memberCount: number,
    workerCount: number,
  ])[];
}>;

function decodeHouseholdTuple(tuple: unknown, index: number): Household {
  if (!Array.isArray(tuple) || tuple.length !== 4) {
    throw new RangeError(`Household tuple at index ${index} must contain exactly 4 values`);
  }

  const values = tuple as readonly unknown[];
  const id = values[0];
  const homeBuildingId = values[1];
  const memberCount = values[2];
  const workerCount = values[3];

  if (
    typeof id !== 'number' ||
    typeof homeBuildingId !== 'number' ||
    typeof memberCount !== 'number' ||
    typeof workerCount !== 'number'
  ) {
    throw new RangeError(`Household tuple at index ${index} must contain numeric values`);
  }

  return {
    id,
    homeBuildingId,
    memberCount,
    workerCount,
  };
}

export function encodeHouseholdState(state: HouseholdState): EncodedHouseholdState {
  const validated = createHouseholdState(state);

  return {
    codecVersion: HOUSEHOLD_CODEC_VERSION,
    version: validated.version,
    nextHouseholdId: validated.nextHouseholdId,
    households: validated.households.map(
      (household) =>
        [
          household.id,
          household.homeBuildingId,
          household.memberCount,
          household.workerCount,
        ] as const,
    ),
  };
}

export function decodeHouseholdState(saved: EncodedHouseholdState): HouseholdState {
  if (saved.codecVersion !== HOUSEHOLD_CODEC_VERSION) {
    throw new RangeError('Unsupported household codec version; expected 1');
  }

  return createHouseholdState({
    version: saved.version,
    nextHouseholdId: saved.nextHouseholdId,
    households: saved.households.map((tuple, index) => decodeHouseholdTuple(tuple, index)),
  });
}
