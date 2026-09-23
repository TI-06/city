import { describe, expect, it } from 'vitest';
import {
  assertSaveWithinBudget,
  SAVE_BUDGET_STARTER_BYTES,
} from '../../src/persistence/save/save-budget';
import { measureJsonBytes } from '../../src/shared/serialization/measure-json-bytes';
import type { GameCommand } from '../../src/shared/transport/game-command';
import type { CommandHandler } from '../../src/simulation/core/command-handler';
import { runHeadless } from '../../src/simulation/core/headless-runner';
import { createKernelSave } from '../../src/simulation/core/kernel-save';
import { SIMULATION_HOURS_PER_YEAR } from '../../src/simulation/core/simulation-clock';
import { SimulationEngine } from '../../src/simulation/core/simulation-engine';

describe('simulation kernel long-run soak', () => {
  it('runs an empty world for 100 years deterministically with finite state', () => {
    const hours = SIMULATION_HOURS_PER_YEAR * 100;
    const a = SimulationEngine.create({ world: { marker: 'empty' }, seed: '100-year-soak' });
    const b = SimulationEngine.create({ world: { marker: 'empty' }, seed: '100-year-soak' });

    const stateA = runHeadless(a, hours);
    const stateB = runHeadless(b, hours);

    expect(stateA).toEqual(stateB);
    expect(stateA.clock.elapsedHours).toBe(876_000);
    expect(stateA.revision).toBe(876_000);
    expect(Number.isSafeInteger(stateA.clock.elapsedHours)).toBe(true);
    expect(Number.isSafeInteger(stateA.revision)).toBe(true);
    expect(JSON.stringify(stateA)).not.toMatch(/NaN|Infinity/);
  });

  it('does not grow a save linearly with 10,000 historical commands', () => {
    type World = Readonly<{ marker: string }>;
    const noopHandler: CommandHandler<World> = {
      type: 'NOOP',
      apply: (world) => ({ world, delta: {} }),
    };
    const engine = SimulationEngine.create({
      world: { marker: 'stable-world' } satisfies World,
      seed: 'history-growth',
      handlers: [noopHandler],
    });
    const savedAtIso = '2026-09-24T00:00:00.000Z';
    const before = createKernelSave(engine, savedAtIso);
    const beforeBytes = measureJsonBytes(before);

    for (let index = 0; index < 10_000; index += 1) {
      const command: GameCommand<'NOOP', Record<string, never>> = {
        commandId: `cmd-${index}`,
        baseRevision: engine.state.revision,
        type: 'NOOP',
        payload: {},
      };
      engine.dispatch(command);
    }

    const after = createKernelSave(engine, savedAtIso);
    const afterBytes = measureJsonBytes(after);

    expect(engine.recentCommandCount).toBe(256);
    expect(afterBytes - beforeBytes).toBeLessThan(128);
    expect(JSON.stringify(after)).not.toContain('cmd-9999');
    expect(() => assertSaveWithinBudget(after, SAVE_BUDGET_STARTER_BYTES)).not.toThrow();
  });
});
