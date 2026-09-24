import type { ChunkedByteGrid } from './chunked-byte-grid';
import type { GridDimensions } from './grid-dimensions';

export const WORLD_MAP_GENERATOR_VERSION = 1;

export const TerrainCode = {
  WATER: 0,
  LAND: 1,
} as const;

export type TerrainCodeValue = (typeof TerrainCode)[keyof typeof TerrainCode];

export type WorldMapState = Readonly<{
  generatorVersion: typeof WORLD_MAP_GENERATOR_VERSION;
  mapSeed: string;
  dimensions: GridDimensions;
  terrain: ChunkedByteGrid;
}>;
