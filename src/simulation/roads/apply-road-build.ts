import type { RoadBuildPlan } from './road-build-plan';
import {
  createRoadNetworkState,
  type RoadNetworkState,
} from './road-network-state';

function assertSequentialIds(
  actualIds: readonly number[],
  expectedStart: number,
  label: string,
): void {
  for (let index = 0; index < actualIds.length; index += 1) {
    const expected = expectedStart + index;
    const actual = actualIds[index];

    if (actual !== expected) {
      throw new RangeError(
        `Road build plan ${label} ID ${String(actual)} does not match expected next ID ${expected}`,
      );
    }
  }
}

export function applyRoadBuild(
  state: RoadNetworkState,
  plan: RoadBuildPlan,
): RoadNetworkState {
  if (plan.nodesToAdd.length === 0 && plan.edgesToAdd.length === 0) {
    return state;
  }

  assertSequentialIds(
    plan.nodesToAdd.map((node) => node.id),
    state.nextNodeId,
    'node',
  );
  assertSequentialIds(
    plan.edgesToAdd.map((edge) => edge.id),
    state.nextEdgeId,
    'edge',
  );

  return createRoadNetworkState({
    topologyVersion: state.topologyVersion + 1,
    nextNodeId: state.nextNodeId + plan.nodesToAdd.length,
    nextEdgeId: state.nextEdgeId + plan.edgesToAdd.length,
    nodes: [...state.nodes, ...plan.nodesToAdd],
    edges: [...state.edges, ...plan.edgesToAdd],
  });
}
