import { describe, expect, it } from 'vitest';
import {
  createCompanyState,
  createEmptyCompanyState,
  findCompanyByBuildingId,
  type Company,
} from '../../../src/simulation/economy/company-state';

const FIXTURE: readonly Company[] = [
  { id: 1, buildingId: 10, kind: 'commercial', jobCapacity: 8 },
  { id: 2, buildingId: 11, kind: 'industrial', jobCapacity: 12 },
];

describe('company state', () => {
  it('creates the canonical empty company state', () => {
    expect(createEmptyCompanyState()).toEqual({
      version: 0,
      nextCompanyId: 1,
      companies: [],
    });
  });

  it('accepts a valid normalized company fixture and supports building lookup', () => {
    const state = createCompanyState({
      version: 2,
      nextCompanyId: 3,
      companies: FIXTURE,
    });

    expect(findCompanyByBuildingId(state, 10)?.id).toBe(1);
    expect(findCompanyByBuildingId(state, 99)).toBeUndefined();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid company version %s',
    (version) => {
      expect(() =>
        createCompanyState({
          version,
          nextCompanyId: 1,
          companies: [],
        }),
      ).toThrow(/company version/i);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid company id %s',
    (id) => {
      expect(() =>
        createCompanyState({
          version: 0,
          nextCompanyId: 2,
          companies: [{ id, buildingId: 1, kind: 'commercial', jobCapacity: 8 }],
        }),
      ).toThrow(/company id/i);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid building id %s',
    (buildingId) => {
      expect(() =>
        createCompanyState({
          version: 0,
          nextCompanyId: 2,
          companies: [{ id: 1, buildingId, kind: 'commercial', jobCapacity: 8 }],
        }),
      ).toThrow(/building id/i);
    },
  );

  it('rejects duplicate company ids', () => {
    expect(() =>
      createCompanyState({
        version: 0,
        nextCompanyId: 2,
        companies: [
          { id: 1, buildingId: 10, kind: 'commercial', jobCapacity: 8 },
          { id: 1, buildingId: 11, kind: 'industrial', jobCapacity: 12 },
        ],
      }),
    ).toThrow(/duplicate company id/i);
  });

  it('rejects duplicate occupied building ids', () => {
    expect(() =>
      createCompanyState({
        version: 0,
        nextCompanyId: 3,
        companies: [
          { id: 1, buildingId: 10, kind: 'commercial', jobCapacity: 8 },
          { id: 2, buildingId: 10, kind: 'industrial', jobCapacity: 12 },
        ],
      }),
    ).toThrow(/duplicate company building id/i);
  });

  it.each([
    ['office', 8],
    ['commercial', 0],
    ['industrial', -1],
    ['industrial', 1.5],
  ])('rejects invalid company kind/capacity fixture (%s, %s)', (kind, jobCapacity) => {
    expect(() =>
      createCompanyState({
        version: 0,
        nextCompanyId: 2,
        companies: [
          {
            id: 1,
            buildingId: 10,
            kind,
            jobCapacity,
          } as unknown as Company,
        ],
      }),
    ).toThrow(/company kind|job capacity/i);
  });

  it('requires nextCompanyId above every current company id', () => {
    expect(() =>
      createCompanyState({
        version: 2,
        nextCompanyId: 2,
        companies: FIXTURE,
      }),
    ).toThrow(/next company id/i);
  });
});
