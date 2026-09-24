import { ChunkedByteGrid } from './chunked-byte-grid';
import {
  createGridDimensions,
  type GridDimensions,
} from './grid-dimensions';
import { SeededRandom, type RandomSeed } from '../core/seeded-random';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from './world-map-state';

export const DEFAULT_STARTER_MAP_SIZE = 128;
export const MIN_STARTER_MAP_AXIS_CELLS = 16;

function assertStarterDimensions(dimensions: GridDimensions): GridDimensions {
  const validated = createGridDimensions(dimensions.width, dimensions.height);

  if (
    validated.width < MIN_STARTER_MAP_AXIS_CELLS ||
    validated.height < MIN_STARTER_MAP_AXIS_CELLS
  ) {
    throw new RangeError(
      `Starter map width and height must be at least ${MIN_STARTER_MAP_AXIS_CELLS}`,
    );
  }

  return validated;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function createRiverCenters(
  seed: string,
  dimensions: GridDimensions,
): readonly number[] {
  const random = SeededRandom.fromSeed(
    `map-v${WORLD_MAP_GENERATOR_VERSION}:${seed}`,
  );
  const centerMinimum = Math.max(2, Math.floor(dimensions.width * 0.3));
  const centerMaximum = Math.min(
    dimensions.width - 3,
    Math.ceil(dimensions.width * 0.7) - 1,
  );
  const span = centerMaximum - centerMinimum + 1;

  let riverX = centerMinimum + (random.nextUint32() % span);
  const centers: number[] = [];

  for (let y = 0; y < dimensions.height; y += 1) {
    if (y > 0 && y % 6 === 0) {
      const drift = (random.nextUint32() % 3) - 1;
      riverX = clamp(riverX + drift, 2, dimensions.width - 3);
    }
    centers.push(riverX);
  }

  return centers;
}

export function createStarterWorldMap(
  seed: RandomSeed,
  dimensions: GridDimensions = createGridDimensions(
    DEFAULT_STARTER_MAP_SIZE,
    DEFAULT_STARTER_MAP_SIZE,
  ),
): WorldMapState {
  const validated = assertStarterDimensions(dimensions);
  const mapSeed = String(seed);
  const riverCenters = createRiverCenters(mapSeed, validated);

  const terrain = ChunkedByteGrid.generate(validated, (x, y) => {
    const isOuterBorder =
      x < 2 ||
      y < 2 ||
      x >= validated.width - 2 ||
      y >= validated.height - 2;

    if (isOuterBorder) {
      return TerrainCode.LAND;
    }

    const riverX = riverCenters[y]!;
    if (x === riverX || x === riverX + 1) {
      return TerrainCode.WATER;
    }

    return TerrainCode.LAND;
  });

  return {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed,
    dimensions: validated,
    terrain,
  };
}
