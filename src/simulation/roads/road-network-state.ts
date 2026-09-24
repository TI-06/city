export type RoadNodeId = number;
export type RoadEdgeId = number;
export type RoadType = 'two-lane';

export type RoadNode = Readonly<{
  id: RoadNodeId;
  x: number;
  y: number;
}>;

export type RoadEdge = Readonly<{
  id: RoadEdgeId;
  nodeA: RoadNodeId;
  nodeB: RoadNodeId;
  roadType: RoadType;
  laneCount: 2;
  lengthCells: 1;
}>;

export type RoadNetworkState = Readonly<{
  topologyVersion: number;
  nextNodeId: RoadNodeId;
  nextEdgeId: RoadEdgeId;
  nodes: readonly RoadNode[];
  edges: readonly RoadEdge[];
}>;

export type RoadNetworkStateInput = Readonly<{
  topologyVersion: number;
  nextNodeId: number;
  nextEdgeId: number;
  nodes: readonly RoadNode[];
  edges: readonly RoadEdge[];
}>;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

function edgePairKey(nodeA: number, nodeB: number): string {
  return `${nodeA}:${nodeB}`;
}

export function createEmptyRoadNetwork(): RoadNetworkState {
  return {
    topologyVersion: 0,
    nextNodeId: 1,
    nextEdgeId: 1,
    nodes: [],
    edges: [],
  };
}

export function createRoadNetworkState(input: RoadNetworkStateInput): RoadNetworkState {
  assertNonNegativeSafeInteger(input.topologyVersion, 'Road topology version');
  assertPositiveSafeInteger(input.nextNodeId, 'Next node ID');
  assertPositiveSafeInteger(input.nextEdgeId, 'Next edge ID');

  const nodeIds = new Set<number>();
  const coordinateKeys = new Set<string>();
  const nodeById = new Map<number, RoadNode>();
  let maximumNodeId = 0;

  const nodes = input.nodes.map((node) => {
    assertPositiveSafeInteger(node.id, 'Road node ID');

    if (!Number.isSafeInteger(node.x) || !Number.isSafeInteger(node.y)) {
      throw new RangeError('Road node coordinate must use safe integers');
    }

    if (nodeIds.has(node.id)) {
      throw new RangeError(`Duplicate road node ID: ${node.id}`);
    }
    nodeIds.add(node.id);

    const key = coordinateKey(node.x, node.y);
    if (coordinateKeys.has(key)) {
      throw new RangeError(`Duplicate road node coordinate: ${key}`);
    }
    coordinateKeys.add(key);

    const copied: RoadNode = {
      id: node.id,
      x: node.x,
      y: node.y,
    };
    nodeById.set(copied.id, copied);
    maximumNodeId = Math.max(maximumNodeId, copied.id);
    return copied;
  });

  if (input.nextNodeId <= maximumNodeId) {
    throw new RangeError(
      `Next node ID ${input.nextNodeId} must be greater than existing maximum node ID ${maximumNodeId}`,
    );
  }

  const edgeIds = new Set<number>();
  const edgePairs = new Set<string>();
  let maximumEdgeId = 0;

  const edges = input.edges.map((edge) => {
    assertPositiveSafeInteger(edge.id, 'Road edge ID');

    if (edgeIds.has(edge.id)) {
      throw new RangeError(`Duplicate road edge ID: ${edge.id}`);
    }
    edgeIds.add(edge.id);

    if (
      !Number.isSafeInteger(edge.nodeA) ||
      !Number.isSafeInteger(edge.nodeB) ||
      edge.nodeA <= 0 ||
      edge.nodeB <= 0
    ) {
      throw new RangeError('Road edge endpoints must be positive safe integer node IDs');
    }

    if (edge.nodeA >= edge.nodeB) {
      throw new RangeError('Road edge nodeA must be less than nodeB');
    }

    const nodeA = nodeById.get(edge.nodeA);
    const nodeB = nodeById.get(edge.nodeB);
    if (nodeA === undefined || nodeB === undefined) {
      throw new RangeError('Road edge endpoints must reference existing road nodes');
    }

    const distance = Math.abs(nodeA.x - nodeB.x) + Math.abs(nodeA.y - nodeB.y);
    if (distance !== 1) {
      throw new RangeError('Road edge endpoint coordinates must be orthogonally adjacent');
    }

    const pairKey = edgePairKey(edge.nodeA, edge.nodeB);
    if (edgePairs.has(pairKey)) {
      throw new RangeError(`Duplicate road edge pair: ${pairKey}`);
    }
    edgePairs.add(pairKey);

    if (edge.roadType !== 'two-lane') {
      throw new RangeError('Road type must be two-lane');
    }
    if (edge.laneCount !== 2) {
      throw new RangeError('Road lane count must be 2');
    }
    if (edge.lengthCells !== 1) {
      throw new RangeError('Road edge length must be 1 cell');
    }

    maximumEdgeId = Math.max(maximumEdgeId, edge.id);
    return {
      id: edge.id,
      nodeA: edge.nodeA,
      nodeB: edge.nodeB,
      roadType: 'two-lane',
      laneCount: 2,
      lengthCells: 1,
    } satisfies RoadEdge;
  });

  if (input.nextEdgeId <= maximumEdgeId) {
    throw new RangeError(
      `Next edge ID ${input.nextEdgeId} must be greater than existing maximum edge ID ${maximumEdgeId}`,
    );
  }

  return {
    topologyVersion: input.topologyVersion,
    nextNodeId: input.nextNodeId,
    nextEdgeId: input.nextEdgeId,
    nodes,
    edges,
  };
}

export function findRoadNodeAt(
  state: RoadNetworkState,
  x: number,
  y: number,
): RoadNode | undefined {
  return state.nodes.find((node) => node.x === x && node.y === y);
}

export function hasRoadEdge(
  state: RoadNetworkState,
  nodeA: RoadNodeId,
  nodeB: RoadNodeId,
): boolean {
  if (nodeA === nodeB) {
    return false;
  }

  const canonicalA = Math.min(nodeA, nodeB);
  const canonicalB = Math.max(nodeA, nodeB);
  return state.edges.some((edge) => edge.nodeA === canonicalA && edge.nodeB === canonicalB);
}
