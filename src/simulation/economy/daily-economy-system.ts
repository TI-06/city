import { SIMULATION_HOURS_PER_DAY } from '../core/simulation-clock';
import type { SimulationSystem } from '../core/simulation-system';
import type { CityWorldState } from '../world/city-world-state';
import { deriveDailyEconomyFlow } from './daily-economy-flow';
import { applyTreasuryDelta } from './economy-state';

export function createDailyEconomySystem(): SimulationSystem<CityWorldState> {
  return {
    id: 'daily-economy',
    step: (world, context) => {
      const nextElapsedHour = context.clock.elapsedHours + 1;
      if (nextElapsedHour % SIMULATION_HOURS_PER_DAY !== 0) {
        return world;
      }

      const flow = deriveDailyEconomyFlow(world);
      const economy = applyTreasuryDelta(world.economy, flow.net);
      if (economy === world.economy) {
        return world;
      }

      return {
        ...world,
        economy,
      };
    },
  };
}
