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

function assertRoadTuple(
  tuple: unknown,
  label: 'node' | 'edge',
  index: number,
): asserts tuple is readonly [number, number, number] {
  if (!Array.isArray(tuple) || tuple.length !== 3) {
    throw new RangeError(`Road ${label} tuple at index ${index} must contain exactly 3 values`);
  }
}

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
    nodes: saved.nodes.map((tuple, index) => {
      assertRoadTuple(tuple, 'node', index);
      const [id, x, y] = tuple;
      return { id, x, y };
    }),
    edges: saved.edges.map((tuple, index) => {
      assertRoadTuple(tuple, 'edge', index);
      const [id, nodeA, nodeB] = tuple;
      return {
        id,
        nodeA,
        nodeB,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      };
    }),
  });
}
