import { describe, expect, it } from 'vitest';
import {
  ZONING_CODEC_VERSION,
  decodeZoningState,
  encodeZoningState,
  type EncodedZoningState,
} from '../../../src/persistence/codec/zoning-codec';
import { encodeChunkedByteGrid } from '../../../src/persistence/codec/chunked-byte-grid-codec';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import { ZoneCode, createZoningState } from '../../../src/simulation/zoning/zoning-state';

function createFixture() {
  const dimensions = createGridDimensions(33, 34);
  let grid = ChunkedByteGrid.filled(dimensions, ZoneCode.NONE);
  grid = grid.withCell(0, 0, ZoneCode.RESIDENTIAL);
  grid = grid.withCell(1, 0, ZoneCode.COMMERCIAL);
  grid = grid.withCell(2, 0, ZoneCode.INDUSTRIAL);

  return createZoningState(7, grid);
}

describe('zoning codec', () => {
  it('round-trips compact zoning bytes and version', () => {
    const source = createFixture();
    const encoded = encodeZoningState(source);
    const restored = decodeZoningState(encoded);

    expect(encoded.codecVersion).toBe(ZONING_CODEC_VERSION);
    expect(encoded.version).toBe(7);
    expect(restored.version).toBe(source.version);
    expect(restored.grid.dimensions).toEqual(source.grid.dimensions);
    expect(restored.grid.copyChunks().map((chunk) => Array.from(chunk))).toEqual(
      source.grid.copyChunks().map((chunk) => Array.from(chunk)),
    );
  });

  it('rejects an unsupported zoning codec version', () => {
    const encoded = encodeZoningState(createFixture());

    expect(() =>
      decodeZoningState({
        ...encoded,
        codecVersion: ZONING_CODEC_VERSION + 1,
      } as unknown as EncodedZoningState),
    ).toThrow(/zoning codec version/i);
  });

  it('rejects malformed encoded grid chunks through the byte-grid codec', () => {
    const encoded = encodeZoningState(createFixture());

    expect(() =>
      decodeZoningState({
        ...encoded,
        grid: {
          ...encoded.grid,
          chunks: [],
        },
      }),
    ).toThrow(/chunk count/i);
  });

  it('rejects any decoded zoning byte outside 0 through 3', () => {
    const dimensions = createGridDimensions(16, 16);
    const invalidGrid = ChunkedByteGrid.filled(dimensions, 4);
    const encoded: EncodedZoningState = {
      codecVersion: ZONING_CODEC_VERSION,
      version: 0,
      grid: encodeChunkedByteGrid(invalidGrid),
    };

    expect(() => decodeZoningState(encoded)).toThrow(/invalid zone code/i);
  });
});
