import { describe, expect, it } from 'vitest';
import {
  createEmptyPublicServiceState,
  createPublicServiceState,
  findPublicServiceAt,
  type PublicService,
} from '../../../src/simulation/services/public-service-state';

const FIXTURE: readonly PublicService[] = [
  { id: 1, x: 10, y: 20, kind: 'park' },
  { id: 2, x: 11, y: 20, kind: 'school' },
  { id: 3, x: 12, y: 20, kind: 'fire' },
  { id: 4, x: 13, y: 20, kind: 'police' },
  { id: 5, x: 14, y: 20, kind: 'hospital' },
];

describe('public service state', () => {
  it('creates the canonical empty public service state', () => {
    expect(createEmptyPublicServiceState()).toEqual({
      version: 0,
      nextServiceId: 1,
      services: [],
    });
  });

  it('accepts a valid normalized fixture and supports coordinate lookup', () => {
    const state = createPublicServiceState({
      version: 5,
      nextServiceId: 6,
      services: FIXTURE,
    });

    expect(findPublicServiceAt(state, 10, 20)?.id).toBe(1);
    expect(findPublicServiceAt(state, 99, 99)).toBeUndefined();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid public service version %s',
    (version) => {
      expect(() =>
        createPublicServiceState({
          version,
          nextServiceId: 1,
          services: [],
        }),
      ).toThrow(/service version/i);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid service id %s',
    (id) => {
      expect(() =>
        createPublicServiceState({
          version: 0,
          nextServiceId: 2,
          services: [{ id, x: 0, y: 0, kind: 'park' }],
        }),
      ).toThrow(/service id/i);
    },
  );

  it('rejects duplicate service ids', () => {
    expect(() =>
      createPublicServiceState({
        version: 0,
        nextServiceId: 2,
        services: [
          { id: 1, x: 0, y: 0, kind: 'park' },
          { id: 1, x: 1, y: 0, kind: 'school' },
        ],
      }),
    ).toThrow(/duplicate public service id/i);
  });

  it('rejects duplicate service coordinates', () => {
    expect(() =>
      createPublicServiceState({
        version: 0,
        nextServiceId: 3,
        services: [
          { id: 1, x: 0, y: 0, kind: 'park' },
          { id: 2, x: 0, y: 0, kind: 'hospital' },
        ],
      }),
    ).toThrow(/duplicate public service coordinate/i);
  });

  it.each([
    [1.5, 0],
    [0, Number.NaN],
    [Number.POSITIVE_INFINITY, 0],
  ])('rejects invalid service coordinate (%s, %s)', (x, y) => {
    expect(() =>
      createPublicServiceState({
        version: 0,
        nextServiceId: 2,
        services: [{ id: 1, x, y, kind: 'park' }],
      }),
    ).toThrow(/service coordinate/i);
  });

  it.each(['office', 'clinic', 'station'])('rejects invalid service kind %s', (kind) => {
    expect(() =>
      createPublicServiceState({
        version: 0,
        nextServiceId: 2,
        services: [{ id: 1, x: 0, y: 0, kind } as unknown as PublicService],
      }),
    ).toThrow(/service kind/i);
  });

  it('requires nextServiceId above every current id', () => {
    expect(() =>
      createPublicServiceState({
        version: 5,
        nextServiceId: 5,
        services: FIXTURE,
      }),
    ).toThrow(/next service id/i);
  });
});
