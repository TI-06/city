import type { ZoneCodeValue } from '../zoning/zoning-state';
import { ZoneCode } from '../zoning/zoning-state';

export type DevelopmentDemandState = Readonly<{
  version: number;
  residential: number;
  commercial: number;
  industrial: number;
}>;

export type DevelopmentDemandStateInput = Readonly<{
  version: number;
  residential: number;
  commercial: number;
  industrial: number;
}>;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function assertDemandValue(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be a safe integer between 0 and 100`);
  }
}

export function createDevelopmentDemandState(
  input: DevelopmentDemandStateInput,
): DevelopmentDemandState {
  assertNonNegativeSafeInteger(input.version, 'Development demand version');
  assertDemandValue(input.residential, 'Residential demand');
  assertDemandValue(input.commercial, 'Commercial demand');
  assertDemandValue(input.industrial, 'Industrial demand');

  return {
    version: input.version,
    residential: input.residential,
    commercial: input.commercial,
    industrial: input.industrial,
  };
}

export function createDefaultDevelopmentDemand(): DevelopmentDemandState {
  return createDevelopmentDemandState({
    version: 0,
    residential: 60,
    commercial: 60,
    industrial: 60,
  });
}

export function getDevelopmentDemandForZone(
  demand: DevelopmentDemandState,
  zone: ZoneCodeValue,
): number {
  switch (zone) {
    case ZoneCode.NONE:
      return 0;
    case ZoneCode.RESIDENTIAL:
      return demand.residential;
    case ZoneCode.COMMERCIAL:
      return demand.commercial;
    case ZoneCode.INDUSTRIAL:
      return demand.industrial;
  }
}
