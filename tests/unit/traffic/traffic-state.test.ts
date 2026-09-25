import { describe, expect, it } from 'vitest';
import {
  createEmptyTrafficState,
  createTrafficState,
  getTrafficVolumeForEdge,
  replaceTrafficVolumes,
  resetTrafficForRoadTopology,
} from '../../../src/simulation/traffic/traffic-state';

describe('traffic state', () => {
  it('creates an empty traffic snapshot for the current road topology', () => {
    expect(createEmptyTrafficState(7)).toEqual({
      version: 0,
      roadTopologyVersion: 7,
      edgeVolumes: [],
    });
  });

  it('accepts sorted positive edge volumes and supports missing-edge zero lookup', () => {
    const state = createTrafficState({
      version: 3,
      roadTopologyVersion: 4,
      edgeVolumes: [
        { edgeId: 2, volume: 10 },
        { edgeId: 9, volume: 25 },
      ],
    });

    expect(getTrafficVolumeForEdge(state, 2)).toBe(10);
    expect(getTrafficVolumeForEdge(state, 3)).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid traffic version %s',
    (version) => {
      expect(() =>
        createTrafficState({
          version,
          roadTopologyVersion: 0,
          edgeVolumes: [],
        }),
      ).toThrow(/traffic version/i);
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid road topology version %s',
    (roadTopologyVersion) => {
      expect(() =>
        createTrafficState({
          version: 0,
          roadTopologyVersion,
          edgeVolumes: [],
        }),
      ).toThrow(/road topology version/i);
    },
  );

  it.each([
    { edgeVolumes: [{ edgeId: 0, volume: 1 }] },
    { edgeVolumes: [{ edgeId: 1, volume: 0 }] },
    {
      edgeVolumes: [
        { edgeId: 2, volume: 1 },
        { edgeId: 1, volume: 1 },
      ],
    },
    {
      edgeVolumes: [
        { edgeId: 1, volume: 1 },
        { edgeId: 1, volume: 2 },
      ],
    },
  ])('rejects invalid or unsorted edge volumes %#', ({ edgeVolumes }) => {
    expect(() =>
      createTrafficState({
        version: 0,
        roadTopologyVersion: 1,
        edgeVolumes,
      }),
    ).toThrow(/traffic edge|strictly sorted/i);
  });

  it('preserves identity when replacement topology and volumes are unchanged', () => {
    const state = createTrafficState({
      version: 2,
      roadTopologyVersion: 1,
      edgeVolumes: [{ edgeId: 1, volume: 15 }],
    });

    expect(replaceTrafficVolumes(state, 1, [{ edgeId: 1, volume: 15 }])).toBe(state);
  });

  it('increments version when current volumes change', () => {
    const state = createTrafficState({
      version: 2,
      roadTopologyVersion: 1,
      edgeVolumes: [{ edgeId: 1, volume: 15 }],
    });

    expect(replaceTrafficVolumes(state, 1, [{ edgeId: 1, volume: 20 }])).toEqual({
      version: 3,
      roadTopologyVersion: 1,
      edgeVolumes: [{ edgeId: 1, volume: 20 }],
    });
  });

  it('clears traffic when road topology changes', () => {
    const state = createTrafficState({
      version: 2,
      roadTopologyVersion: 1,
      edgeVolumes: [{ edgeId: 1, volume: 15 }],
    });

    expect(resetTrafficForRoadTopology(state, 2)).toEqual({
      version: 3,
      roadTopologyVersion: 2,
      edgeVolumes: [],
    });
  });

  it('preserves identity when reset targets the same topology', () => {
    const state = createEmptyTrafficState(2);
    expect(resetTrafficForRoadTopology(state, 2)).toBe(state);
  });
});
