export const SIZE = 64;
export const T = Object.freeze({ GRASS: 0, WATER: 1, FOREST: 2 });
export const Z = Object.freeze({ NONE: 0, HOME: 1, SHOP: 2, INDUSTRY: 3 });
export const key = (x, y) => `${x},${y}`;
export const inside = (x, y, size = SIZE) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;

export function hash(seed, x, y) {
  let h = (seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createTerrain(seed, size = SIZE) {
  const tiles = new Array(size * size).fill(T.GRASS);
  for (let y = 0; y < size; y++) {
    const river = Math.floor(size * 0.21 + Math.sin(y / 5 + seed * 0.1) * 2.5);
    for (let x = 0; x < size; x++) {
      const n = hash(seed, x, y);
      const riverCell = x >= river && x <= river + 2;
      tiles[y * size + x] = riverCell ? T.WATER : n > 0.88 ? T.FOREST : T.GRASS;
    }
  }
  return tiles;
}

export function hasRoadAccess(city, x, y) {
  return [[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy]) => inside(x + dx, y + dy, city.size) && city.roads[(y + dy) * city.size + x + dx] === 1);
}

export function findTile(city, x, y) {
  if (!inside(x, y, city.size)) return null;
  const i = y * city.size + x;
  return {
    x, y, terrain: city.terrain[i], road: city.roads[i] === 1,
    zone: city.zones[i], building: city.buildings.find(b => b.x === x && b.y === y) ?? null,
    service: city.services.find(s => s.x === x && s.y === y) ?? null,
    access: hasRoadAccess(city, x, y),
  };
}
