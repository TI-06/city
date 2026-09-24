import { describe, expect, it } from 'vitest';
import {
  decodeWorldMapState,
  encodeWorldMapState,
  worldMapSaveCodec,
  type EncodedWorldMapState,
} from '../../../src/persistence/codec/world-map-codec';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import { createStarterWorldMap } from '../../../src/simulation/map/starter-map-generator';
import { WORLD_MAP_GENERATOR_VERSION } from '../../../src/simulation/map/world-map-state';

describe('world map codec', () => {
  it('round-trips generator metadata, dimensions, and every terrain byte', () => {
    const source = createStarterWorldMap('codec-map', createGridDimensions(65, 34));

    const encoded = encodeWorldMapState(source);
    const restored = decodeWorldMapState(encoded);

    expect(encoded.generatorVersion).toBe(WORLD_MAP_GENERATOR_VERSION);
    expect(encoded.mapSeed).toBe('codec-map');
    expect(restored.generatorVersion).toBe(source.generatorVersion);
    expect(restored.mapSeed).toBe(source.mapSeed);
    expect(restored.dimensions).toEqual(source.dimensions);
    expect(
      restored.terrain.copyChunks().map((chunk) => Array.from(chunk)),
    ).toEqual(source.terrain.copyChunks().map((chunk) => Array.from(chunk)));
  });

  it('exposes a WorldSaveCodec-compatible codec object', () => {
    const source = createStarterWorldMap('codec-object');
    const restored = worldMapSaveCodec.decode(worldMapSaveCodec.encode(source));

    expect(restored.mapSeed).toBe(source.mapSeed);
    expect(restored.dimensions).toEqual(source.dimensions);
  });

  it('rejects an unsupported map generator version', () => {
    const encoded = encodeWorldMapState(createStarterWorldMap('bad-version'));
    const invalid = {
      ...encoded,
      generatorVersion: WORLD_MAP_GENERATOR_VERSION + 1,
    } as unknown as EncodedWorldMapState;

    expect(() => decodeWorldMapState(invalid)).toThrow(/unsupported world map generator version/i);
  });
});
