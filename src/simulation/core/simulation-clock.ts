export type SimulationClockState = Readonly<{
  elapsedHours: number;
}>;

export const SIMULATION_HOURS_PER_DAY = 24;
export const SIMULATION_DAYS_PER_YEAR = 365;
export const SIMULATION_HOURS_PER_YEAR = SIMULATION_HOURS_PER_DAY * SIMULATION_DAYS_PER_YEAR;

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
}

export function createSimulationClock(elapsedHours = 0): SimulationClockState {
  assertNonNegativeInteger(elapsedHours, 'elapsedHours');
  return { elapsedHours };
}

export function advanceClock(clock: SimulationClockState, hours: number): SimulationClockState {
  assertNonNegativeInteger(clock.elapsedHours, 'clock.elapsedHours');
  assertNonNegativeInteger(hours, 'hours');

  const elapsedHours = clock.elapsedHours + hours;
  assertNonNegativeInteger(elapsedHours, 'result elapsedHours');

  return { elapsedHours };
}
