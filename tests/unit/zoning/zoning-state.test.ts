import { describe, expect, it } from 'vitest';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  ZoneCode,
  createEmptyZoning,
  createZoningState,
  getZoneAt,
  isZoneCode,
} from '../../../src/simulation/zoning/zoning-state';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';

describe('zoning state', () => {
  it('creates an empty NONE grid matching map dimensions', () => {
    const dimensions = createGridDimensions(33, 34);
    const zoning = createEmptyZoning(dimensions);

    expect(zoning.version).toBe(0);
    expect(zoning.grid.dimensions).toEqual(dimensions);
    expect(getZoneAt(zoning, 0, 0)).toBe(ZoneCode.NONE);
    expect(getZoneAt(zoning, 32, 31)).toBe(ZoneCode.NONE);
    expect(getZoneAt(zoning, 32, 33)).toBe(ZoneCode.NONE);
  });

  it.each([0, 1, 42])('accepts a non-negative safe zoning version %s', (version) => {
    const grid = ChunkedByteGrid.filled(createGridDimensions(16, 16), ZoneCode.NONE);

    expect(createZoningState(version, grid)).toEqual({ version, grid });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid zoning version %s',
    (version) => {
      const grid = ChunkedByteGrid.filled(createGridDimensions(16, 16), ZoneCode.NONE);
      expect(() => createZoningState(version, grid)).toThrow(/zoning version/i);
    },
  );

  it('recognizes exactly the four zoning codes', () => {
    expect(ZoneCode).toEqual({
      NONE: 0,
      RESIDENTIAL: 1,
      COMMERCIAL: 2,
      INDUSTRIAL: 3,
    });

    expect(isZoneCode(ZoneCode.NONE)).toBe(true);
    expect(isZoneCode(ZoneCode.RESIDENTIAL)).toBe(true);
    expect(isZoneCode(ZoneCode.COMMERCIAL)).toBe(true);
    expect(isZoneCode(ZoneCode.INDUSTRIAL)).toBe(true);
    expect(isZoneCode(4)).toBe(false);
    expect(isZoneCode(-1)).toBe(false);
    expect(isZoneCode(1.5)).toBe(false);
    expect(isZoneCode(Number.NaN)).toBe(false);
  });
});
