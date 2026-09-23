import type { SimulationClockState } from './simulation-clock';
import type { SeededRandom } from './seeded-random';

export type CommandApplyContext = Readonly<{
  clock: SimulationClockState;
  random: SeededRandom;
}>;

export type CommandApplication<TWorld> = Readonly<{
  world: TWorld;
  delta: unknown;
  events?: readonly unknown[];
}>;

export type CommandHandler<TWorld> = Readonly<{
  type: string;
  apply: (
    world: TWorld,
    payload: unknown,
    context: CommandApplyContext,
  ) => CommandApplication<TWorld>;
}>;
