import { describe, expect, it } from 'vitest';
import {
  applyRoadBuild,
} from '../../../src/simulation/roads/apply-road-build';
import type { RoadBuildPlan } from '../../../src/simulation/roads/road-build-plan';
import {
  createEmptyRoadNetwork,
  createRoadNetworkState,
} from '../../../src/simulation/roads/road-network-state';

function twoCellPlan(): RoadBuildPlan {
  return {
    nodesToAdd: [
      { id: 1, x: 10, y: 10 },
      { id: 2, x: 11, y: 10 },
    ],
    edgesToAdd: [
      {
        id: 1,
        nodeA: 1,
        nodeB: 2,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
    ],
    constructionCost: 200,
  };
}

describe('applyRoadBuild', () => {
  it('applies a non-empty plan immutably and advances ids once', () => {
    const source = createEmptyRoadNetwork();
    const before = structuredClone(source);

    const result = applyRoadBuild(source, twoCellPlan());

    expect(source).toEqual(before);
    expect(result).toEqual({
      topologyVersion: 1,
      nextNodeId: 3,
      nextEdgeId: 2,
      nodes: [
        { id: 1, x: 10, y: 10 },
        { id: 2, x: 11, y: 10 },
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
      ],
    });
    expect(result).not.toBe(source);
    expect(result.nodes).not.toBe(source.nodes);
    expect(result.edges).not.toBe(source.edges);
  });

  it('appends nodes and edges after existing ids in ascending order', () => {
    const source = createRoadNetworkState({
      topologyVersion: 7,
      nextNodeId: 3,
      nextEdgeId: 2,
      nodes: [
        { id: 1, x: 10, y: 10 },
        { id: 2, x: 11, y: 10 },
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
      ],
    });

    const result = applyRoadBuild(source, {
      nodesToAdd: [
        { id: 3, x: 12, y: 10 },
        { id: 4, x: 13, y: 10 },
      ],
      edgesToAdd: [
        {
          id: 2,
          nodeA: 2,
          nodeB: 3,
          roadType: 'two-lane',
          laneCount: 2,
          lengthCells: 1,
        },
        {
          id: 3,
          nodeA: 3,
          nodeB: 4,
          roadType: 'two-lane',
          laneCount: 2,
          lengthCells: 1,
        },
      ],
      constructionCost: 200,
    });

    expect(result.topologyVersion).toBe(8);
    expect(result.nextNodeId).toBe(5);
    expect(result.nextEdgeId).toBe(4);
    expect(result.nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect(result.edges.map((edge) => edge.id)).toEqual([1, 2, 3]);
  });

  it('returns the original state for an empty no-op plan', () => {
    const source = createEmptyRoadNetwork();

    const result = applyRoadBuild(source, {
      nodesToAdd: [],
      edgesToAdd: [],
      constructionCost: 0,
    });

    expect(result).toBe(source);
    expect(result.topologyVersion).toBe(0);
    expect(result.nextNodeId).toBe(1);
    expect(result.nextEdgeId).toBe(1);
  });

  it('rejects a stale node allocation before changing topology', () => {
    const source = createEmptyRoadNetwork();
    const before = structuredClone(source);

    expect(() =>
      applyRoadBuild(source, {
        nodesToAdd: [{ id: 2, x: 10, y: 10 }],
        edgesToAdd: [],
        constructionCost: 100,
      }),
    ).toThrow(/node.*next.*id|expected node id/i);

    expect(source).toEqual(before);
  });

  it('rejects a stale edge allocation before changing topology', () => {
    const source = createRoadNetworkState({
      topologyVersion: 1,
      nextNodeId: 3,
      nextEdgeId: 2,
      nodes: [
        { id: 1, x: 10, y: 10 },
        { id: 2, x: 11, y: 10 },
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
      ],
    });

    expect(() =>
      applyRoadBuild(source, {
        nodesToAdd: [{ id: 3, x: 12, y: 10 }],
        edgesToAdd: [
          {
            id: 3,
            nodeA: 2,
            nodeB: 3,
            roadType: 'two-lane',
            laneCount: 2,
            lengthCells: 1,
          },
        ],
        constructionCost: 100,
      }),
    ).toThrow(/edge.*next.*id|expected edge id/i);
  });

  it('rejects a plan with unsorted allocated ids', () => {
    const source = createEmptyRoadNetwork();

    expect(() =>
      applyRoadBuild(source, {
        nodesToAdd: [
          { id: 1, x: 10, y: 10 },
          { id: 3, x: 11, y: 10 },
        ],
        edgesToAdd: [],
        constructionCost: 200,
      }),
    ).toThrow(/node.*id/i);
  });
});
