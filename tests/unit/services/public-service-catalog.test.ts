import { describe, expect, it } from 'vitest';
import {
  getPublicServiceCoverageDistance,
  getPublicServiceDailyOperatingCost,
  getPublicServicePlacementCost,
} from '../../../src/simulation/services/public-service-catalog';
import type { PublicServiceKind } from '../../../src/simulation/services/public-service-state';

const CASES = [
  ['park', 5_000, 25, 8],
  ['school', 20_000, 100, 16],
  ['fire', 30_000, 150, 24],
  ['police', 30_000, 150, 24],
  ['hospital', 50_000, 250, 32],
] as const satisfies readonly (readonly [PublicServiceKind, number, number, number])[];

describe('public service catalog', () => {
  it.each(CASES)(
    'defines placement, operating, and coverage constants for %s',
    (kind, placementCost, operatingCost, coverageDistance) => {
      expect(getPublicServicePlacementCost(kind)).toBe(placementCost);
      expect(getPublicServiceDailyOperatingCost(kind)).toBe(operatingCost);
      expect(getPublicServiceCoverageDistance(kind)).toBe(coverageDistance);
    },
  );

  it('keeps every catalog value as a positive safe integer', () => {
    for (const [kind] of CASES) {
      expect(Number.isSafeInteger(getPublicServicePlacementCost(kind))).toBe(true);
      expect(Number.isSafeInteger(getPublicServiceDailyOperatingCost(kind))).toBe(true);
      expect(Number.isSafeInteger(getPublicServiceCoverageDistance(kind))).toBe(true);
      expect(getPublicServicePlacementCost(kind)).toBeGreaterThan(0);
      expect(getPublicServiceDailyOperatingCost(kind)).toBeGreaterThan(0);
      expect(getPublicServiceCoverageDistance(kind)).toBeGreaterThan(0);
    }
  });
});
