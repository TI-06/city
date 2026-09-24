import {
  createRoadNetworkState,
  type RoadNetworkState,
} from '../../simulation/roads/road-network-state';

export const ROAD_NETWORK_CODEC_VERSION = 1;

export type EncodedRoadNetworkState = Readonly<{
  codecVersion: typeof ROAD_NETWORK_CODEC_VERSION;
  topologyVersion: number;
  nextNodeId: number;
  nextEdgeId: number;
  nodes: readonly (readonly [id: number, x: number, y: number])[];
  edges: readonly (readonly [id: number, nodeA: number, nodeB: number])[];
}>;

export function encodeRoadNetworkState(state: RoadNetworkState): EncodedRoadNetworkState {
  return {
    codecVersion: ROAD_NETWORK_CODEC_VERSION,
    topologyVersion: state.topologyVersion,
    nextNodeId: state.nextNodeId,
    nextEdgeId: state.nextEdgeId,
    nodes: state.nodes.map((node) => [node.id, node.x, node.y] as const),
    edges: state.edges.map((edge) => [edge.id, edge.nodeA, edge.nodeB] as const),
  };
}

export function decodeRoadNetworkState(saved: EncodedRoadNetworkState): RoadNetworkState {
  if (saved.codecVersion !== ROAD_NETWORK_CODEC_VERSION) {
    throw new RangeError('Unsupported road network codec version; expected 1');
  }

  return createRoadNetworkState({
    topologyVersion: saved.topologyVersion,
    nextNodeId: saved.nextNodeId,
    nextEdgeId: saved.nextEdgeId,
    nodes: saved.nodes.map(([id, x, y]) => ({ id, x, y })),
    edges: saved.edges.map(([id, nodeA, nodeB]) => ({
      id,
      nodeA,
      nodeB,
      roadType: 'two-lane',
      laneCount: 2,
      lengthCells: 1,
    })),
  });
}
