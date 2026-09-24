import { describe, expect, it } from 'vitest';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  DEFAULT_STARTER_MAP_SIZE,
  MIN_STARTER_MAP_AXIS_CELLS,
  createStarterWorldMap,
} from '../../../src/simulation/map/starter-map-generator';
import { TerrainCode } from '../../../src/simulation/map/world-map-state';

function terrainBytes(
  seed: string,
  width = DEFAULT_STARTER_MAP_SIZE,
  height = DEFAULT_STARTER_MAP_SIZE,
) {
  return createStarterWorldMap(seed, createGridDimensions(width, height))
    .terrain.copyChunks()
    .map((chunk) => Array.from(chunk));
}

describe('starter world map generator', () => {
  it('uses the 128x128 default starter dimensions', () => {
    const map = createStarterWorldMap('default-map');

    expect(map.dimensions).toEqual({
      width: DEFAULT_STARTER_MAP_SIZE,
      height: DEFAULT_STARTER_MAP_SIZE,
    });
    expect(DEFAULT_STARTER_MAP_SIZE).toBe(128);
    expect(MIN_STARTER_MAP_AXIS_CELLS).toBe(16);
  });

  it.each([
    [15, 128],
    [128, 15],
  ])(
    'rejects starter dimensions below the generator minimum (%s, %s)',
    (width, height) => {
      expect(() =>
        createStarterWorldMap('too-small', createGridDimensions(width, height)),
      ).toThrow(/at least 16/i);
    },
  );

  it('produces byte-identical terrain for the same seed', () => {
    expect(terrainBytes('city-a')).toEqual(terrainBytes('city-a'));
  });

  it('produces different terrain for representative different seeds', () => {
    expect(terrainBytes('city-a')).not.toEqual(terrainBytes('city-b'));
  });

  it('uses only LAND and WATER terrain codes', () => {
    const map = createStarterWorldMap('terrain-codes');

    for (const chunk of map.terrain.copyChunks()) {
      for (const value of chunk) {
        expect([TerrainCode.WATER, TerrainCode.LAND]).toContain(value);
      }
    }
  });

  it('keeps all four corners buildable land', () => {
    const map = createStarterWorldMap('land-corners');
    const { width, height } = map.dimensions;

    expect(map.terrain.get(0, 0)).toBe(TerrainCode.LAND);
    expect(map.terrain.get(width - 1, 0)).toBe(TerrainCode.LAND);
    expect(map.terrain.get(0, height - 1)).toBe(TerrainCode.LAND);
    expect(map.terrain.get(width - 1, height - 1)).toBe(TerrainCode.LAND);
  });

  it('keeps at least one land cell on every row', () => {
    const map = createStarterWorldMap('row-land');

    for (let y = 0; y < map.dimensions.height; y += 1) {
      let hasLand = false;
      for (let x = 0; x < map.dimensions.width; x += 1) {
        if (map.terrain.get(x, y) === TerrainCode.LAND) {
          hasLand = true;
          break;
        }
      }
      expect(hasLand).toBe(true);
    }
  });

  it('contains both water and land', () => {
    const map = createStarterWorldMap('mixed-terrain');
    let water = 0;
    let land = 0;

    for (let y = 0; y < map.dimensions.height; y += 1) {
      for (let x = 0; x < map.dimensions.width; x += 1) {
        if (map.terrain.get(x, y) === TerrainCode.WATER) water += 1;
        if (map.terrain.get(x, y) === TerrainCode.LAND) land += 1;
      }
    }

    expect(water).toBeGreaterThan(0);
    expect(land).toBeGreaterThan(0);
  });
});
