import { describe, expect, it } from 'vitest';
import type { RoadEdge } from '../../../src/simulation/roads/road-network-state';
import {
  MAX_CONGESTION_PERCENT,
  MINIMUM_CONGESTED_SPEED_KPH,
  TWO_LANE_FREE_FLOW_SPEED_KPH,
  TWO_LANE_TRAFFIC_CAPACITY,
  deriveTrafficEdgeMetrics,
} from '../../../src/simulation/traffic/traffic-metrics';

const EDGE: RoadEdge = {
  id: 1,
  nodeA: 1,
  nodeB: 2,
  roadType: 'two-lane',
  laneCount: 2,
  lengthCells: 1,
};

describe('traffic metrics', () => {
  it('uses the configured two-lane capacity and free-flow speed', () => {
    expect(TWO_LANE_TRAFFIC_CAPACITY).toBe(100);
    expect(TWO_LANE_FREE_FLOW_SPEED_KPH).toBe(40);
    expect(MINIMUM_CONGESTED_SPEED_KPH).toBe(5);
  });

  it.each([
    [0, 0, 40],
    [50, 50, 40],
    [100, 100, 40],
    [200, 200, 20],
    [400, 400, 10],
    [800, 800, 5],
  ])('derives volume %s as %s%% congestion at %s km/h', (volume, congestionPercent, speedKph) => {
    expect(deriveTrafficEdgeMetrics(EDGE, volume)).toEqual({
      capacity: 100,
      volume,
      congestionPercent,
      speedKph,
    });
  });

  it('caps displayed congestion percent', () => {
    expect(deriveTrafficEdgeMetrics(EDGE, 5_000).congestionPercent).toBe(MAX_CONGESTION_PERCENT);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid traffic volume %s',
    (volume) => {
      expect(() => deriveTrafficEdgeMetrics(EDGE, volume)).toThrow(/traffic volume/i);
    },
  );
});
