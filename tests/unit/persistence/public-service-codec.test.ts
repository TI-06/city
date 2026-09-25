import { describe, expect, it } from 'vitest';
import {
  PUBLIC_SERVICE_CODEC_VERSION,
  decodePublicServiceState,
  encodePublicServiceState,
  type EncodedPublicServiceState,
} from '../../../src/persistence/codec/public-service-codec';
import { createPublicServiceState } from '../../../src/simulation/services/public-service-state';

function createFixture() {
  return createPublicServiceState({
    version: 5,
    nextServiceId: 6,
    services: [
      { id: 1, x: 10, y: 20, kind: 'park' },
      { id: 2, x: 11, y: 20, kind: 'school' },
      { id: 3, x: 12, y: 20, kind: 'fire' },
      { id: 4, x: 13, y: 20, kind: 'police' },
      { id: 5, x: 14, y: 20, kind: 'hospital' },
    ],
  });
}

describe('public service codec', () => {
  it('round-trips services through compact tuples', () => {
    const source = createFixture();
    const encoded = encodePublicServiceState(source);

    expect(encoded).toEqual({
      codecVersion: PUBLIC_SERVICE_CODEC_VERSION,
      meta: [5, 6],
      services: [
        [1, 10, 20, 1],
        [2, 11, 20, 2],
        [3, 12, 20, 3],
        [4, 13, 20, 4],
        [5, 14, 20, 5],
      ],
    });
    expect(decodePublicServiceState(encoded)).toEqual(source);
  });

  it('rejects unsupported codec versions', () => {
    const encoded = encodePublicServiceState(createFixture());

    expect(() =>
      decodePublicServiceState({
        ...encoded,
        codecVersion: PUBLIC_SERVICE_CODEC_VERSION + 1,
      } as unknown as EncodedPublicServiceState),
    ).toThrow(/public service codec version/i);
  });

  it('rejects malformed metadata tuple length', () => {
    const invalid = {
      codecVersion: PUBLIC_SERVICE_CODEC_VERSION,
      meta: [1, 2, 3],
      services: [],
    } as unknown as EncodedPublicServiceState;

    expect(() => decodePublicServiceState(invalid)).toThrow(/metadata tuple.*2/i);
  });

  it('rejects malformed service tuple length', () => {
    const encoded = encodePublicServiceState(createFixture());
    const invalid = {
      ...encoded,
      meta: [1, 2],
      services: [[1, 10, 20, 1, 999]],
    } as unknown as EncodedPublicServiceState;

    expect(() => decodePublicServiceState(invalid)).toThrow(/service tuple.*4/i);
  });

  it.each([0, 6])('rejects invalid service kind code %s', (kindCode) => {
    const invalid = {
      codecVersion: PUBLIC_SERVICE_CODEC_VERSION,
      meta: [1, 2],
      services: [[1, 10, 20, kindCode]],
    } as unknown as EncodedPublicServiceState;

    expect(() => decodePublicServiceState(invalid)).toThrow(/service kind code/i);
  });
});
