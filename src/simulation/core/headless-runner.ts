import type { SimulationEngine } from './simulation-engine';
import type { SimulationState } from './simulation-state';

export function runHeadless<TWorld>(
  engine: SimulationEngine<TWorld>,
  hours: number,
): SimulationState<TWorld> {
  return engine.step(hours);
}
