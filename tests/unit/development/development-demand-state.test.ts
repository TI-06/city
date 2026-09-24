import { describe, expect, it } from 'vitest';
import {
  createDefaultDevelopmentDemand,
  createDevelopmentDemandState,
  getDevelopmentDemandForZone,
} from '../../../src/simulation/development/development-demand-state';
import { ZoneCode } from '../../../src/simulation/zoning/zoning-state';

describe('development demand state', () => {
  it('creates the 60/60/60 default demand state', () => {
    expect(createDefaultDevelopmentDemand()).toEqual({
      version: 0,
      residential: 60,
      commercial: 60,
      industrial: 60,
    });
  });

  it('returns demand values for each zoning code and zero for NONE', () => {
    const demand = createDevelopmentDemandState({
      version: 4,
      residential: 25,
      commercial: 50,
      industrial: 75,
    });

    expect(getDevelopmentDemandForZone(demand, ZoneCode.NONE)).toBe(0);
    expect(getDevelopmentDemandForZone(demand, ZoneCode.RESIDENTIAL)).toBe(25);
    expect(getDevelopmentDemandForZone(demand, ZoneCode.COMMERCIAL)).toBe(50);
    expect(getDevelopmentDemandForZone(demand, ZoneCode.INDUSTRIAL)).toBe(75);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid demand version %s',
    (version) => {
      expect(() =>
        createDevelopmentDemandState({
          version,
          residential: 60,
          commercial: 60,
          industrial: 60,
        }),
      ).toThrow(/demand version/i);
    },
  );

  it.each([-1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid residential demand %s',
    (residential) => {
      expect(() =>
        createDevelopmentDemandState({
          version: 0,
          residential,
          commercial: 60,
          industrial: 60,
        }),
      ).toThrow(/residential demand/i);
    },
  );

  it.each([-1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid commercial demand %s',
    (commercial) => {
      expect(() =>
        createDevelopmentDemandState({
          version: 0,
          residential: 60,
          commercial,
          industrial: 60,
        }),
      ).toThrow(/commercial demand/i);
    },
  );

  it.each([-1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid industrial demand %s',
    (industrial) => {
      expect(() =>
        createDevelopmentDemandState({
          version: 0,
          residential: 60,
          commercial: 60,
          industrial,
        }),
      ).toThrow(/industrial demand/i);
    },
  );
});
