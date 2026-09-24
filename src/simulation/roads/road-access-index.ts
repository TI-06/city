import type { RoadNetworkState } from './road-network-state';

export type RoadAccessIndex = Readonly<{
  topologyVersion: number;
  hasRoadAt: (x: number, y: number) => boolean;
  hasAdjacentRoad: (x: number, y: number) => boolean;
}>;

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function createRoadAccessIndex(roads: RoadNetworkState): RoadAccessIndex {
  const occupied = new Set(roads.nodes.map((node) => coordinateKey(node.x, node.y)));

  const hasRoadAt = (x: number, y: number): boolean => occupied.has(coordinateKey(x, y));

  return {
    topologyVersion: roads.topologyVersion,
    hasRoadAt,
    hasAdjacentRoad: (x, y) =>
      hasRoadAt(x, y - 1) || hasRoadAt(x - 1, y) || hasRoadAt(x + 1, y) || hasRoadAt(x, y + 1),
  };
}
