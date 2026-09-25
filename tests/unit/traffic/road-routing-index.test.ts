import { describe, expect, it } from 'vitest';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import { createRoadRoutingIndex } from '../../../src/simulation/traffic/road-routing-index';

function createFixture() {
  return createRoadNetworkState({
    topologyVersion: 7,
    nextNodeId: 6,
    nextEdgeId: 5,
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 0, y: 1 },
      { id: 4, x: 1, y: 1 },
      { id: 5, x: 4, y: 4 },
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
        nodeA: 1,
        nodeB: 3,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
      {
        id: 3,
        nodeA: 2,
        nodeB: 4,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
      {
        id: 4,
        nodeA: 3,
        nodeB: 4,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
    ],
  });
}

describe('road routing index', () => {
  it('tracks the road topology version', () => {
    expect(createRoadRoutingIndex(createFixture()).topologyVersion).toBe(7);
  });

  it('chooses the lowest-ID orthogonally adjacent road node for building access', () => {
    const roads = createRoadNetworkState({
      topologyVersion: 1,
      nextNodeId: 10,
      nextEdgeId: 1,
      nodes: [
        { id: 9, x: 1, y: 0 },
        { id: 3, x: 0, y: 1 },
      ],
      edges: [],
    });
    const index = createRoadRoutingIndex(roads);

    expect(index.findBuildingAccessNode(1, 1)).toBe(3);
    expect(index.findBuildingAccessNode(5, 5)).toBeUndefined();
  });

  it('finds deterministic shortest-path edge IDs with stable tie-breaking', () => {
    const index = createRoadRoutingIndex(createFixture());

    expect(index.findShortestPathEdgeIds(1, 4)).toEqual([1, 3]);
    expect(index.findShortestPathEdgeIds(4, 1)).toEqual([3, 1]);
  });

  it('returns an empty route when origin and destination are the same node', () => {
    const index = createRoadRoutingIndex(createFixture());
    expect(index.findShortestPathEdgeIds(2, 2)).toEqual([]);
  });

  it('returns undefined for disconnected or unknown destinations', () => {
    const index = createRoadRoutingIndex(createFixture());

    expect(index.findShortestPathEdgeIds(1, 5)).toBeUndefined();
    expect(index.findShortestPathEdgeIds(1, 999)).toBeUndefined();
  });
});
