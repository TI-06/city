import { describe, expect, it } from 'vitest';
import {
  BYTE_GRID_CHUNK_BYTES,
  BYTE_GRID_CHUNK_SIZE,
  ChunkedByteGrid,
} from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';

describe('ChunkedByteGrid', () => {
  it('uses fixed 32x32 chunks across grid boundaries', () => {
    const grid = ChunkedByteGrid.filled(createGridDimensions(33, 33), 7);

    expect(BYTE_GRID_CHUNK_SIZE).toBe(32);
    expect(BYTE_GRID_CHUNK_BYTES).toBe(1024);
    expect(grid.chunkCount).toBe(4);
    expect(grid.get(0, 0)).toBe(7);
    expect(grid.get(31, 31)).toBe(7);
    expect(grid.get(32, 31)).toBe(7);
    expect(grid.get(31, 32)).toBe(7);
    expect(grid.get(32, 32)).toBe(7);
  });

  it('generates deterministic values from exact coordinates', () => {
    const grid = ChunkedByteGrid.generate(createGridDimensions(65, 34), (x, y) => (x + y) % 256);

    expect(grid.get(0, 0)).toBe(0);
    expect(grid.get(31, 0)).toBe(31);
    expect(grid.get(32, 0)).toBe(32);
    expect(grid.get(64, 33)).toBe(97);
  });

  it('returns a new grid without mutating the source', () => {
    const source = ChunkedByteGrid.filled(createGridDimensions(64, 64), 1);
    const updated = source.withCell(35, 36, 9);

    expect(source.get(35, 36)).toBe(1);
    expect(updated.get(35, 36)).toBe(9);
    expect(updated.get(34, 36)).toBe(1);
    expect(updated.get(35, 35)).toBe(1);
  });

  it('returns defensive chunk copies', () => {
    const grid = ChunkedByteGrid.filled(createGridDimensions(32, 32), 3);
    const chunks = grid.copyChunks();

    chunks[0]![0] = 99;

    expect(grid.get(0, 0)).toBe(3);
  });

  it.each([-1, 256, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid byte value %s',
    (value) => {
      const dimensions = createGridDimensions(32, 32);
      expect(() => ChunkedByteGrid.filled(dimensions, value)).toThrow(/byte value/i);
    },
  );

  it('rejects invalid cell coordinates', () => {
    const grid = ChunkedByteGrid.filled(createGridDimensions(32, 32), 0);

    expect(() => grid.get(32, 0)).toThrow(/grid coordinate/i);
    expect(() => grid.withCell(-1, 0, 1)).toThrow(/grid coordinate/i);
  });

  it('rejects a mismatched chunk count', () => {
    const dimensions = createGridDimensions(33, 33);
    const chunks = [new Uint8Array(BYTE_GRID_CHUNK_BYTES)];

    expect(() => ChunkedByteGrid.fromChunks(dimensions, BYTE_GRID_CHUNK_SIZE, chunks)).toThrow(
      /chunk count/i,
    );
  });

  it('rejects chunks with the wrong byte length', () => {
    const dimensions = createGridDimensions(32, 32);
    const chunks = [new Uint8Array(BYTE_GRID_CHUNK_BYTES - 1)];

    expect(() => ChunkedByteGrid.fromChunks(dimensions, BYTE_GRID_CHUNK_SIZE, chunks)).toThrow(
      /chunk byte length/i,
    );
  });

  it('rejects unsupported chunk sizes', () => {
    const dimensions = createGridDimensions(32, 32);
    const chunks = [new Uint8Array(BYTE_GRID_CHUNK_BYTES)];

    expect(() => ChunkedByteGrid.fromChunks(dimensions, 16, chunks)).toThrow(/chunk size/i);
  });
});
