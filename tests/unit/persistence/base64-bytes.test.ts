import { describe, expect, it } from 'vitest';
import { decodeBytesBase64, encodeBytesBase64 } from '../../../src/persistence/codec/base64-bytes';

const BYTE_VECTORS: readonly (readonly number[])[] = [
  [],
  [0],
  [0, 1, 2, 127, 128, 254, 255],
  Array.from({ length: 256 }, (_, index) => index),
];

describe('Base64 byte codec', () => {
  it('round-trips representative byte vectors', () => {
    for (const values of BYTE_VECTORS) {
      const bytes = Uint8Array.from(values);
      const encoded = encodeBytesBase64(bytes);
      const decoded = decodeBytesBase64(encoded);

      expect(Array.from(decoded)).toEqual(values);
    }
  });

  it.each(['***not-base64***', 'abcde', 'a===', 'A A=='])(
    'rejects malformed Base64 %s',
    (encoded) => {
      expect(() => decodeBytesBase64(encoded)).toThrow(/base64/i);
    },
  );
});
