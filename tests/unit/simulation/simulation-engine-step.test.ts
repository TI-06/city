import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../../src/simulation/core/headless-runner';
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

function createEngine() {
  return SimulationEngine.create({
    world: { steps: 0, randomTrace: [] } satisfies World,
    seed: 'step-seed',
    systems: [trackingSystem],
  });
}

describe('SimulationEngine stepping', () => {
  it('runs deterministic systems with clock and RNG context', () => {
    const engine = createEngine();

    engine.step();

    expect(engine.state.world.steps).toBe(1);
    expect(engine.state.world.randomTrace).toHaveLength(1);
    expect(engine.state.clock.elapsedHours).toBe(1);
    expect(engine.state.revision).toBe(1);
  });

  it('makes a batched step equivalent to repeated one-hour steps', () => {
    const batched = createEngine();
    const repeated = createEngine();

    batched.step(24);
    for (let hour = 0; hour < 24; hour += 1) {
      repeated.step(1);
    }

    expect(batched.state).toEqual(repeated.state);
  });

  it('produces identical state for the same seed and horizon', () => {
    const a = createEngine();
    const b = createEngine();

    expect(runHeadless(a, 72)).toEqual(runHeadless(b, 72));
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid step count %s',
    (hours) => {
      expect(() => createEngine().step(hours)).toThrow(/positive integer/i);
    },
  );
});
