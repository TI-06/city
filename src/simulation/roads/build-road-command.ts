import type { CommandHandler } from '../core/command-handler';
import type { CityWorldState } from '../world/city-world-state';
import { applyRoadBuild } from './apply-road-build';
import {
  planRoadBuild,
  type RoadGridPoint,
} from './road-build-plan';

export type BuildRoadPathPayload = Readonly<{
  cells: readonly RoadGridPoint[];
}>;

export type BuildRoadPathDelta = Readonly<{
  topologyVersion: number;
  addedNodeIds: readonly number[];
  addedEdgeIds: readonly number[];
  constructionCost: number;
}>;

function parseRoadGridPoint(value: unknown, index: number): RoadGridPoint {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('x' in value) ||
    !('y' in value) ||
    typeof value.x !== 'number' ||
    typeof value.y !== 'number'
  ) {
    throw new TypeError(`BUILD_ROAD_PATH cells[${index}] requires numeric x and y`);
  }

  return {
    x: value.x,
    y: value.y,
  };
}

function parseBuildRoadPathPayload(payload: unknown): BuildRoadPathPayload {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('cells' in payload) ||
    !Array.isArray(payload.cells)
  ) {
    throw new TypeError('BUILD_ROAD_PATH requires a cells array');
  }

  return {
    cells: payload.cells.map((cell, index) => parseRoadGridPoint(cell, index)),
  };
}

export const buildRoadPathHandler: CommandHandler<CityWorldState> = {
  type: 'BUILD_ROAD_PATH',
  apply: (world, payload) => {
    const parsed = parseBuildRoadPathPayload(payload);
    const plan = planRoadBuild(world.map, world.roads, parsed.cells);
    const roads = applyRoadBuild(world.roads, plan);

    return {
      world: {
        ...world,
        roads,
      },
      delta: {
        topologyVersion: roads.topologyVersion,
        addedNodeIds: plan.nodesToAdd.map((node) => node.id),
        addedEdgeIds: plan.edgesToAdd.map((edge) => edge.id),
        constructionCost: plan.constructionCost,
      } satisfies BuildRoadPathDelta,
    };
  },
};
