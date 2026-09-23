import type {
  GameCommand,
  MutationResponse,
  RevisionConflict,
} from '../../shared/transport/game-command';
import { assertOrdinaryCommandSize } from '../../shared/transport/command-budget';
import type { CommandHandler } from './command-handler';
import { DEFAULT_RECENT_COMMAND_LIMIT, RecentCommandCache } from './recent-command-cache';
import { advanceClock, createSimulationClock } from './simulation-clock';
import { SeededRandom, type RandomSeed } from './seeded-random';
import type { SimulationState } from './simulation-state';
import type { SimulationSystem } from './simulation-system';

export type SimulationDispatchResult = MutationResponse<unknown, unknown> | RevisionConflict;

type SimulationEngineCreateOptions<TWorld> = Readonly<{
  world: TWorld;
  seed: RandomSeed;
  handlers?: readonly CommandHandler<TWorld>[];
  systems?: readonly SimulationSystem<TWorld>[];
  recentCommandLimit?: number;
}>;

type SimulationEngineRestoreOptions<TWorld> = Readonly<{
  state: SimulationState<TWorld>;
  handlers?: readonly CommandHandler<TWorld>[];
  systems?: readonly SimulationSystem<TWorld>[];
  recentCommandLimit?: number;
}>;

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
}

export class UnknownSimulationCommandError extends Error {
  public constructor(public readonly commandType: string) {
    super(`Unknown simulation command: ${commandType}`);
    this.name = 'UnknownSimulationCommandError';
  }
}

export class SimulationEngine<TWorld> {
  private currentState: SimulationState<TWorld>;
  private readonly handlers = new Map<string, CommandHandler<TWorld>>();
  private readonly systems: readonly SimulationSystem<TWorld>[];
  private readonly recentCommands: RecentCommandCache<MutationResponse<unknown, unknown>>;

  private constructor(
    state: SimulationState<TWorld>,
    handlers: readonly CommandHandler<TWorld>[],
    systems: readonly SimulationSystem<TWorld>[],
    recentCommandLimit: number,
  ) {
    this.currentState = state;

    for (const handler of handlers) {
      if (this.handlers.has(handler.type)) {
        throw new Error(`Duplicate simulation command handler: ${handler.type}`);
      }
      this.handlers.set(handler.type, handler);
    }

    const systemIds = new Set<string>();
    for (const system of systems) {
      if (systemIds.has(system.id)) {
        throw new Error(`Duplicate simulation system: ${system.id}`);
      }
      systemIds.add(system.id);
    }
    this.systems = [...systems];

    this.recentCommands = new RecentCommandCache(recentCommandLimit);
  }

  public static create<TWorld>(
    options: SimulationEngineCreateOptions<TWorld>,
  ): SimulationEngine<TWorld> {
    const random = SeededRandom.fromSeed(options.seed);
    const state: SimulationState<TWorld> = {
      revision: 0,
      clock: createSimulationClock(),
      randomState: random.snapshot(),
      world: options.world,
    };

    return new SimulationEngine(
      state,
      options.handlers ?? [],
      options.systems ?? [],
      options.recentCommandLimit ?? DEFAULT_RECENT_COMMAND_LIMIT,
    );
  }

  public static restore<TWorld>(
    options: SimulationEngineRestoreOptions<TWorld>,
  ): SimulationEngine<TWorld> {
    assertNonNegativeInteger(options.state.revision, 'Simulation revision');
    const clock = createSimulationClock(options.state.clock.elapsedHours);
    const random = SeededRandom.fromState(options.state.randomState);
    const state: SimulationState<TWorld> = {
      revision: options.state.revision,
      clock,
      randomState: random.snapshot(),
      world: options.state.world,
    };

    return new SimulationEngine(
      state,
      options.handlers ?? [],
      options.systems ?? [],
      options.recentCommandLimit ?? DEFAULT_RECENT_COMMAND_LIMIT,
    );
  }

  public get state(): SimulationState<TWorld> {
    return this.currentState;
  }

  public get recentCommandCount(): number {
    return this.recentCommands.size;
  }

  public dispatch<TType extends string, TPayload>(
    command: GameCommand<TType, TPayload>,
  ): SimulationDispatchResult {
    assertOrdinaryCommandSize(command);

    const cached = this.recentCommands.get(command.commandId);
    if (cached !== undefined) {
      return cached;
    }

    if (command.baseRevision !== this.currentState.revision) {
      return {
        kind: 'REVISION_CONFLICT',
        expectedRevision: command.baseRevision,
        actualRevision: this.currentState.revision,
      };
    }

    const handler = this.handlers.get(command.type);
    if (handler === undefined) {
      throw new UnknownSimulationCommandError(command.type);
    }

    const random = SeededRandom.fromState(this.currentState.randomState);
    const application = handler.apply(this.currentState.world, command.payload, {
      clock: this.currentState.clock,
      random,
    });

    const revision = this.currentState.revision + 1;
    if (!Number.isSafeInteger(revision)) {
      throw new RangeError('Simulation revision exceeded safe integer range');
    }

    const response: MutationResponse<unknown, unknown> = {
      commandId: command.commandId,
      revision,
      delta: application.delta,
      events: application.events ?? [],
    };

    this.currentState = {
      revision,
      clock: this.currentState.clock,
      randomState: random.snapshot(),
      world: application.world,
    };
    this.recentCommands.set(command.commandId, response);

    return response;
  }

  public step(hours = 1): SimulationState<TWorld> {
    assertPositiveInteger(hours, 'Simulation step hours');

    const revision = this.currentState.revision + hours;
    if (!Number.isSafeInteger(revision)) {
      throw new RangeError('Simulation revision exceeded safe integer range');
    }

    let world = this.currentState.world;
    let clock = this.currentState.clock;
    const random = SeededRandom.fromState(this.currentState.randomState);

    for (let hour = 0; hour < hours; hour += 1) {
      for (const system of this.systems) {
        world = system.step(world, { clock, random });
      }
      clock = advanceClock(clock, 1);
    }

    this.currentState = {
      revision,
      clock,
      randomState: random.snapshot(),
      world,
    };

    return this.currentState;
  }
}
