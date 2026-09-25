import type { RoadEdge } from '../roads/road-network-state';

export const TWO_LANE_TRAFFIC_CAPACITY = 100;
export const TWO_LANE_FREE_FLOW_SPEED_KPH = 40;
export const MINIMUM_CONGESTED_SPEED_KPH = 5;
export const MAX_CONGESTION_PERCENT = 999;

export type TrafficEdgeMetrics = Readonly<{
  capacity: number;
  volume: number;
  congestionPercent: number;
  speedKph: number;
}>;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function safeMultiply(left: number, right: number, label: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must remain a safe integer`);
  }
  return result;
}

export function getRoadEdgeTrafficCapacity(edge: RoadEdge): number {
  if (edge.roadType !== 'two-lane' || edge.laneCount !== 2) {
    throw new RangeError('Unsupported road type for traffic capacity');
  }

  return TWO_LANE_TRAFFIC_CAPACITY;
}

export function deriveTrafficEdgeMetrics(edge: RoadEdge, volume: number): TrafficEdgeMetrics {
  assertNonNegativeSafeInteger(volume, 'Traffic volume');

  const capacity = getRoadEdgeTrafficCapacity(edge);
  const congestionNumerator = safeMultiply(volume, 100, 'Traffic congestion numerator');
  const congestionPercent = Math.min(
    MAX_CONGESTION_PERCENT,
    Math.floor(congestionNumerator / capacity),
  );

  let speedKph = TWO_LANE_FREE_FLOW_SPEED_KPH;
  if (volume > capacity) {
    const speedNumerator = safeMultiply(
      TWO_LANE_FREE_FLOW_SPEED_KPH,
      capacity,
      'Traffic speed numerator',
    );
    speedKph = Math.max(MINIMUM_CONGESTED_SPEED_KPH, Math.floor(speedNumerator / volume));
  }

  return {
    capacity,
    volume,
    congestionPercent,
    speedKph,
  };
}
