import { describe, expect, it } from 'vitest';
import type { GameCommand } from '../../../src/shared/transport/game-command';
import type { CommandHandler } from '../../../src/simulation/core/command-handler';
import {
  createKernelSave,
  createKernelSaveWithCodec,
  KERNEL_SAVE_VERSION,
  restoreKernelState,
  restoreKernelStateWithCodec,
  type WorldSaveCodec,
} from '../../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../../src/simulation/core/simulation-engine';
import type { SimulationSystem } from '../../../src/simulation/core/simulation-system';

type World = Readonly<{
  steps: number;
  randomTrace: readonly number[];
}>;

const trackingSystem: SimulationSystem<World> = {
  id: 'tracking',
  step: (world, context) => ({
    steps: world.steps + 1,
    randomTrace: [...world.randomTrace, context.random.nextUint32()],
  }),
};

const noopHandler: CommandHandler<World> = {
  type: 'NOOP',
  apply: (world) => ({ world, delta: {} }),
};

function createEngine() {
  return SimulationEngine.create({
    world: { steps: 0, randomTrace: [] } satisfies World,
    seed: 'save-seed',
    systems: [trackingSystem],
    handlers: [noopHandler],
  });
}

type RuntimeCodecWorld = Readonly<{
  name: string;
  bytes: Uint8Array;
}>;

type SavedCodecWorld = Readonly<{
  name: string;
  bytes: readonly number[];
}>;

const runtimeWorldCodec: WorldSaveCodec<RuntimeCodecWorld, SavedCodecWorld> = {
  encode: (world) => ({ name: world.name, bytes: Array.from(world.bytes) }),
  decode: (savedWorld) => ({
    name: savedWorld.name,
    bytes: Uint8Array.from(savedWorld.bytes),
  }),
};

describe('kernel save and restore', () => {
  it('preserves authoritative state and explicit save version', () => {
    const engine = createEngine();
    engine.step(12);

    const save = createKernelSave(engine, '2026-09-24T00:00:00.000Z');
    const restored = restoreKernelState(save);

    expect(save.saveVersion).toBe(KERNEL_SAVE_VERSION);
    expect(save.revision).toBe(engine.state.revision);
    expect(restored).toEqual(engine.state);
  });

  it('continues deterministically after restore', () => {
    const uninterrupted = createEngine();
    uninterrupted.step(24);

    const partial = createEngine();
    partial.step(12);
    const save = createKernelSave(partial, '2026-09-24T00:00:00.000Z');
    const restored = SimulationEngine.restore({
      state: restoreKernelState(save),
      systems: [trackingSystem],
      handlers: [noopHandler],
    });
    restored.step(12);

    expect(restored.state).toEqual(uninterrupted.state);
  });

  it('does not serialize runtime recent-command metadata', () => {
    const engine = createEngine();
    const command: GameCommand<'NOOP', Record<string, never>> = {
      commandId: 'runtime-only-command-id',
      baseRevision: 0,
      type: 'NOOP',
      payload: {},
    };
    engine.dispatch(command);

    expect(engine.recentCommandCount).toBe(1);

    const save = createKernelSave(engine, '2026-09-24T00:00:00.000Z');
    expect(JSON.stringify(save)).not.toContain('runtime-only-command-id');
  });

  it('encodes and restores a runtime world through an explicit world codec', () => {
    const engine = SimulationEngine.create({
      world: {
        name: 'codec-world',
        bytes: Uint8Array.from([0, 1, 2, 127, 255]),
      } satisfies RuntimeCodecWorld,
      seed: 'codec-save-seed',
    });
    engine.step(3);

    const save = createKernelSaveWithCodec(
      engine,
      '2026-09-24T00:00:00.000Z',
      runtimeWorldCodec,
    );
    const restored = restoreKernelStateWithCodec(save, runtimeWorldCodec);

    expect(save.state.world).toEqual({
      name: 'codec-world',
      bytes: [0, 1, 2, 127, 255],
    });
    expect(save.state.world).not.toBe(engine.state.world);
    expect(restored.revision).toBe(engine.state.revision);
    expect(restored.clock).toEqual(engine.state.clock);
    expect(restored.randomState).toEqual(engine.state.randomState);
    expect(restored.world.name).toBe('codec-world');
    expect(Array.from(restored.world.bytes)).toEqual([0, 1, 2, 127, 255]);
  });

  it('rejects an unsupported save version', () => {
    const save = createKernelSave(createEngine(), '2026-09-24T00:00:00.000Z');

    expect(() =>
      restoreKernelState({
        ...save,
        saveVersion: KERNEL_SAVE_VERSION + 1,
      }),
    ).toThrow(/unsupported kernel save version/i);
  });
});
