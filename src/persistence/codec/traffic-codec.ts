import {
  createTrafficState,
  type TrafficEdgeVolume,
  type TrafficState,
} from '../../simulation/traffic/traffic-state';

export const TRAFFIC_CODEC_VERSION = 1;

export type EncodedTrafficState = Readonly<{
  codecVersion: typeof TRAFFIC_CODEC_VERSION;
  meta: readonly [version: number, roadTopologyVersion: number];
  edgeVolumes: readonly (readonly [edgeId: number, volume: number])[];
}>;

function decodeEdgeVolume(tuple: unknown, index: number): TrafficEdgeVolume {
  if (!Array.isArray(tuple) || tuple.length !== 2) {
    throw new RangeError(
      `Traffic edge volume tuple at index ${index} must contain exactly 2 values`,
    );
  }

  const values = tuple as readonly unknown[];
  const edgeId = values[0];
  const volume = values[1];
  if (typeof edgeId !== 'number' || typeof volume !== 'number') {
    throw new RangeError(`Traffic edge volume tuple at index ${index} must contain numbers`);
  }

  return { edgeId, volume };
}

export function encodeTrafficState(state: TrafficState): EncodedTrafficState {
  const validated = createTrafficState(state);

  return {
    codecVersion: TRAFFIC_CODEC_VERSION,
    meta: [validated.version, validated.roadTopologyVersion],
    edgeVolumes: validated.edgeVolumes.map((entry) => [entry.edgeId, entry.volume] as const),
  };
}

export function decodeTrafficState(saved: EncodedTrafficState): TrafficState {
  if (saved.codecVersion !== TRAFFIC_CODEC_VERSION) {
    throw new RangeError('Unsupported traffic codec version; expected 1');
  }

  const meta: unknown = saved.meta;
  if (!Array.isArray(meta) || meta.length !== 2) {
    throw new RangeError('Traffic metadata tuple must contain exactly 2 values');
  }

  const values = meta as readonly unknown[];
  const version = values[0];
  const roadTopologyVersion = values[1];
  if (typeof version !== 'number' || typeof roadTopologyVersion !== 'number') {
    throw new RangeError('Traffic metadata tuple values must be numbers');
  }

  return createTrafficState({
    version,
    roadTopologyVersion,
    edgeVolumes: saved.edgeVolumes.map((tuple, index) => decodeEdgeVolume(tuple, index)),
  });
}
