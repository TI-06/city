import type { ZoningState } from '../../simulation/zoning/zoning-state';
import { createZoningState } from '../../simulation/zoning/zoning-state';
import {
  decodeChunkedByteGrid,
  encodeChunkedByteGrid,
  type EncodedChunkedByteGrid,
} from './chunked-byte-grid-codec';

export const ZONING_CODEC_VERSION = 1;

export type EncodedZoningState = Readonly<{
  codecVersion: typeof ZONING_CODEC_VERSION;
  version: number;
  grid: EncodedChunkedByteGrid;
}>;

export function encodeZoningState(state: ZoningState): EncodedZoningState {
  const validated = createZoningState(state.version, state.grid);

  return {
    codecVersion: ZONING_CODEC_VERSION,
    version: validated.version,
    grid: encodeChunkedByteGrid(validated.grid),
  };
}

export function decodeZoningState(saved: EncodedZoningState): ZoningState {
  if (saved.codecVersion !== ZONING_CODEC_VERSION) {
    throw new RangeError('Unsupported zoning codec version; expected 1');
  }

  return createZoningState(saved.version, decodeChunkedByteGrid(saved.grid));
}
