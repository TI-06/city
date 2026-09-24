import { describe, expect, it } from 'vitest';
import {
  HOUSEHOLD_CODEC_VERSION,
  decodeHouseholdState,
  encodeHouseholdState,
  type EncodedHouseholdState,
} from '../../../src/persistence/codec/household-codec';
import { createHouseholdState } from '../../../src/simulation/population/household-state';

function createFixture() {
  return createHouseholdState({
    version: 2,
    nextHouseholdId: 3,
    households: [
      { id: 1, homeBuildingId: 10, memberCount: 1, workerCount: 1 },
      { id: 2, homeBuildingId: 11, memberCount: 4, workerCount: 2 },
    ],
  });
}

describe('household codec', () => {
  it('round-trips households through compact tuples', () => {
    const source = createFixture();
    const encoded = encodeHouseholdState(source);

    expect(encoded).toEqual({
      codecVersion: HOUSEHOLD_CODEC_VERSION,
      version: 2,
      nextHouseholdId: 3,
      households: [
        [1, 10, 1, 1],
        [2, 11, 4, 2],
      ],
    });
    expect(decodeHouseholdState(encoded)).toEqual(source);
  });

  it('rejects an unsupported household codec version', () => {
    const encoded = encodeHouseholdState(createFixture());

    expect(() =>
      decodeHouseholdState({
        ...encoded,
        codecVersion: HOUSEHOLD_CODEC_VERSION + 1,
      } as unknown as EncodedHouseholdState),
    ).toThrow(/household codec version/i);
  });

  it('rejects malformed tuple lengths instead of silently truncating', () => {
    const encoded = encodeHouseholdState(createFixture());
    const invalid = {
      ...encoded,
      households: [[1, 10, 2, 1, 999]],
      nextHouseholdId: 2,
    } as unknown as EncodedHouseholdState;

    expect(() => decodeHouseholdState(invalid)).toThrow(/household tuple.*4/i);
  });

  it('revalidates duplicate home building references on decode', () => {
    const encoded = encodeHouseholdState(createFixture());
    const invalid = {
      ...encoded,
      households: [
        [1, 10, 2, 1],
        [2, 10, 3, 2],
      ],
    } as unknown as EncodedHouseholdState;

    expect(() => decodeHouseholdState(invalid)).toThrow(/duplicate household home building/i);
  });
});
