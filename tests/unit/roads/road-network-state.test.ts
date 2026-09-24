import { describe, expect, it } from 'vitest';
import {
  createEmptyRoadNetwork,
  createRoadNetworkState,
  findRoadNodeAt,
  hasRoadEdge,
  type RoadEdge,
  type RoadNode,
} from '../../../src/simulation/roads/road-network-state';

const VALID_NODES: readonly RoadNode[] = [
  { id: 1, x: 4, y: 5 },
  { id: 2, x: 5, y: 5 },
];

const VALID_EDGES: readonly RoadEdge[] = [
  {
    id: 1,
    nodeA: 1,
    nodeB: 2,
    roadType: 'two-lane',
    laneCount: 2,
    lengthCells: 1,
  },
];

function createValidNetwork() {
  return createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId: 3,
    nextEdgeId: 2,
    nodes: VALID_NODES,
    edges: VALID_EDGES,
  });
}

describe('road network state', () => {
  it('creates the canonical empty network', () => {
    expect(createEmptyRoadNetwork()).toEqual({
      topologyVersion: 0,
      nextNodeId: 1,
      nextEdgeId: 1,
      nodes: [],
      edges: [],
    });
  });

  it('accepts a normalized valid network and supports lookups', () => {
    const state = createValidNetwork();

    expect(findRoadNodeAt(state, 4, 5)?.id).toBe(1);
    expect(findRoadNodeAt(state, 99, 99)).toBeUndefined();
    expect(hasRoadEdge(state, 1, 2)).toBe(true);
    expect(hasRoadEdge(state, 2, 1)).toBe(true);
    expect(hasRoadEdge(state, 1, 3)).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid node id %s',
    (id) => {
      expect(() =>
        createRoadNetworkState({
          topologyVersion: 0,
          nextNodeId: 3,
          nextEdgeId: 1,
          nodes: [
            { id, x: 0, y: 0 },
            { id: 2, x: 1, y: 0 },
          ],
          edges: [],
        }),
      ).toThrow(/node id/i);
    },
  );

  it('rejects duplicate node ids', () => {
    expect(() =>
      createRoadNetworkState({
        topologyVersion: 0,
        nextNodeId: 3,
        nextEdgeId: 1,
        nodes: [
          { id: 1, x: 0, y: 0 },
          { id: 1, x: 1, y: 0 },
        ],
        edges: [],
      }),
    ).toThrow(/duplicate road node id/i);
  });

  it('rejects duplicate node coordinates', () => {
    expect(() =>
      createRoadNetworkState({
        topologyVersion: 0,
        nextNodeId: 3,
        nextEdgeId: 1,
        nodes: [
          { id: 1, x: 0, y: 0 },
          { id: 2, x: 0, y: 0 },
        ],
        edges: [],
      }),
    ).toThrow(/duplicate road node coordinate/i);
  });

  it.each([
    [1.5, 0],
    [0, Number.NaN],
    [Number.POSITIVE_INFINITY, 0],
  ])('rejects invalid node coordinate (%s, %s)', (x, y) => {
    expect(() =>
      createRoadNetworkState({
        topologyVersion: 0,
        nextNodeId: 2,
        nextEdgeId: 1,
        nodes: [{ id: 1, x, y }],
        edges: [],
      }),
    ).toThrow(/node coordinate/i);
  });

  it('rejects duplicate edge ids', () => {
    expect(() =>
      createRoadNetworkState({
        topologyVersion: 1,
        nextNodeId: 4,
        nextEdgeId: 2,
        nodes: [
          { id: 1, x: 0, y: 0 },
          { id: 2, x: 1, y: 0 },
          { id: 3, x: 2, y: 0 },
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
            id: 1,
            nodeA: 2,
            nodeB: 3,
            roadType: 'two-lane',
            laneCount: 2,
            lengthCells: 1,
          },
        ],
      }),
    ).toThrow(/duplicate road edge id/i);
  });

  it('rejects non-canonical edge endpoint order', () => {
    expect(() =>
      createRoadNetworkState({
        topologyVersion: 1,
        nextNodeId: 3,
        nextEdgeId: 2,
        nodes: VALID_NODES,
        edges: [
          {
            ...VALID_EDGES[0]!,
            nodeA: 2,
            nodeB: 1,
          },
        ],
      }),
    ).toThrow(/nodea.*less than nodeb/i);
  });

  it('rejects a dangling edge endpoint', () => {
    expect(() =>
      createRoadNetworkState({
        topologyVersion: 1,
        nextNodeId: 3,
        nextEdgeId: 2,
        nodes: VALID_NODES,
        edges: [
          {
            ...VALID_EDGES[0]!,
            nodeB: 99,
          },
        ],
      }),
    ).toThrow(/existing road nodes/i);
  });

  it('rejects edges whose endpoint coordinates are not orthogonally adjacent', () => {
    expect(() =>
      createRoadNetworkState({
        topologyVersion: 1,
        nextNodeId: 3,
        nextEdgeId: 2,
        nodes: [
          { id: 1, x: 0, y: 0 },
          { id: 2, x: 1, y: 1 },
        ],
        edges: VALID_EDGES,
      }),
    ).toThrow(/orthogonally adjacent/i);
  });

  it('rejects duplicate unordered edge pairs', () => {
    expect(() =>
      createRoadNetworkState({
        topologyVersion: 1,
        nextNodeId: 3,
        nextEdgeId: 3,
        nodes: VALID_NODES,
        edges: [
          VALID_EDGES[0]!,
          {
            ...VALID_EDGES[0]!,
            id: 2,
          },
        ],
      }),
    ).toThrow(/duplicate road edge pair/i);
  });

  it.each([
    [{ ...VALID_EDGES[0]!, roadType: 'other' }, /road type/i],
    [{ ...VALID_EDGES[0]!, laneCount: 4 }, /lane count/i],
    [{ ...VALID_EDGES[0]!, lengthCells: 2 }, /length/i],
  ])('rejects an invalid two-lane edge shape', (edge, message) => {
    expect(() =>
      createRoadNetworkState({
        topologyVersion: 1,
        nextNodeId: 3,
        nextEdgeId: 2,
        nodes: VALID_NODES,
        edges: [edge as RoadEdge],
      }),
    ).toThrow(message);
  });

  it('requires next node and edge ids to be above existing ids', () => {
    expect(() =>
      createRoadNetworkState({
        topologyVersion: 1,
        nextNodeId: 2,
        nextEdgeId: 2,
        nodes: VALID_NODES,
        edges: VALID_EDGES,
      }),
    ).toThrow(/next node id/i);

    expect(() =>
      createRoadNetworkState({
        topologyVersion: 1,
        nextNodeId: 3,
        nextEdgeId: 1,
        nodes: VALID_NODES,
        edges: VALID_EDGES,
      }),
    ).toThrow(/next edge id/i);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid topology version %s',
    (topologyVersion) => {
      expect(() =>
        createRoadNetworkState({
          topologyVersion,
          nextNodeId: 1,
          nextEdgeId: 1,
          nodes: [],
          edges: [],
        }),
      ).toThrow(/topology version/i);
    },
  );
});
