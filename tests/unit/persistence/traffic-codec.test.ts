import { describe, expect, it } from 'vitest';
import {
  TRAFFIC_CODEC_VERSION,
  decodeTrafficState,
  encodeTrafficState,
  type EncodedTrafficState,
} from '../../../src/persistence/codec/traffic-codec';
import { createTrafficState } from '../../../src/simulation/traffic/traffic-state';

describe('traffic codec', () => {
  it('round-trips compact traffic metadata and edge-volume tuples', () => {
    const source = createTrafficState({
      version: 4,
      roadTopologyVersion: 7,
      edgeVolumes: [
        { edgeId: 2, volume: 10 },
        { edgeId: 5, volume: 220 },
      ],
    });

    const encoded = encodeTrafficState(source);

    expect(encoded).toEqual({
      codecVersion: TRAFFIC_CODEC_VERSION,
      meta: [4, 7],
      edgeVolumes: [
        [2, 10],
        [5, 220],
      ],
    });
    expect(decodeTrafficState(encoded)).toEqual(source);
  });

  it('rejects unsupported codec versions', () => {
    const encoded = encodeTrafficState(
      createTrafficState({
        version: 0,
        roadTopologyVersion: 0,
        edgeVolumes: [],
      }),
    );

    expect(() =>
      decodeTrafficState({
        ...encoded,
        codecVersion: TRAFFIC_CODEC_VERSION + 1,
      } as unknown as EncodedTrafficState),
    ).toThrow(/traffic codec version/i);
  });

  it('rejects malformed metadata tuple length', () => {
    const invalid = {
      codecVersion: TRAFFIC_CODEC_VERSION,
      meta: [1, 2, 3],
      edgeVolumes: [],
    } as unknown as EncodedTrafficState;

    expect(() => decodeTrafficState(invalid)).toThrow(/metadata tuple.*2/i);
  });

  it('rejects malformed edge-volume tuple length', () => {
    const invalid = {
      codecVersion: TRAFFIC_CODEC_VERSION,
      meta: [1, 2],
      edgeVolumes: [[1, 10, 20]],
    } as unknown as EncodedTrafficState;

    expect(() => decodeTrafficState(invalid)).toThrow(/edge volume tuple.*2/i);
  });
});
