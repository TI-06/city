import {
  BYTE_GRID_CHUNK_BYTES,
  BYTE_GRID_CHUNK_SIZE,
  ChunkedByteGrid,
} from '../../simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../simulation/map/grid-dimensions';
import { decodeBytesBase64, encodeBytesBase64 } from './base64-bytes';

export const BYTE_GRID_CODEC_VERSION = 1;

export type EncodedChunkedByteGrid = Readonly<{
  codecVersion: typeof BYTE_GRID_CODEC_VERSION;
  width: number;
  height: number;
  chunkSize: typeof BYTE_GRID_CHUNK_SIZE;
  chunks: readonly string[];
}>;

export function encodeChunkedByteGrid(grid: ChunkedByteGrid): EncodedChunkedByteGrid {
  return {
    codecVersion: BYTE_GRID_CODEC_VERSION,
    width: grid.dimensions.width,
    height: grid.dimensions.height,
    chunkSize: BYTE_GRID_CHUNK_SIZE,
    chunks: grid.copyChunks().map((chunk) => encodeBytesBase64(chunk)),
  };
}

export function decodeChunkedByteGrid(snapshot: EncodedChunkedByteGrid): ChunkedByteGrid {
  if (snapshot.codecVersion !== BYTE_GRID_CODEC_VERSION) {
    throw new RangeError(
      `Unsupported byte grid codec version: ${snapshot.codecVersion}; expected ${BYTE_GRID_CODEC_VERSION}`,
    );
  }

  if (snapshot.chunkSize !== BYTE_GRID_CHUNK_SIZE) {
    throw new RangeError(
      `Unsupported chunk size: ${snapshot.chunkSize}; expected ${BYTE_GRID_CHUNK_SIZE}`,
    );
  }

  const dimensions = createGridDimensions(snapshot.width, snapshot.height);
  const chunks = snapshot.chunks.map((encoded, index) => {
    const chunk = decodeBytesBase64(encoded);
    if (chunk.length !== BYTE_GRID_CHUNK_BYTES) {
      throw new RangeError(
        `Chunk byte length at index ${index} is ${chunk.length}; expected ${BYTE_GRID_CHUNK_BYTES}`,
      );
    }
    return chunk;
  });

  return ChunkedByteGrid.fromChunks(dimensions, snapshot.chunkSize, chunks);
}
