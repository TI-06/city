import type { RoadNetworkState } from '../roads/road-network-state';
import { getPublicServiceCoverageDistance } from './public-service-catalog';
import type { PublicServiceKind, PublicServiceState } from './public-service-state';

const SERVICE_KINDS: readonly PublicServiceKind[] = [
  'park',
  'school',
  'fire',
  'police',
  'hospital',
];

const ACCESS_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];

export type ServiceCoverageIndex = Readonly<{
  roadTopologyVersion: number;
  publicServiceVersion: number;
  getServiceDistanceAtRoadNode: (
    kind: PublicServiceKind,
    nodeId: number,
  ) => number | undefined;
  isRoadNodeCovered: (kind: PublicServiceKind, nodeId: number) => boolean;
  findBuildingAccessNode: (x: number, y: number) => number | undefined;
  isBuildingCovered: (kind: PublicServiceKind, x: number, y: number) => boolean;
}>;

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Computes all five coverage maps once per road/service snapshot.
 * Distances are unweighted road edges. No routes or caches are serialized.
 * Callers should reuse the result until either source version changes.
 */
export function createServiceCoverageIndex(
  roads: RoadNetworkState,
  publicServices: PublicServiceState,
): ServiceCoverageIndex {
  const nodeIdByCoordinate = new Map<string, number>();
  const adjacency = new Map<number, number[]>();

  for (const node of roads.nodes) {
    nodeIdByCoordinate.set(coordinateKey(node.x, node.y), node.id);
    adjacency.set(node.id, []);
  }

  for (const edge of roads.edges) {
    adjacency.get(edge.nodeA)!.push(edge.nodeB);
    adjacency.get(edge.nodeB)!.push(edge.nodeA);
  }
  for (const neighbors of adjacency.values()) {
    neighbors.sort((a, b) => a - b);
  }

  const findBuildingAccessNode = (x: number, y: number): number | undefined => {
    let selected: number | undefined;
    for (const [dx, dy] of ACCESS_OFFSETS) {
      const candidate = nodeIdByCoordinate.get(coordinateKey(x + dx, y + dy));
      if (candidate !== undefined && (selected === undefined || candidate < selected)) {
        selected = candidate;
      }
    }
    return selected;
  };

  const distancesByKind = new Map<PublicServiceKind, ReadonlyMap<number, number>>();

  for (const kind of SERVICE_KINDS) {
    const distances = new Map<number, number>();
    const queue: number[] = [];

    for (const service of publicServices.services) {
      if (service.kind !== kind) continue;
      const sourceNode = findBuildingAccessNode(service.x, service.y);
      if (sourceNode !== undefined && !distances.has(sourceNode)) {
        distances.set(sourceNode, 0);
        queue.push(sourceNode);
      }
    }

    let index = 0;
    while (index < queue.length) {
      const nodeId = queue[index]!;
      index += 1;
      const nextDistance = distances.get(nodeId)! + 1;

      for (const neighborId of adjacency.get(nodeId) ?? []) {
        if (distances.has(neighborId)) continue;
        distances.set(neighborId, nextDistance);
        queue.push(neighborId);
      }
    }

    distancesByKind.set(kind, distances);
  }

  const getServiceDistanceAtRoadNode = (
    kind: PublicServiceKind,
    nodeId: number,
  ): number | undefined => distancesByKind.get(kind)?.get(nodeId);

  const isRoadNodeCovered = (kind: PublicServiceKind, nodeId: number): boolean => {
    const distance = getServiceDistanceAtRoadNode(kind, nodeId);
    return distance !== undefined && distance <= getPublicServiceCoverageDistance(kind);
  };

  return {
    roadTopologyVersion: roads.topologyVersion,
    publicServiceVersion: publicServices.version,
    getServiceDistanceAtRoadNode,
    isRoadNodeCovered,
    findBuildingAccessNode,
    isBuildingCovered: (kind, x, y) => {
      const nodeId = findBuildingAccessNode(x, y);
      return nodeId !== undefined && isRoadNodeCovered(kind, nodeId);
    },
  };
}
