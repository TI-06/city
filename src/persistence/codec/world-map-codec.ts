import type { WorldSaveCodec } from '../../simulation/core/kernel-save';
import type { GridDimensions } from '../../simulation/map/grid-dimensions';
import {
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../simulation/map/world-map-state';
import {
  decodeChunkedByteGrid,
  encodeChunkedByteGrid,
  type EncodedChunkedByteGrid,
} from './chunked-byte-grid-codec';

export type EncodedWorldMapState = Readonly<{
  generatorVersion: typeof WORLD_MAP_GENERATOR_VERSION;
  mapSeed: string;
  terrain: EncodedChunkedByteGrid;
}>;

function assertSupportedGeneratorVersion(version: number): void {
  if (version !== WORLD_MAP_GENERATOR_VERSION) {
    throw new RangeError(
      `Unsupported world map generator version: ${version}; expected ${WORLD_MAP_GENERATOR_VERSION}`,
    );
  }
}

function dimensionsFromTerrain(terrain: WorldMapState['terrain']): GridDimensions {
  return terrain.dimensions;
}

function assertWorldMapDimensionsMatchTerrain(world: WorldMapState): void {
  const terrainDimensions = world.terrain.dimensions;

  if (
    world.dimensions.width !== terrainDimensions.width ||
    world.dimensions.height !== terrainDimensions.height
  ) {
    throw new RangeError('World map dimensions must match terrain dimensions');
  }
}

export function encodeWorldMapState(world: WorldMapState): EncodedWorldMapState {
  assertSupportedGeneratorVersion(world.generatorVersion);
  assertWorldMapDimensionsMatchTerrain(world);

  return {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: world.mapSeed,
    terrain: encodeChunkedByteGrid(world.terrain),
  };
}

export function decodeWorldMapState(savedWorld: EncodedWorldMapState): WorldMapState {
  assertSupportedGeneratorVersion(savedWorld.generatorVersion);
  const terrain = decodeChunkedByteGrid(savedWorld.terrain);

  return {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: savedWorld.mapSeed,
    dimensions: dimensionsFromTerrain(terrain),
    terrain,
  };
}

export const worldMapSaveCodec: WorldSaveCodec<WorldMapState, EncodedWorldMapState> = {
  encode: encodeWorldMapState,
  decode: decodeWorldMapState,
};
