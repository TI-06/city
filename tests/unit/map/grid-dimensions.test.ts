import { describe, expect, it } from 'vitest';
import {
  MAX_MAP_AXIS_CELLS,
  assertGridCoordinate,
  createGridDimensions,
  gridCellCount,
} from '../../../src/simulation/map/grid-dimensions';

describe('grid dimensions', () => {
  it('creates valid dimensions and reports the exact cell count', () => {
    const dimensions = createGridDimensions(128, 128);

    expect(dimensions).toEqual({ width: 128, height: 128 });
    expect(gridCellCount(dimensions)).toBe(16_384);
    expect(MAX_MAP_AXIS_CELLS).toBe(512);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 513])(
    'rejects invalid width %s',
    (width) => {
      expect(() => createGridDimensions(width, 128)).toThrow(/integer between 1 and 512/i);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 513])(
    'rejects invalid height %s',
    (height) => {
      expect(() => createGridDimensions(128, height)).toThrow(/integer between 1 and 512/i);
    },
  );

  it('accepts both edge coordinates', () => {
    const dimensions = createGridDimensions(128, 128);

    expect(() => assertGridCoordinate(dimensions, 0, 0)).not.toThrow();
    expect(() => assertGridCoordinate(dimensions, 127, 127)).not.toThrow();
  });

  it.each([
    [-1, 0],
    [0, -1],
    [128, 0],
    [0, 128],
    [1.5, 1],
    [1, Number.NaN],
  ])('rejects out-of-range coordinate (%s, %s)', (x, y) => {
    const dimensions = createGridDimensions(128, 128);
    expect(() => assertGridCoordinate(dimensions, x, y)).toThrow(/grid coordinate/i);
  });
});
