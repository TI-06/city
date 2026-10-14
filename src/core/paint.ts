import { SIZE, type Tool } from './city';

export type TilePoint = Readonly<{ x: number; y: number }>;
export type InteractionMode = 'pan' | 'paint';

export function canDragPaint(tool: Tool): boolean {
  return tool === 'road' || tool === 'arterial' || tool === 'home' || tool === 'shop' || tool === 'industry' || tool === 'bulldoze';
}

/** Add Manhattan-connected tiles even if the pointer jumps between events. */
export function appendLine(path: readonly TilePoint[], destination: TilePoint, limit = 256): TilePoint[] {
  const result = [...path];
  if (result.length === 0) return insideTile(destination) ? [destination] : [];
  let { x, y } = result[result.length - 1]!;
  const seen = new Set(result.map(p => `${p.x},${p.y}`));
  while ((x !== destination.x || y !== destination.y) && result.length < limit) {
    const dx = destination.x - x;
    const dy = destination.y - y;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) x += Math.sign(dx);
    else if (dy !== 0) y += Math.sign(dy);
    else break;
    const point = { x, y };
    if (!insideTile(point)) break;
    const key = `${x},${y}`;
    if (!seen.has(key)) { result.push(point); seen.add(key); }
  }
  return result;
}

export function insideTile(p: TilePoint): boolean {
  return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE;
}