import { describe, expect, it } from 'vitest';
import {
  BYTE_GRID_CODEC_VERSION,
  decodeChunkedByteGrid,
  encodeChunkedByteGrid,
  type EncodedChunkedByteGrid,
} from '../../../src/persistence/codec/chunked-byte-grid-codec';
import {
  BYTE_GRID_CHUNK_BYTES,
  BYTE_GRID_CHUNK_SIZE,
  ChunkedByteGrid,
} from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';

function createFixture() {
  return ChunkedByteGrid.generate(createGridDimensions(65, 34), (x, y) => (x * 3 + y * 5) % 256);
}

describe('chunked byte grid codec', () => {
  it('round-trips a multi-chunk grid byte-for-byte', () => {
    const source = createFixture();
    const snapshot = encodeChunkedByteGrid(source);
    const restored = decodeChunkedByteGrid(snapshot);

    expect(snapshot.codecVersion).toBe(BYTE_GRID_CODEC_VERSION);
    expect(snapshot.width).toBe(65);
    expect(snapshot.height).toBe(34);
    expect(snapshot.chunkSize).toBe(BYTE_GRID_CHUNK_SIZE);
    expect(restored.dimensions).toEqual(source.dimensions);
    expect(restored.copyChunks().map((chunk) => Array.from(chunk))).toEqual(
      source.copyChunks().map((chunk) => Array.from(chunk)),
    );
  });

  it('rejects an unsupported codec version', () => {
    const snapshot = encodeChunkedByteGrid(createFixture());

    expect(() =>
      decodeChunkedByteGrid({
        ...snapshot,
        codecVersion: BYTE_GRID_CODEC_VERSION + 1,
      } as unknown as EncodedChunkedByteGrid),
    ).toThrow(/codec version/i);
  });

  it('rejects an unsupported chunk size', () => {
    const snapshot = encodeChunkedByteGrid(createFixture());

    expect(() =>
      decodeChunkedByteGrid({
        ...snapshot,
        chunkSize: 16,
      } as unknown as EncodedChunkedByteGrid),
    ).toThrow(/chunk size/i);
  });

  it('rejects a missing chunk', () => {
    const snapshot = encodeChunkedByteGrid(createFixture());

    expect(() =>
      decodeChunkedByteGrid({
        ...snapshot,
        chunks: snapshot.chunks.slice(0, -1),
      }),
    ).toThrow(/chunk count/i);
  });

  it('rejects decoded chunks with the wrong byte length', () => {
    const snapshot = encodeChunkedByteGrid(ChunkedByteGrid.filled(createGridDimensions(32, 32), 1));
    const shortChunk = new Uint8Array(BYTE_GRID_CHUNK_BYTES - 1);
    const encodedShortChunk = btoa(
      Array.from(shortChunk, (value) => String.fromCharCode(value)).join(''),
    );

    expect(() =>
      decodeChunkedByteGrid({
        ...snapshot,
        chunks: [encodedShortChunk],
      }),
    ).toThrow(/chunk byte length/i);
  });
});
