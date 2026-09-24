import { describe, expect, it } from 'vitest';
import {
  COMPANY_CODEC_VERSION,
  decodeCompanyState,
  encodeCompanyState,
  type EncodedCompanyState,
} from '../../../src/persistence/codec/company-codec';
import { createCompanyState } from '../../../src/simulation/economy/company-state';

function createFixture() {
  return createCompanyState({
    version: 2,
    nextCompanyId: 3,
    companies: [
      { id: 1, buildingId: 10, kind: 'commercial', jobCapacity: 8 },
      { id: 2, buildingId: 11, kind: 'industrial', jobCapacity: 12 },
    ],
  });
}

describe('company codec', () => {
  it('round-trips companies through compact tuples', () => {
    const source = createFixture();
    const encoded = encodeCompanyState(source);

    expect(encoded).toEqual({
      codecVersion: COMPANY_CODEC_VERSION,
      version: 2,
      nextCompanyId: 3,
      companies: [
        [1, 10, 1, 8],
        [2, 11, 2, 12],
      ],
    });
    expect(decodeCompanyState(encoded)).toEqual(source);
  });

  it('rejects an unsupported company codec version', () => {
    const encoded = encodeCompanyState(createFixture());

    expect(() =>
      decodeCompanyState({
        ...encoded,
        codecVersion: COMPANY_CODEC_VERSION + 1,
      } as unknown as EncodedCompanyState),
    ).toThrow(/company codec version/i);
  });

  it('rejects malformed tuple lengths instead of silently truncating', () => {
    const encoded = encodeCompanyState(createFixture());
    const invalid = {
      ...encoded,
      companies: [[1, 10, 1, 8, 999]],
      nextCompanyId: 2,
    } as unknown as EncodedCompanyState;

    expect(() => decodeCompanyState(invalid)).toThrow(/company tuple.*4/i);
  });

  it.each([0, 3])('rejects invalid durable company kind code %s', (kindCode) => {
    const encoded = encodeCompanyState(createFixture());
    const invalid = {
      ...encoded,
      companies: [[1, 10, kindCode, 8]],
      nextCompanyId: 2,
    } as unknown as EncodedCompanyState;

    expect(() => decodeCompanyState(invalid)).toThrow(/company kind code/i);
  });
});
