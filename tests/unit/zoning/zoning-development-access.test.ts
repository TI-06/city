import { describe, expect, it } from 'vitest';
import {
  createRoadAccessIndex,
  type RoadAccessIndex,
} from '../../../src/simulation/roads/road-access-index';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import {
  isZonedCellRoadAccessible,
} from '../../../src/simulation/zoning/zoning-development-access';
import {
  ZoneCode,
  createEmptyZoning,
  createZoningState,
} from '../../../src/simulation/zoning/zoning-state';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';

function createRoadFixture() {
  return createRoadNetworkState({
    topologyVersion: 7,
    nextNodeId: 4,
    nextEdgeId: 3,
    nodes: [
      { id: 1, x: 5, y: 5 },
      { id: 2, x: 6, y: 5 },
      { id: 3, x: 6, y: 6 },
    ],
    edges: [
      {
        id: 1,
        nodeA: 1,
        nodeB: 2,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
      {
        id: 2,
        nodeA: 2,
        nodeB: 3,
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      },
    ],
  });
}

describe('zoning development road access', () => {
  it('captures the road topology version without exposing persistent graph state', () => {
    const index: RoadAccessIndex = createRoadAccessIndex(createRoadFixture());

    expect(index.topologyVersion).toBe(7);
    expect(index.hasRoadAt(5, 5)).toBe(true);
    expect(index.hasRoadAt(6, 5)).toBe(true);
    expect(index.hasRoadAt(6, 6)).toBe(true);
    expect(index.hasRoadAt(7, 7)).toBe(false);
  });

  it('recognizes only orthogonally adjacent road access', () => {
    const index = createRoadAccessIndex(createRoadFixture());

    expect(index.hasAdjacentRoad(4, 5)).toBe(true);
    expect(index.hasAdjacentRoad(5, 4)).toBe(true);
    expect(index.hasAdjacentRoad(5, 6)).toBe(true);
    expect(index.hasAdjacentRoad(7, 5)).toBe(true);

    expect(index.hasAdjacentRoad(4, 4)).toBe(false);
    expect(index.hasAdjacentRoad(4, 6)).toBe(false);
    expect(index.hasAdjacentRoad(7, 7)).toBe(false);
  });

  it('never treats NONE as development-accessible', () => {
    const zoning = createEmptyZoning(createGridDimensions(16, 16));
    const index = createRoadAccessIndex(createRoadFixture());

    expect(isZonedCellRoadAccessible(zoning, index, 4, 5)).toBe(false);
  });

  it.each([
    ZoneCode.RESIDENTIAL,
    ZoneCode.COMMERCIAL,
    ZoneCode.INDUSTRIAL,
  ] as const)('treats zone %s as accessible when next to a road', (zone) => {
    const dimensions = createGridDimensions(16, 16);
    const zoning = createZoningState(
      1,
      createEmptyZoning(dimensions).grid.withCell(4, 5, zone),
    );
    const index = createRoadAccessIndex(createRoadFixture());

    expect(isZonedCellRoadAccessible(zoning, index, 4, 5)).toBe(true);
  });

  it('keeps a designated zone inaccessible when no orthogonal road exists', () => {
    const dimensions = createGridDimensions(16, 16);
    const zoning = createZoningState(
      1,
      createEmptyZoning(dimensions).grid.withCell(10, 10, ZoneCode.RESIDENTIAL),
    );
    const index = createRoadAccessIndex(createRoadFixture());

    expect(isZonedCellRoadAccessible(zoning, index, 10, 10)).toBe(false);
  });

  it('does not count a road under the same cell as adjacent access', () => {
    const dimensions = createGridDimensions(16, 16);
    const zoning = createZoningState(
      1,
      createEmptyZoning(dimensions).grid.withCell(5, 5, ZoneCode.RESIDENTIAL),
    );
    const index = createRoadAccessIndex(
      createRoadNetworkState({
        topologyVersion: 1,
        nextNodeId: 2,
        nextEdgeId: 1,
        nodes: [{ id: 1, x: 5, y: 5 }],
        edges: [],
      }),
    );

    expect(index.hasRoadAt(5, 5)).toBe(true);
    expect(index.hasAdjacentRoad(5, 5)).toBe(false);
    expect(isZonedCellRoadAccessible(zoning, index, 5, 5)).toBe(false);
  });
});
