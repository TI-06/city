import { describe, expect, it } from 'vitest';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import { createServiceCoverageIndex } from '../../../src/simulation/services/service-coverage-index';
import { createPublicServiceState } from '../../../src/simulation/services/public-service-state';

function createLinearRoads(length = 40) {
  return createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId: length + 1,
    nextEdgeId: length,
    nodes: Array.from({ length }, (_, index) => ({
      id: index + 1,
      x: index,
      y: 0,
    })),
    edges: Array.from({ length: length - 1 }, (_, index) => ({
      id: index + 1,
      nodeA: index + 1,
      nodeB: index + 2,
      roadType: 'two-lane' as const,
      laneCount: 2 as const,
      lengthCells: 1 as const,
    })),
  });
}

describe('service coverage index', () => {
  it('uses multi-source shortest road distance for the nearest service', () => {
    const roads = createLinearRoads(20);
    const services = createPublicServiceState({
      version: 2,
      nextServiceId: 3,
      services: [
        { id: 1, x: 0, y: 1, kind: 'fire' },
        { id: 2, x: 10, y: 1, kind: 'fire' },
      ],
    });

    const index = createServiceCoverageIndex(roads, services);

    expect(index.roadTopologyVersion).toBe(1);
    expect(index.publicServiceVersion).toBe(2);
    expect(index.getServiceDistanceAtRoadNode('fire', 1)).toBe(0);
    expect(index.getServiceDistanceAtRoadNode('fire', 6)).toBe(5);
    expect(index.getServiceDistanceAtRoadNode('fire', 11)).toBe(0);
    expect(index.getServiceDistanceAtRoadNode('fire', 9)).toBe(2);
  });

  it('includes the exact coverage boundary and excludes boundary plus one', () => {
    const roads = createLinearRoads(40);
    const services = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 0, y: 1, kind: 'park' }],
    });
    const index = createServiceCoverageIndex(roads, services);

    expect(index.getServiceDistanceAtRoadNode('park', 9)).toBe(8);
    expect(index.isRoadNodeCovered('park', 9)).toBe(true);
    expect(index.getServiceDistanceAtRoadNode('park', 10)).toBe(9);
    expect(index.isRoadNodeCovered('park', 10)).toBe(false);
  });

  it('keeps unreachable components uncovered', () => {
    const roads = createRoadNetworkState({
      topologyVersion: 1,
      nextNodeId: 5,
      nextEdgeId: 3,
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 10, y: 0 },
        { id: 4, x: 11, y: 0 },
      ],
      edges: [
        { id: 1, nodeA: 1, nodeB: 2, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
        { id: 2, nodeA: 3, nodeB: 4, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
      ],
    });
    const services = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 0, y: 1, kind: 'hospital' }],
    });

    const index = createServiceCoverageIndex(roads, services);

    expect(index.getServiceDistanceAtRoadNode('hospital', 2)).toBe(1);
    expect(index.getServiceDistanceAtRoadNode('hospital', 3)).toBeUndefined();
    expect(index.isRoadNodeCovered('hospital', 3)).toBe(false);
  });

  it('uses the lowest-ID orthogonally adjacent road node for building access', () => {
    const roads = createRoadNetworkState({
      topologyVersion: 1,
      nextNodeId: 5,
      nextEdgeId: 5,
      nodes: [
        { id: 4, x: 1, y: 0 },
        { id: 2, x: 0, y: 1 },
        { id: 3, x: 2, y: 1 },
        { id: 1, x: 1, y: 2 },
      ],
      edges: [
        { id: 1, nodeA: 2, nodeB: 4, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
        { id: 2, nodeA: 3, nodeB: 4, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
        { id: 3, nodeA: 1, nodeB: 2, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
        { id: 4, nodeA: 1, nodeB: 3, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
      ],
    });
    const services = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 0, y: 2, kind: 'police' }],
    });
    const index = createServiceCoverageIndex(roads, services);

    expect(index.findBuildingAccessNode(1, 1)).toBe(1);
    expect(index.findBuildingAccessNode(10, 10)).toBeUndefined();
  });

  it('reports building coverage through its selected road access node', () => {
    const roads = createLinearRoads(20);
    const services = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 0, y: 1, kind: 'school' }],
    });
    const index = createServiceCoverageIndex(roads, services);

    expect(index.isBuildingCovered('school', 5, 1)).toBe(true);
    expect(index.isBuildingCovered('fire', 5, 1)).toBe(false);
    expect(index.isBuildingCovered('school', 30, 30)).toBe(false);
  });

  it('returns uncovered immediately when no service of that kind exists', () => {
    const roads = createLinearRoads(20);
    const services = createPublicServiceState({
      version: 1,
      nextServiceId: 2,
      services: [{ id: 1, x: 0, y: 1, kind: 'park' }],
    });
    const index = createServiceCoverageIndex(roads, services);

    expect(index.getServiceDistanceAtRoadNode('hospital', 1)).toBeUndefined();
    expect(index.isRoadNodeCovered('hospital', 1)).toBe(false);
  });
});
