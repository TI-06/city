export const MAX_MAP_AXIS_CELLS = 512;

export type GridDimensions = Readonly<{
  width: number;
  height: number;
}>;

function assertAxis(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_MAP_AXIS_CELLS) {
    throw new RangeError(`${label} must be an integer between 1 and ${MAX_MAP_AXIS_CELLS}`);
  }
}

export function createGridDimensions(width: number, height: number): GridDimensions {
  assertAxis(width, 'width');
  assertAxis(height, 'height');

  return { width, height };
}

export function gridCellCount(dimensions: GridDimensions): number {
  const validated = createGridDimensions(dimensions.width, dimensions.height);
  return validated.width * validated.height;
}

export function assertGridCoordinate(
  dimensions: GridDimensions,
  x: number,
  y: number,
): void {
  createGridDimensions(dimensions.width, dimensions.height);

  if (
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= dimensions.width ||
    y >= dimensions.height
  ) {
    throw new RangeError(
      `Grid coordinate (${x}, ${y}) is outside 0..${dimensions.width - 1}, 0..${dimensions.height - 1}`,
    );
  }
}
