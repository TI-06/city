import { describe, expect, it } from 'vitest';
import {
  ORDINARY_COMMAND_HARD_LIMIT_BYTES,
  ORDINARY_COMMAND_TARGET_BYTES,
  ORDINARY_RESPONSE_TARGET_BYTES,
  assertOrdinaryCommandSize,
} from '../../../src/shared/transport/command-budget';
import type { GameCommand } from '../../../src/shared/transport/game-command';

describe('command payload budgets', () => {
  it('defines the architecture budgets from the design spec', () => {
    expect(ORDINARY_COMMAND_TARGET_BYTES).toBe(64 * 1024);
    expect(ORDINARY_COMMAND_HARD_LIMIT_BYTES).toBe(256 * 1024);
    expect(ORDINARY_RESPONSE_TARGET_BYTES).toBe(128 * 1024);
  });

  it('accepts a compact ordinary command', () => {
    const command: GameCommand<'BUILD_ROAD', { start: [number, number]; end: [number, number] }> = {
      commandId: 'cmd-1',
      baseRevision: 12,
      type: 'BUILD_ROAD',
      payload: { start: [1, 2], end: [9, 2] },
    };

    expect(() => assertOrdinaryCommandSize(command)).not.toThrow();
  });

  it('rejects an ordinary command larger than the hard application limit', () => {
    const command: GameCommand<'DEBUG_BULK', { data: string }> = {
      commandId: 'cmd-too-large',
      baseRevision: 12,
      type: 'DEBUG_BULK',
      payload: { data: 'x'.repeat(ORDINARY_COMMAND_HARD_LIMIT_BYTES + 1024) },
    };

    expect(() => assertOrdinaryCommandSize(command)).toThrow(
      /exceeds ordinary command hard limit/i,
    );
  });
});
