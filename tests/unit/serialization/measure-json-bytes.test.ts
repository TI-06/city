import { describe, expect, it } from 'vitest';
import { measureJsonBytes } from '../../../src/shared/serialization/measure-json-bytes';

describe('measureJsonBytes', () => {
  it('measures the UTF-8 encoded JSON payload', () => {
    const value = { city: '街' };

    expect(measureJsonBytes(value)).toBe(
      new TextEncoder().encode(JSON.stringify(value)).byteLength,
    );
  });

  it('does not use JavaScript string length for multibyte text', () => {
    const value = { city: '習志野市' };

    expect(measureJsonBytes(value)).toBeGreaterThan(JSON.stringify(value).length);
  });
});
