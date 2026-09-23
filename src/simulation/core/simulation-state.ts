import type { SimulationClockState } from './simulation-clock';
import type { RandomState } from './seeded-random';

export type SimulationState<TWorld> = Readonly<{
  revision: number;
  clock: SimulationClockState;
  randomState: RandomState;
  world: TWorld;
}>;
