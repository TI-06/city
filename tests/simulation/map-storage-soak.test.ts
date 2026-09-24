import { describe, expect, it } from 'vitest';
import {
  assertSaveWithinBudget,
  SAVE_BUDGET_STARTER_BYTES,
} from '../../src/persistence/save/save-budget';
import { worldMapSaveCodec } from '../../src/persistence/codec/world-map-codec';
import { measureJsonBytes } from '../../src/shared/serialization/measure-json-bytes';
import type { GameCommand } from '../../src/shared/transport/game-command';
import type { CommandHandler } from '../../src/simulation/core/command-handler';
import { createKernelSaveWithCodec } from '../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../src/simulation/core/simulation-engine';
import { createGridDimensions } from '../../src/simulation/map/grid-dimensions';
import { createStarterWorldMap } from '../../src/simulation/map/starter-map-generator';
import { TerrainCode, type WorldMapState } from '../../src/simulation/map/world-map-state';

const SAVED_AT_ISO = '2026-09-24T00:00:00.000Z';

function createMapEngine(
  world: WorldMapState,
  handlers: readonly CommandHandler<WorldMapState>[] = [],
) {
  return SimulationEngine.create<WorldMapState>({
    world,
    seed: `engine:${world.mapSeed}`,
    handlers,
  });
}

function terrainChecksum(world: WorldMapState): number {
  let hash = 0x811c9dc5;

  for (const chunk of world.terrain.copyChunks()) {
    for (const value of chunk) {
      hash ^= value;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }

  return hash >>> 0;
}

const editCellHandler: CommandHandler<WorldMapState> = {
  type: 'EDIT_TERRAIN_CELL',
  apply: (world, payload) => {
    if (typeof payload !== 'object' || payload === null) {
      throw new TypeError('EDIT_TERRAIN_CELL requires an object payload');
    }

    const values = payload as Record<string, unknown>;
    const { x, y, value } = values;

    if (typeof x !== 'number' || typeof y !== 'number' || typeof value !== 'number') {
      throw new TypeError('EDIT_TERRAIN_CELL requires numeric x, y, and value');
    }

    return {
      world: {
        ...world,
        terrain: world.terrain.withCell(x, y, value),
      },
      delta: { x, y, value },
    };
  },
};

describe('map storage long-run budgets', () => {
  it('keeps a 128x128 starter map save below 64 KiB', () => {
    const engine = createMapEngine(createStarterWorldMap('starter-size'));
    const save = createKernelSaveWithCodec(engine, SAVED_AT_ISO, worldMapSaveCodec);
    const bytes = measureJsonBytes(save);

    expect(bytes).toBeLessThan(64 * 1024);
    expect(() => assertSaveWithinBudget(save, SAVE_BUDGET_STARTER_BYTES)).not.toThrow();
  });

  it('keeps a 512x512 map save below 512 KiB', () => {
    const world = createStarterWorldMap('max-size', createGridDimensions(512, 512));
    const engine = createMapEngine(world);
    const save = createKernelSaveWithCodec(engine, SAVED_AT_ISO, worldMapSaveCodec);

    expect(measureJsonBytes(save)).toBeLessThan(512 * 1024);
  });

  it('does not grow serialized state according to 10,000 edit history', () => {
    const engine = createMapEngine(createStarterWorldMap('edit-history'), [editCellHandler]);
    const before = createKernelSaveWithCodec(engine, SAVED_AT_ISO, worldMapSaveCodec);
    const beforeBytes = measureJsonBytes(before);

    for (let index = 0; index < 10_000; index += 1) {
      const x = 2 + (index % 124);
      const y = 2 + (Math.floor(index / 124) % 124);
      const value = index % 2 === 0 ? TerrainCode.LAND : TerrainCode.WATER;
      const command: GameCommand<
        'EDIT_TERRAIN_CELL',
        Readonly<{ x: number; y: number; value: number }>
      > = {
        commandId: `edit-${index}`,
        baseRevision: engine.state.revision,
        type: 'EDIT_TERRAIN_CELL',
        payload: { x, y, value },
      };

      engine.dispatch(command);
    }

    const after = createKernelSaveWithCodec(engine, SAVED_AT_ISO, worldMapSaveCodec);
    const afterBytes = measureJsonBytes(after);

    expect(engine.recentCommandCount).toBe(256);
    expect(Math.abs(afterBytes - beforeBytes)).toBeLessThan(128);
    expect(JSON.stringify(after)).not.toContain('edit-9999');
    expect(() => assertSaveWithinBudget(after, SAVE_BUDGET_STARTER_BYTES)).not.toThrow();
  });

  it('regenerates the same terrain checksum 1,000 times for a fixed seed', () => {
    const dimensions = createGridDimensions(32, 32);
    const expected = terrainChecksum(createStarterWorldMap('regen-seed', dimensions));

    for (let run = 0; run < 1_000; run += 1) {
      expect(terrainChecksum(createStarterWorldMap('regen-seed', dimensions))).toBe(expected);
    }
  });
});
