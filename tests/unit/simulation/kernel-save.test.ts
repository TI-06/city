import { describe, expect, it } from 'vitest';
import type { GameCommand } from '../../../src/shared/transport/game-command';
import type { CommandHandler } from '../../../src/simulation/core/command-handler';
import {
  createKernelSave,
  KERNEL_SAVE_VERSION,
  restoreKernelState,
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
