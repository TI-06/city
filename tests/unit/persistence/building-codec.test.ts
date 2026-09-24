import { describe, expect, it } from 'vitest';
import {
  BUILDING_CODEC_VERSION,
  decodeBuildingState,
  encodeBuildingState,
  type EncodedBuildingState,
} from '../../../src/persistence/codec/building-codec';
import { createBuildingState } from '../../../src/simulation/buildings/building-state';

function createFixture() {
  return createBuildingState({
    version: 3,
    nextBuildingId: 4,
    buildings: [
      { id: 1, x: 10, y: 20, use: 'residential', level: 1 },
      { id: 2, x: 11, y: 20, use: 'commercial', level: 1 },
      { id: 3, x: 12, y: 20, use: 'industrial', level: 1 },
    ],
  });
}

describe('building codec', () => {
  it('round-trips buildings through compact tuples', () => {
    const source = createFixture();
    const encoded = encodeBuildingState(source);

    expect(encoded).toEqual({
      codecVersion: BUILDING_CODEC_VERSION,
      version: 3,
      nextBuildingId: 4,
      buildings: [
        [1, 10, 20, 1, 1],
        [2, 11, 20, 2, 1],
        [3, 12, 20, 3, 1],
      ],
    });
    expect(decodeBuildingState(encoded)).toEqual(source);
  });

  it('rejects an unsupported building codec version', () => {
    const encoded = encodeBuildingState(createFixture());

    expect(() =>
      decodeBuildingState({
        ...encoded,
        codecVersion: BUILDING_CODEC_VERSION + 1,
      } as unknown as EncodedBuildingState),
    ).toThrow(/building codec version/i);
  });

  it('rejects malformed tuple lengths instead of silently truncating', () => {
    const encoded = encodeBuildingState(createFixture());
    const invalid = {
      ...encoded,
      buildings: [[1, 10, 20, 1, 1, 999]],
      nextBuildingId: 2,
    } as unknown as EncodedBuildingState;

    expect(() => decodeBuildingState(invalid)).toThrow(/building tuple.*5/i);
  });

  it.each([0, 4])('rejects invalid durable building use code %s', (useCode) => {
    const encoded = encodeBuildingState(createFixture());
    const invalid = {
      ...encoded,
      buildings: [[1, 10, 20, useCode, 1]],
      nextBuildingId: 2,
    } as unknown as EncodedBuildingState;

    expect(() => decodeBuildingState(invalid)).toThrow(/building use code/i);
  });
});
