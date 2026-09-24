import { describe, expect, it } from 'vitest';
import {
  createBuildingState,
  createEmptyBuildingState,
  findBuildingAt,
  type Building,
} from '../../../src/simulation/buildings/building-state';

const FIXTURE: readonly Building[] = [
  { id: 1, x: 10, y: 20, use: 'residential', level: 1 },
  { id: 2, x: 11, y: 20, use: 'commercial', level: 1 },
  { id: 3, x: 12, y: 20, use: 'industrial', level: 1 },
];

describe('building state', () => {
  it('creates the canonical empty building state', () => {
    expect(createEmptyBuildingState()).toEqual({
      version: 0,
      nextBuildingId: 1,
      buildings: [],
    });
  });

  it('accepts a valid normalized building fixture and supports coordinate lookup', () => {
    const state = createBuildingState({
      version: 3,
      nextBuildingId: 4,
      buildings: FIXTURE,
    });

    expect(findBuildingAt(state, 10, 20)?.id).toBe(1);
    expect(findBuildingAt(state, 99, 99)).toBeUndefined();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid building version %s',
    (version) => {
      expect(() =>
        createBuildingState({
          version,
          nextBuildingId: 1,
          buildings: [],
        }),
      ).toThrow(/building version/i);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid building id %s',
    (id) => {
      expect(() =>
        createBuildingState({
          version: 0,
          nextBuildingId: 2,
          buildings: [{ id, x: 0, y: 0, use: 'residential', level: 1 }],
        }),
      ).toThrow(/building id/i);
    },
  );

  it('rejects duplicate building ids', () => {
    expect(() =>
      createBuildingState({
        version: 0,
        nextBuildingId: 2,
        buildings: [
          { id: 1, x: 0, y: 0, use: 'residential', level: 1 },
          { id: 1, x: 1, y: 0, use: 'commercial', level: 1 },
        ],
      }),
    ).toThrow(/duplicate building id/i);
  });

  it('rejects duplicate building coordinates', () => {
    expect(() =>
      createBuildingState({
        version: 0,
        nextBuildingId: 3,
        buildings: [
          { id: 1, x: 0, y: 0, use: 'residential', level: 1 },
          { id: 2, x: 0, y: 0, use: 'industrial', level: 1 },
        ],
      }),
    ).toThrow(/duplicate building coordinate/i);
  });

  it.each([
    [1.5, 0],
    [0, Number.NaN],
    [Number.POSITIVE_INFINITY, 0],
  ])('rejects invalid building coordinate (%s, %s)', (x, y) => {
    expect(() =>
      createBuildingState({
        version: 0,
        nextBuildingId: 2,
        buildings: [{ id: 1, x, y, use: 'residential', level: 1 }],
      }),
    ).toThrow(/building coordinate/i);
  });

  it.each([
    ['office', 1],
    ['residential', 2],
  ])('rejects invalid building use/level fixture (%s, %s)', (use, level) => {
    expect(() =>
      createBuildingState({
        version: 0,
        nextBuildingId: 2,
        buildings: [{ id: 1, x: 0, y: 0, use, level } as unknown as Building],
      }),
    ).toThrow(/building use|building level/i);
  });

  it('requires nextBuildingId to be greater than every current building id', () => {
    expect(() =>
      createBuildingState({
        version: 3,
        nextBuildingId: 3,
        buildings: FIXTURE,
      }),
    ).toThrow(/next building id/i);
  });
});
