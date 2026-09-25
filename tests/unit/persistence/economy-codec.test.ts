import { describe, expect, it } from 'vitest';
import {
  ECONOMY_CODEC_VERSION,
  decodeEconomyState,
  encodeEconomyState,
  type EncodedEconomyState,
} from '../../../src/persistence/codec/economy-codec';
import { createEconomyState } from '../../../src/simulation/economy/economy-state';

describe('economy codec', () => {
  it('round-trips the economy through a compact tuple', () => {
    const source = createEconomyState({
      version: 7,
      treasury: -12345,
    });

    const encoded = encodeEconomyState(source);

    expect(encoded).toEqual({
      codecVersion: ECONOMY_CODEC_VERSION,
      values: [7, -12345],
    });
    expect(decodeEconomyState(encoded)).toEqual(source);
  });

  it('rejects an unsupported economy codec version', () => {
    const encoded = encodeEconomyState(createEconomyState({ version: 0, treasury: 10 }));

    expect(() =>
      decodeEconomyState({
        ...encoded,
        codecVersion: ECONOMY_CODEC_VERSION + 1,
      } as unknown as EncodedEconomyState),
    ).toThrow(/economy codec version/i);
  });

  it('rejects malformed tuple length', () => {
    const invalid = {
      codecVersion: ECONOMY_CODEC_VERSION,
      values: [1, 100, 999],
    } as unknown as EncodedEconomyState;

    expect(() => decodeEconomyState(invalid)).toThrow(/economy tuple.*2/i);
  });

  it('rejects non-numeric tuple values', () => {
    const invalid = {
      codecVersion: ECONOMY_CODEC_VERSION,
      values: [1, '100'],
    } as unknown as EncodedEconomyState;

    expect(() => decodeEconomyState(invalid)).toThrow(/economy tuple.*numbers/i);
  });
});
