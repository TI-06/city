import type { RoadNetworkState, RoadNode } from '../roads/road-network-state';

type RouteNeighbor = Readonly<{
  nodeId: number;
  edgeId: number;
}>;

export type RoadRoutingIndex = Readonly<{
  topologyVersion: number;
  findBuildingAccessNode: (x: number, y: number) => number | undefined;
  findShortestPathEdgeIds: (
    originNodeId: number,
    destinationNodeId: number,
  ) => readonly number[] | undefined;
}>;

const ACCESS_OFFSETS: readonly (readonly [x: number, y: number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

function appendNeighbor(
  adjacency: Map<number, RouteNeighbor[]>,
  nodeId: number,
  neighbor: RouteNeighbor,
): void {
  const current = adjacency.get(nodeId);
  if (current === undefined) {
    adjacency.set(nodeId, [neighbor]);
    return;
  }
  current.push(neighbor);
}

function reconstructPath(
  originNodeId: number,
  destinationNodeId: number,
  predecessor: ReadonlyMap<number, Readonly<{ nodeId: number; edgeId: number }>>,
): readonly number[] {
  const edgeIds: number[] = [];
  let currentNodeId = destinationNodeId;

  while (currentNodeId !== originNodeId) {
    const previous = predecessor.get(currentNodeId);
    if (previous === undefined) {
      throw new Error('Traffic route predecessor chain is incomplete');
    }

    edgeIds.push(previous.edgeId);
    currentNodeId = previous.nodeId;
  }

  edgeIds.reverse();
  return edgeIds;
}

export function createRoadRoutingIndex(roads: RoadNetworkState): RoadRoutingIndex {
  const nodeByCoordinate = new Map<string, RoadNode>();
  const nodeIds = new Set<number>();
  const adjacency = new Map<number, RouteNeighbor[]>();

  for (const node of roads.nodes) {
    nodeByCoordinate.set(coordinateKey(node.x, node.y), node);
    nodeIds.add(node.id);
    adjacency.set(node.id, []);
  }

  for (const edge of roads.edges) {
    appendNeighbor(adjacency, edge.nodeA, {
      nodeId: edge.nodeB,
      edgeId: edge.id,
    });
    appendNeighbor(adjacency, edge.nodeB, {
      nodeId: edge.nodeA,
      edgeId: edge.id,
    });
  }

  for (const neighbors of adjacency.values()) {
    neighbors.sort((left, right) => left.edgeId - right.edgeId || left.nodeId - right.nodeId);
  }

  return {
    topologyVersion: roads.topologyVersion,

    findBuildingAccessNode: (x, y) => {
      let selected: RoadNode | undefined;

      for (const [offsetX, offsetY] of ACCESS_OFFSETS) {
        const node = nodeByCoordinate.get(coordinateKey(x + offsetX, y + offsetY));
        if (node !== undefined && (selected === undefined || node.id < selected.id)) {
          selected = node;
        }
      }

      return selected?.id;
    },

    findShortestPathEdgeIds: (originNodeId, destinationNodeId) => {
      if (!nodeIds.has(originNodeId) || !nodeIds.has(destinationNodeId)) {
        return undefined;
      }

      if (originNodeId === destinationNodeId) {
        return [];
      }

      const queue: number[] = [originNodeId];
      let queueIndex = 0;
      const visited = new Set<number>([originNodeId]);
      const predecessor = new Map<number, Readonly<{ nodeId: number; edgeId: number }>>();

      while (queueIndex < queue.length) {
        const nodeId = queue[queueIndex]!;
        queueIndex += 1;

        for (const neighbor of adjacency.get(nodeId) ?? []) {
          if (visited.has(neighbor.nodeId)) {
            continue;
          }

          visited.add(neighbor.nodeId);
          predecessor.set(neighbor.nodeId, {
            nodeId,
            edgeId: neighbor.edgeId,
          });

          if (neighbor.nodeId === destinationNodeId) {
            return reconstructPath(originNodeId, destinationNodeId, predecessor);
          }

          queue.push(neighbor.nodeId);
        }
      }

      return undefined;
    },
  };
}
