import { assertGridCoordinate, createGridDimensions, type GridDimensions } from './grid-dimensions';

export const BYTE_GRID_CHUNK_SIZE = 32;
export const BYTE_GRID_CHUNK_BYTES = BYTE_GRID_CHUNK_SIZE * BYTE_GRID_CHUNK_SIZE;

function assertByteValue(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 255) {
    throw new RangeError('Byte value must be an integer between 0 and 255');
  }
}

function chunkShape(dimensions: GridDimensions): Readonly<{
  chunksAcross: number;
  chunksDown: number;
  chunkCount: number;
}> {
  const chunksAcross = Math.ceil(dimensions.width / BYTE_GRID_CHUNK_SIZE);
  const chunksDown = Math.ceil(dimensions.height / BYTE_GRID_CHUNK_SIZE);

  return {
    chunksAcross,
    chunksDown,
    chunkCount: chunksAcross * chunksDown,
  };
}

function locate(
  dimensions: GridDimensions,
  chunksAcross: number,
  x: number,
  y: number,
): Readonly<{ chunkIndex: number; localIndex: number }> {
  assertGridCoordinate(dimensions, x, y);

  const chunkX = Math.floor(x / BYTE_GRID_CHUNK_SIZE);
  const chunkY = Math.floor(y / BYTE_GRID_CHUNK_SIZE);
  const localX = x % BYTE_GRID_CHUNK_SIZE;
  const localY = y % BYTE_GRID_CHUNK_SIZE;

  return {
    chunkIndex: chunkY * chunksAcross + chunkX,
    localIndex: localY * BYTE_GRID_CHUNK_SIZE + localX,
  };
}

export class ChunkedByteGrid {
  private readonly chunksAcross: number;

  private constructor(
    private readonly gridDimensions: GridDimensions,
    private readonly chunks: readonly Uint8Array[],
  ) {
    this.chunksAcross = chunkShape(gridDimensions).chunksAcross;
  }

  public static filled(dimensions: GridDimensions, value: number): ChunkedByteGrid {
    const validated = createGridDimensions(dimensions.width, dimensions.height);
    assertByteValue(value);

    const shape = chunkShape(validated);
    const chunks = Array.from({ length: shape.chunkCount }, () => {
      const chunk = new Uint8Array(BYTE_GRID_CHUNK_BYTES);
      chunk.fill(value);
      return chunk;
    });

    return new ChunkedByteGrid(validated, chunks);
  }

  public static generate(
    dimensions: GridDimensions,
    initializer: (x: number, y: number) => number,
  ): ChunkedByteGrid {
    const validated = createGridDimensions(dimensions.width, dimensions.height);
    const shape = chunkShape(validated);
    const chunks = Array.from(
      { length: shape.chunkCount },
      () => new Uint8Array(BYTE_GRID_CHUNK_BYTES),
    );

    for (let y = 0; y < validated.height; y += 1) {
      for (let x = 0; x < validated.width; x += 1) {
        const value = initializer(x, y);
        assertByteValue(value);
        const position = locate(validated, shape.chunksAcross, x, y);
        chunks[position.chunkIndex]![position.localIndex] = value;
      }
    }

    return new ChunkedByteGrid(validated, chunks);
  }

  public static fromChunks(
    dimensions: GridDimensions,
    chunkSize: number,
    chunks: readonly Uint8Array[],
  ): ChunkedByteGrid {
    const validated = createGridDimensions(dimensions.width, dimensions.height);

    if (chunkSize !== BYTE_GRID_CHUNK_SIZE) {
      throw new RangeError(
        `Chunk size ${chunkSize} is unsupported; expected ${BYTE_GRID_CHUNK_SIZE}`,
      );
    }

    const expectedCount = chunkShape(validated).chunkCount;
    if (chunks.length !== expectedCount) {
      throw new RangeError(
        `Chunk count ${chunks.length} does not match expected chunk count ${expectedCount}`,
      );
    }

    const copiedChunks = chunks.map((chunk, index) => {
      if (chunk.length !== BYTE_GRID_CHUNK_BYTES) {
        throw new RangeError(
          `Chunk byte length at index ${index} is ${chunk.length}; expected ${BYTE_GRID_CHUNK_BYTES}`,
        );
      }
      return new Uint8Array(chunk);
    });

    return new ChunkedByteGrid(validated, copiedChunks);
  }

  public get dimensions(): GridDimensions {
    return this.gridDimensions;
  }

  public get chunkCount(): number {
    return this.chunks.length;
  }

  public get(x: number, y: number): number {
    const position = locate(this.gridDimensions, this.chunksAcross, x, y);
    return this.chunks[position.chunkIndex]![position.localIndex]!;
  }

  public withCell(x: number, y: number, value: number): ChunkedByteGrid {
    assertByteValue(value);
    const position = locate(this.gridDimensions, this.chunksAcross, x, y);
    const nextChunks = [...this.chunks];
    const nextChunk = new Uint8Array(nextChunks[position.chunkIndex]!);
    nextChunk[position.localIndex] = value;
    nextChunks[position.chunkIndex] = nextChunk;

    return new ChunkedByteGrid(this.gridDimensions, nextChunks);
  }

  public copyChunks(): readonly Uint8Array[] {
    return this.chunks.map((chunk) => new Uint8Array(chunk));
  }
}
