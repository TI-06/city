import { describe, expect, it } from 'vitest';
import {
  SIMULATION_HOURS_PER_YEAR,
  advanceClock,
  createSimulationClock,
} from '../../../src/simulation/core/simulation-clock';

describe('simulation clock', () => {
  it('advances by exact integer hours', () => {
    const start = createSimulationClock();
    expect(advanceClock(start, 24)).toEqual({ elapsedHours: 24 });
    expect(advanceClock({ elapsedHours: 240 }, 12)).toEqual({ elapsedHours: 252 });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid hour advancement %s',
    (hours) => {
      expect(() => advanceClock(createSimulationClock(), hours)).toThrow(/non-negative integer/i);
    },
  );

  it('keeps a 100-year horizon finite and safely integral', () => {
    const result = advanceClock(createSimulationClock(), SIMULATION_HOURS_PER_YEAR * 100);
    expect(result.elapsedHours).toBe(876_000);
    expect(Number.isSafeInteger(result.elapsedHours)).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid initial elapsed hours %s',
    (elapsedHours) => {
      expect(() => createSimulationClock(elapsedHours)).toThrow(/non-negative integer/i);
    },
  );
});
