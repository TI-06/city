import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_DEMAND_CODEC_VERSION,
  decodeDevelopmentDemandState,
  encodeDevelopmentDemandState,
  type EncodedDevelopmentDemandState,
} from '../../../src/persistence/codec/development-demand-codec';
import { createDevelopmentDemandState } from '../../../src/simulation/development/development-demand-state';

function createFixture() {
  return createDevelopmentDemandState({
    version: 9,
    residential: 10,
    commercial: 55,
    industrial: 100,
  });
}

describe('development demand codec', () => {
  it('round-trips demand through one compact tuple', () => {
    const source = createFixture();
    const encoded = encodeDevelopmentDemandState(source);

    expect(encoded).toEqual({
      codecVersion: DEVELOPMENT_DEMAND_CODEC_VERSION,
      values: [9, 10, 55, 100],
    });
    expect(decodeDevelopmentDemandState(encoded)).toEqual(source);
  });

  it('rejects an unsupported codec version', () => {
    const encoded = encodeDevelopmentDemandState(createFixture());

    expect(() =>
      decodeDevelopmentDemandState({
        ...encoded,
        codecVersion: DEVELOPMENT_DEMAND_CODEC_VERSION + 1,
      } as unknown as EncodedDevelopmentDemandState),
    ).toThrow(/development demand codec version/i);
  });

  it('rejects malformed tuple lengths instead of silently truncating', () => {
    const invalid = {
      codecVersion: DEVELOPMENT_DEMAND_CODEC_VERSION,
      values: [9, 10, 55, 100, 999],
    } as unknown as EncodedDevelopmentDemandState;

    expect(() => decodeDevelopmentDemandState(invalid)).toThrow(/demand tuple.*4/i);
  });

  it('rejects invalid values after decoding', () => {
    const invalid = {
      codecVersion: DEVELOPMENT_DEMAND_CODEC_VERSION,
      values: [0, 101, 55, 100],
    } as unknown as EncodedDevelopmentDemandState;

    expect(() => decodeDevelopmentDemandState(invalid)).toThrow(/residential demand/i);
  });
});
