import { describe, expect, it } from 'vitest';
import {
  ROAD_NETWORK_CODEC_VERSION,
  decodeRoadNetworkState,
  encodeRoadNetworkState,
  type EncodedRoadNetworkState,
} from '../../../src/persistence/codec/road-network-codec';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';

function createFixture() {
  return createRoadNetworkState({
    topologyVersion: 4,
    nextNodeId: 4,
    nextEdgeId: 3,
    nodes: [
      { id: 1, x: 10, y: 10 },
      { id: 2, x: 11, y: 10 },
      { id: 3, x: 12, y: 10 },
    ],
    edges: [
      {
        id: 1,
        nodeA: 1,
        nodeB: 2,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
      {
        id: 2,
        nodeA: 2,
        nodeB: 3,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
    ],
  });
}

describe('road network codec', () => {
  it('round-trips normalized road state through compact tuples', () => {
    const source = createFixture();
    const encoded = encodeRoadNetworkState(source);
    const restored = decodeRoadNetworkState(encoded);

    expect(encoded).toEqual({
      codecVersion: ROAD_NETWORK_CODEC_VERSION,
      topologyVersion: 4,
      nextNodeId: 4,
      nextEdgeId: 3,
      nodes: [
        [1, 10, 10],
        [2, 11, 10],
        [3, 12, 10],
      ],
      edges: [
        [1, 1, 2],
        [2, 2, 3],
      ],
    });
    expect(restored).toEqual(source);
  });

  it('rejects an unsupported codec version', () => {
    const encoded = encodeRoadNetworkState(createFixture());

    expect(() =>
      decodeRoadNetworkState({
        ...encoded,
        codecVersion: ROAD_NETWORK_CODEC_VERSION + 1,
      } as unknown as EncodedRoadNetworkState),
    ).toThrow(/codec version/i);
  });

  it('rejects duplicate node ids from durable tuples', () => {
    const encoded = encodeRoadNetworkState(createFixture());

    expect(() =>
      decodeRoadNetworkState({
        ...encoded,
        nodes: [
          [1, 10, 10],
          [1, 11, 10],
        ],
        edges: [],
        nextNodeId: 2,
        nextEdgeId: 1,
      }),
    ).toThrow(/duplicate road node id/i);
  });

  it('rejects duplicate node coordinates from durable tuples', () => {
    const encoded = encodeRoadNetworkState(createFixture());

    expect(() =>
      decodeRoadNetworkState({
        ...encoded,
        nodes: [
          [1, 10, 10],
          [2, 10, 10],
        ],
        edges: [],
        nextNodeId: 3,
        nextEdgeId: 1,
      }),
    ).toThrow(/duplicate road node coordinate/i);
  });

  it('rejects dangling edge references', () => {
    const encoded = encodeRoadNetworkState(createFixture());

    expect(() =>
      decodeRoadNetworkState({
        ...encoded,
        edges: [[1, 1, 99]],
        nextEdgeId: 2,
      }),
    ).toThrow(/existing road nodes/i);
  });

  it('rejects duplicate canonical edge pairs', () => {
    const encoded = encodeRoadNetworkState(createFixture());

    expect(() =>
      decodeRoadNetworkState({
        ...encoded,
        edges: [
          [1, 1, 2],
          [2, 1, 2],
        ],
        nextEdgeId: 3,
      }),
    ).toThrow(/duplicate road edge pair/i);
  });

  it('rejects next node ids that collide with restored nodes', () => {
    const encoded = encodeRoadNetworkState(createFixture());

    expect(() =>
      decodeRoadNetworkState({
        ...encoded,
        nextNodeId: 3,
      }),
    ).toThrow(/next node id/i);
  });

  it('rejects next edge ids that collide with restored edges', () => {
    const encoded = encodeRoadNetworkState(createFixture());

    expect(() =>
      decodeRoadNetworkState({
        ...encoded,
        nextEdgeId: 2,
      }),
    ).toThrow(/next edge id/i);
  });
});
