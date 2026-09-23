import { describe, expect, it } from 'vitest';
import type { GameCommand, MutationResponse } from '../../../src/shared/transport/game-command';
import type { CommandHandler } from '../../../src/simulation/core/command-handler';
import {
  SimulationEngine,
  UnknownSimulationCommandError,
} from '../../../src/simulation/core/simulation-engine';

type World = Readonly<{
  value: number;
  randomValue: number | null;
}>;

function incrementHandler(onApply?: () => void): CommandHandler<World> {
  return {
    type: 'INCREMENT',
    apply: (world, payload) => {
      onApply?.();

      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('amount' in payload) ||
        typeof payload.amount !== 'number'
      ) {
        throw new TypeError('INCREMENT requires numeric amount');
      }

      const value = world.value + payload.amount;
      return {
        world: { ...world, value },
        delta: { value },
      };
    },
  };
}

const randomizeHandler: CommandHandler<World> = {
  type: 'RANDOMIZE',
  apply: (world, _payload, context) => {
    const randomValue = context.random.nextUint32();
    return {
      world: { ...world, randomValue },
      delta: { randomValue },
    };
  },
};

const largeResponseHandler: CommandHandler<World> = {
  type: 'LARGE_RESPONSE',
  apply: (world) => ({
    world: { ...world, value: 999 },
    delta: { data: 'x'.repeat(129 * 1024) },
  }),
};

function createEngine(onIncrementApply?: () => void) {
  return SimulationEngine.create({
    world: { value: 0, randomValue: null } satisfies World,
    seed: 'engine-seed',
    handlers: [incrementHandler(onIncrementApply), randomizeHandler, largeResponseHandler],
  });
}

describe('SimulationEngine command dispatch', () => {
  it('applies a compact command once and increments the revision', () => {
    const engine = createEngine();
    const command: GameCommand<'INCREMENT', { amount: number }> = {
      commandId: 'cmd-1',
      baseRevision: 0,
      type: 'INCREMENT',
      payload: { amount: 2 },
    };

    const response = engine.dispatch(command) as MutationResponse<{ value: number }, never>;

    expect(response).toEqual({
      commandId: 'cmd-1',
      revision: 1,
      delta: { value: 2 },
      events: [],
    });
    expect(engine.state.revision).toBe(1);
    expect(engine.state.world.value).toBe(2);
  });

  it('replays a duplicate command without applying the mutation twice', () => {
    let applyCount = 0;
    const engine = createEngine(() => {
      applyCount += 1;
    });
    const command: GameCommand<'INCREMENT', { amount: number }> = {
      commandId: 'cmd-1',
      baseRevision: 0,
      type: 'INCREMENT',
      payload: { amount: 2 },
    };

    const first = engine.dispatch(command);
    const duplicate = engine.dispatch(command);

    expect(duplicate).toEqual(first);
    expect(engine.state.world.value).toBe(2);
    expect(engine.state.revision).toBe(1);
    expect(applyCount).toBe(1);
  });

  it('replays an earlier successful command after later revisions advance', () => {
    const engine = createEngine();
    const first: GameCommand<'INCREMENT', { amount: number }> = {
      commandId: 'cmd-1',
      baseRevision: 0,
      type: 'INCREMENT',
      payload: { amount: 2 },
    };
    const second: GameCommand<'INCREMENT', { amount: number }> = {
      commandId: 'cmd-2',
      baseRevision: 1,
      type: 'INCREMENT',
      payload: { amount: 3 },
    };

    const firstResponse = engine.dispatch(first);
    engine.dispatch(second);
    const retry = engine.dispatch(first);

    expect(retry).toEqual(firstResponse);
    expect(engine.state.world.value).toBe(5);
    expect(engine.state.revision).toBe(2);
  });

  it('returns a compact revision conflict without mutating state or RNG', () => {
    const engine = createEngine();
    const before = engine.state;
    const command: GameCommand<'RANDOMIZE', Record<string, never>> = {
      commandId: 'stale',
      baseRevision: 99,
      type: 'RANDOMIZE',
      payload: {},
    };

    const response = engine.dispatch(command);

    expect(response).toEqual({
      kind: 'REVISION_CONFLICT',
      expectedRevision: 99,
      actualRevision: 0,
    });
    expect(engine.state).toEqual(before);
  });

  it('rejects an oversized command before its handler executes', () => {
    let applyCount = 0;
    const engine = createEngine(() => {
      applyCount += 1;
    });
    const command: GameCommand<'INCREMENT', { amount: number; padding: string }> = {
      commandId: 'huge',
      baseRevision: 0,
      type: 'INCREMENT',
      payload: { amount: 1, padding: 'x'.repeat(257 * 1024) },
    };

    expect(() => engine.dispatch(command)).toThrow(/ordinary command hard limit/i);
    expect(applyCount).toBe(0);
    expect(engine.state.revision).toBe(0);
  });

  it('rejects an oversized response before committing state or caching it', () => {
    const engine = createEngine();
    const before = engine.state;
    const command: GameCommand<'LARGE_RESPONSE', Record<string, never>> = {
      commandId: 'large-response',
      baseRevision: 0,
      type: 'LARGE_RESPONSE',
      payload: {},
    };

    expect(() => engine.dispatch(command)).toThrow(/ordinary response target/i);
    expect(engine.state).toEqual(before);
    expect(engine.recentCommandCount).toBe(0);
  });

  it('throws for an unknown command without mutating state', () => {
    const engine = createEngine();
    const before = engine.state;
    const command: GameCommand<'UNKNOWN', Record<string, never>> = {
      commandId: 'unknown',
      baseRevision: 0,
      type: 'UNKNOWN',
      payload: {},
    };

    expect(() => engine.dispatch(command)).toThrow(UnknownSimulationCommandError);
    expect(engine.state).toEqual(before);
  });

  it('does not advance RNG when replaying a duplicate random command', () => {
    const engine = createEngine();
    const command: GameCommand<'RANDOMIZE', Record<string, never>> = {
      commandId: 'random-1',
      baseRevision: 0,
      type: 'RANDOMIZE',
      payload: {},
    };

    const response = engine.dispatch(command);
    const afterFirst = engine.state;
    const duplicate = engine.dispatch(command);

    expect(duplicate).toEqual(response);
    expect(engine.state.randomState).toEqual(afterFirst.randomState);
    expect(engine.state.world.randomValue).toBe(afterFirst.world.randomValue);
  });
});
