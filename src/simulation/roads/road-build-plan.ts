import type { WorldMapState } from '../map/world-map-state';
import { TerrainCode } from '../map/world-map-state';
import type {
  RoadEdge,
  RoadNetworkState,
  RoadNode,
} from './road-network-state';

export const ROAD_TWO_LANE_CELL_COST = 100;
export const MAX_ROAD_PATH_CELLS = 256;

export type RoadGridPoint = Readonly<{
  x: number;
  y: number;
}>;

export type RoadBuildValidationCode =
  | 'PATH_TOO_SHORT'
  | 'PATH_TOO_LONG'
  | 'INVALID_COORDINATE'
  | 'OUT_OF_BOUNDS'
  | 'WATER'
  | 'REPEATED_CELL'
  | 'NON_ADJACENT';

export class RoadBuildValidationError extends RangeError {
  public constructor(
    public readonly code: RoadBuildValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoadBuildValidationError';
  }
}

export type RoadBuildPlan = Readonly<{
  nodesToAdd: readonly RoadNode[];
  edgesToAdd: readonly RoadEdge[];
  constructionCost: number;
}>;

const NEIGHBOR_OFFSETS: readonly (readonly [x: number, y: number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

function canonicalEdgePair(nodeA: number, nodeB: number): readonly [number, number] {
  return nodeA < nodeB ? [nodeA, nodeB] : [nodeB, nodeA];
}

function edgePairKey(nodeA: number, nodeB: number): string {
  const [canonicalA, canonicalB] = canonicalEdgePair(nodeA, nodeB);
  return `${canonicalA}:${canonicalB}`;
}

function validateRoadPath(map: WorldMapState, cells: readonly RoadGridPoint[]): void {
  if (cells.length < 2) {
    throw new RoadBuildValidationError(
      'PATH_TOO_SHORT',
      'Road path must contain at least 2 cells',
    );
  }

  if (cells.length > MAX_ROAD_PATH_CELLS) {
    throw new RoadBuildValidationError(
      'PATH_TOO_LONG',
      `Road path cannot exceed ${MAX_ROAD_PATH_CELLS} cells`,
    );
  }

  const seen = new Set<string>();

  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]!;

    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y)) {
      throw new RoadBuildValidationError(
        'INVALID_COORDINATE',
        `Road path cell ${index} must use safe integer coordinates`,
      );
    }

    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= map.dimensions.width ||
      cell.y >= map.dimensions.height
    ) {
      throw new RoadBuildValidationError(
        'OUT_OF_BOUNDS',
        `Road path cell ${index} is outside map bounds`,
      );
    }

    const key = coordinateKey(cell.x, cell.y);
    if (seen.has(key)) {
      throw new RoadBuildValidationError(
        'REPEATED_CELL',
        `Road path repeats cell ${key}`,
      );
    }
    seen.add(key);

    if (map.terrain.get(cell.x, cell.y) !== TerrainCode.LAND) {
      throw new RoadBuildValidationError(
        'WATER',
        `Road path cell ${key} is not LAND`,
      );
    }
  }

  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1]!;
    const current = cells[index]!;
    const distance = Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y);

    if (distance !== 1) {
      throw new RoadBuildValidationError(
        'NON_ADJACENT',
        `Road path cells ${index - 1} and ${index} must be orthogonally adjacent`,
      );
    }
  }
}

export function planRoadBuild(
  map: WorldMapState,
  roads: RoadNetworkState,
  cells: readonly RoadGridPoint[],
): RoadBuildPlan {
  validateRoadPath(map, cells);

  const nodeByCoordinate = new Map<string, RoadNode>();
  for (const node of roads.nodes) {
    nodeByCoordinate.set(coordinateKey(node.x, node.y), node);
  }

  const nodesToAdd: RoadNode[] = [];
  let nextNodeId = roads.nextNodeId;

  for (const cell of cells) {
    const key = coordinateKey(cell.x, cell.y);
    if (nodeByCoordinate.has(key)) {
      continue;
    }

    const node: RoadNode = {
      id: nextNodeId,
      x: cell.x,
      y: cell.y,
    };
    nextNodeId += 1;
    nodesToAdd.push(node);
    nodeByCoordinate.set(key, node);
  }

  const edgePairs = new Set<string>();
  for (const edge of roads.edges) {
    edgePairs.add(edgePairKey(edge.nodeA, edge.nodeB));
  }

  const edgesToAdd: RoadEdge[] = [];
  let nextEdgeId = roads.nextEdgeId;

  for (const node of nodesToAdd) {
    for (const [offsetX, offsetY] of NEIGHBOR_OFFSETS) {
      const neighbor = nodeByCoordinate.get(
        coordinateKey(node.x + offsetX, node.y + offsetY),
      );
      if (neighbor === undefined) {
        continue;
      }

      const [nodeA, nodeB] = canonicalEdgePair(node.id, neighbor.id);
      const pairKey = edgePairKey(nodeA, nodeB);
      if (edgePairs.has(pairKey)) {
        continue;
      }

      edgePairs.add(pairKey);
      edgesToAdd.push({
        id: nextEdgeId,
        nodeA,
        nodeB,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      });
      nextEdgeId += 1;
    }
  }

  return {
    nodesToAdd,
    edgesToAdd,
    constructionCost: nodesToAdd.length * ROAD_TWO_LANE_CELL_COST,
  };
}
