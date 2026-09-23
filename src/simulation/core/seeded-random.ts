export type RandomSeed = string | number;
export type RandomState = readonly [number, number, number, number];

const UINT32_RANGE = 0x1_0000_0000;
const UINT32_MAX = 0xffff_ffff;

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function hashSeed(seed: RandomSeed): number {
  if (typeof seed === 'number' && !Number.isFinite(seed)) {
    throw new RangeError('Random seed number must be finite');
  }

  const text = String(seed);
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

function createSplitMix32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0;
    return (value ^ (value >>> 15)) >>> 0;
  };
}

function validateState(state: RandomState): void {
  for (const value of state) {
    if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
      throw new RangeError('Random state values must be uint32 integers');
    }
  }

  if (state.every((value) => value === 0)) {
    throw new RangeError('Random state must not be all zero');
  }
}

export class SeededRandom {
  private constructor(private readonly state: [number, number, number, number]) {}

  public static fromSeed(seed: RandomSeed): SeededRandom {
    const splitMix = createSplitMix32(hashSeed(seed));
    const state: [number, number, number, number] = [
      splitMix(),
      splitMix(),
      splitMix(),
      splitMix(),
    ];

    if (state.every((value) => value === 0)) {
      state[0] = 1;
    }

    return new SeededRandom(state);
  }

  public static fromState(state: RandomState): SeededRandom {
    validateState(state);
    return new SeededRandom([...state]);
  }

  public nextUint32(): number {
    const [state0, state1, state2, state3] = this.state;
    const result = Math.imul(rotateLeft(Math.imul(state1, 5) >>> 0, 7), 9) >>> 0;
    const shifted = (state1 << 9) >>> 0;

    this.state[2] = (state2 ^ state0) >>> 0;
    this.state[3] = (state3 ^ state1) >>> 0;
    this.state[1] = (state1 ^ this.state[2]) >>> 0;
    this.state[0] = (state0 ^ this.state[3]) >>> 0;
    this.state[2] = (this.state[2] ^ shifted) >>> 0;
    this.state[3] = rotateLeft(this.state[3], 11);

    return result;
  }

  public nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  public snapshot(): RandomState {
    return [...this.state];
  }
}
