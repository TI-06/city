import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../src/simulation/core/headless-runner';
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
});
