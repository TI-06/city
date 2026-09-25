export type TrafficEdgeVolume = Readonly<{
  edgeId: number;
  volume: number;
}>;

export type TrafficState = Readonly<{
  version: number;
  roadTopologyVersion: number;
  edgeVolumes: readonly TrafficEdgeVolume[];
}>;

export type TrafficStateInput = Readonly<{
  version: number;
  roadTopologyVersion: number;
  edgeVolumes: readonly TrafficEdgeVolume[];
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

function sameVolumes(
  left: readonly TrafficEdgeVolume[],
  right: readonly TrafficEdgeVolume[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (entry, index) =>
      entry.edgeId === right[index]?.edgeId && entry.volume === right[index]?.volume,
  );
}

export function createTrafficState(input: TrafficStateInput): TrafficState {
  assertNonNegativeSafeInteger(input.version, 'Traffic version');
  assertNonNegativeSafeInteger(input.roadTopologyVersion, 'Traffic road topology version');

  let previousEdgeId = 0;
  const edgeVolumes = input.edgeVolumes.map((entry) => {
    assertPositiveSafeInteger(entry.edgeId, 'Traffic edge ID');
    assertPositiveSafeInteger(entry.volume, 'Traffic edge volume');

    if (entry.edgeId <= previousEdgeId) {
      throw new RangeError('Traffic edge IDs must be unique and strictly sorted');
    }
    previousEdgeId = entry.edgeId;

    return {
      edgeId: entry.edgeId,
      volume: entry.volume,
    };
  });

  return {
    version: input.version,
    roadTopologyVersion: input.roadTopologyVersion,
    edgeVolumes,
  };
}

export function createEmptyTrafficState(roadTopologyVersion: number): TrafficState {
  return createTrafficState({
    version: 0,
    roadTopologyVersion,
    edgeVolumes: [],
  });
}

export function replaceTrafficVolumes(
  state: TrafficState,
  roadTopologyVersion: number,
  edgeVolumes: readonly TrafficEdgeVolume[],
): TrafficState {
  const validated = createTrafficState({
    version: state.version,
    roadTopologyVersion,
    edgeVolumes,
  });

  if (
    state.roadTopologyVersion === validated.roadTopologyVersion &&
    sameVolumes(state.edgeVolumes, validated.edgeVolumes)
  ) {
    return state;
  }

  return createTrafficState({
    version: state.version + 1,
    roadTopologyVersion: validated.roadTopologyVersion,
    edgeVolumes: validated.edgeVolumes,
  });
}

export function resetTrafficForRoadTopology(
  state: TrafficState,
  roadTopologyVersion: number,
): TrafficState {
  assertNonNegativeSafeInteger(roadTopologyVersion, 'Traffic road topology version');

  if (state.roadTopologyVersion === roadTopologyVersion) {
    return state;
  }

  return createTrafficState({
    version: state.version + 1,
    roadTopologyVersion,
    edgeVolumes: [],
  });
}

export function getTrafficVolumeForEdge(state: TrafficState, edgeId: number): number {
  const found = state.edgeVolumes.find((entry) => entry.edgeId === edgeId);
  return found?.volume ?? 0;
}
