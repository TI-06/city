import type { SimulationClockState } from './simulation-clock';
import type { SeededRandom } from './seeded-random';

export type SimulationStepContext = Readonly<{
  clock: SimulationClockState;
  random: SeededRandom;
}>;

export type SimulationSystem<TWorld> = Readonly<{
  id: string;
  step: (world: TWorld, context: SimulationStepContext) => TWorld;
}>;
