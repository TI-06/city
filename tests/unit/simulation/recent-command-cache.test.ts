import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECENT_COMMAND_LIMIT,
  RecentCommandCache,
} from '../../../src/simulation/core/recent-command-cache';

describe('RecentCommandCache', () => {
  it('stores and replays a response by command id', () => {
    const cache = new RecentCommandCache<string>();
    cache.set('cmd-1', 'response-1');

    expect(cache.get('cmd-1')).toBe('response-1');
    expect(cache.size).toBe(1);
    expect(DEFAULT_RECENT_COMMAND_LIMIT).toBe(256);
  });

  it('evicts the oldest command when the limit is exceeded', () => {
    const cache = new RecentCommandCache<number>(2);
    cache.set('cmd-1', 1);
    cache.set('cmd-2', 2);
    cache.set('cmd-3', 3);

    expect(cache.get('cmd-1')).toBeUndefined();
    expect(cache.get('cmd-2')).toBe(2);
    expect(cache.get('cmd-3')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('refreshes an updated command as the newest entry', () => {
    const cache = new RecentCommandCache<number>(2);
    cache.set('cmd-1', 1);
    cache.set('cmd-2', 2);
    cache.set('cmd-1', 10);
    cache.set('cmd-3', 3);

    expect(cache.get('cmd-1')).toBe(10);
    expect(cache.get('cmd-2')).toBeUndefined();
    expect(cache.get('cmd-3')).toBe(3);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid cache limit %s',
    (limit) => {
      expect(() => new RecentCommandCache(limit)).toThrow(/positive integer/i);
    },
  );
});
