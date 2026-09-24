import { describe, expect, it } from 'vitest';
import {
  createEmptyHouseholdState,
  createHouseholdState,
  findHouseholdByHomeBuildingId,
  type Household,
} from '../../../src/simulation/population/household-state';

const FIXTURE: readonly Household[] = [
  { id: 1, homeBuildingId: 10, memberCount: 1, workerCount: 1 },
  { id: 2, homeBuildingId: 11, memberCount: 4, workerCount: 2 },
];

describe('household state', () => {
  it('creates the canonical empty household state', () => {
    expect(createEmptyHouseholdState()).toEqual({
      version: 0,
      nextHouseholdId: 1,
      households: [],
    });
  });

  it('accepts normalized households and supports home-building lookup', () => {
    const state = createHouseholdState({
      version: 2,
      nextHouseholdId: 3,
      households: FIXTURE,
    });

    expect(findHouseholdByHomeBuildingId(state, 10)?.id).toBe(1);
    expect(findHouseholdByHomeBuildingId(state, 99)).toBeUndefined();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid household version %s',
    (version) => {
      expect(() =>
        createHouseholdState({
          version,
          nextHouseholdId: 1,
          households: [],
        }),
      ).toThrow(/household version/i);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid household id %s',
    (id) => {
      expect(() =>
        createHouseholdState({
          version: 0,
          nextHouseholdId: 2,
          households: [{ id, homeBuildingId: 1, memberCount: 2, workerCount: 1 }],
        }),
      ).toThrow(/household id/i);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid home building id %s',
    (homeBuildingId) => {
      expect(() =>
        createHouseholdState({
          version: 0,
          nextHouseholdId: 2,
          households: [{ id: 1, homeBuildingId, memberCount: 2, workerCount: 1 }],
        }),
      ).toThrow(/home building id/i);
    },
  );

  it('rejects duplicate household ids', () => {
    expect(() =>
      createHouseholdState({
        version: 0,
        nextHouseholdId: 2,
        households: [
          { id: 1, homeBuildingId: 10, memberCount: 2, workerCount: 1 },
          { id: 1, homeBuildingId: 11, memberCount: 3, workerCount: 2 },
        ],
      }),
    ).toThrow(/duplicate household id/i);
  });

  it('rejects multiple households in the same home building', () => {
    expect(() =>
      createHouseholdState({
        version: 0,
        nextHouseholdId: 3,
        households: [
          { id: 1, homeBuildingId: 10, memberCount: 2, workerCount: 1 },
          { id: 2, homeBuildingId: 10, memberCount: 3, workerCount: 2 },
        ],
      }),
    ).toThrow(/duplicate household home building/i);
  });

  it.each([0, 5, 1.5, Number.NaN])('rejects invalid memberCount %s', (memberCount) => {
    expect(() =>
      createHouseholdState({
        version: 0,
        nextHouseholdId: 2,
        households: [{ id: 1, homeBuildingId: 10, memberCount, workerCount: 1 }],
      }),
    ).toThrow(/member count/i);
  });

  it.each([
    [1, 0],
    [1, 2],
    [4, 3],
    [2, 1.5],
  ])('rejects invalid workerCount %s for memberCount %s', (memberCount, workerCount) => {
    expect(() =>
      createHouseholdState({
        version: 0,
        nextHouseholdId: 2,
        households: [{ id: 1, homeBuildingId: 10, memberCount, workerCount }],
      }),
    ).toThrow(/worker count/i);
  });

  it('requires nextHouseholdId above all current ids', () => {
    expect(() =>
      createHouseholdState({
        version: 2,
        nextHouseholdId: 2,
        households: FIXTURE,
      }),
    ).toThrow(/next household id/i);
  });
});
