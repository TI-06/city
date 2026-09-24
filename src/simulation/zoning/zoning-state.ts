import { ChunkedByteGrid } from '../map/chunked-byte-grid';
import type { GridDimensions } from '../map/grid-dimensions';

export const ZoneCode = {
  NONE: 0,
  RESIDENTIAL: 1,
  COMMERCIAL: 2,
  INDUSTRIAL: 3,
} as const;

export type ZoneCodeValue = (typeof ZoneCode)[keyof typeof ZoneCode];

export type ZoningState = Readonly<{
  version: number;
  grid: ChunkedByteGrid;
}>;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

export function isZoneCode(value: number): value is ZoneCodeValue {
  return (
    value === ZoneCode.NONE ||
    value === ZoneCode.RESIDENTIAL ||
    value === ZoneCode.COMMERCIAL ||
    value === ZoneCode.INDUSTRIAL
  );
}

export function createZoningState(version: number, grid: ChunkedByteGrid): ZoningState {
  assertNonNegativeSafeInteger(version, 'Zoning version');

  const dimensions = grid.dimensions;
  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      const zone = grid.get(x, y);
      if (!isZoneCode(zone)) {
        throw new RangeError(`Invalid zone code ${zone} at ${x},${y}`);
      }
    }
  }

  return {
    version,
    grid,
  };
}

export function createEmptyZoning(dimensions: GridDimensions): ZoningState {
  return createZoningState(0, ChunkedByteGrid.filled(dimensions, ZoneCode.NONE));
}

export function getZoneAt(state: ZoningState, x: number, y: number): ZoneCodeValue {
  const zone = state.grid.get(x, y);

  if (!isZoneCode(zone)) {
    throw new RangeError(`Invalid zone code ${zone} at ${x},${y}`);
  }

  return zone;
}
