import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../../../src/simulation/core/seeded-random';

describe('SeededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const a = SeededRandom.fromSeed('city-seed-001');
    const b = SeededRandom.fromSeed('city-seed-001');

    const sequenceA = Array.from({ length: 32 }, () => a.nextUint32());
    const sequenceB = Array.from({ length: 32 }, () => b.nextUint32());

    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces a different sequence for different seeds', () => {
    const a = SeededRandom.fromSeed('city-seed-001');
    const b = SeededRandom.fromSeed('city-seed-002');

    const sequenceA = Array.from({ length: 16 }, () => a.nextUint32());
    const sequenceB = Array.from({ length: 16 }, () => b.nextUint32());

    expect(sequenceA).not.toEqual(sequenceB);
  });

  it('restores the exact continuation from a snapshot', () => {
    const original = SeededRandom.fromSeed(20260924);

    for (let i = 0; i < 20; i += 1) {
      original.nextUint32();
    }

    const restored = SeededRandom.fromState(original.snapshot());

    const originalContinuation = Array.from({ length: 40 }, () => original.nextUint32());
    const restoredContinuation = Array.from({ length: 40 }, () => restored.nextUint32());

    expect(restoredContinuation).toEqual(originalContinuation);
  });

  it('keeps nextFloat inside the half-open unit interval', () => {
    const random = SeededRandom.fromSeed('float-range');

    for (let i = 0; i < 10_000; i += 1) {
      const value = random.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
