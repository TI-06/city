import { SIZE } from './grid';
import type { Building, City } from './city';

/**
 * Phase 2: deterministic, aggregate road-network commute + freight model.
 * This analysis is DERIVED data: never add its volumes or routing caches to save files.
 * No per-person vehicles or unbounded historical route data are retained.
 */
export const ROAD_CAPACITY = 85;
const MAX_DELAY = 8;
const CELL_COUNT = SIZE * SIZE;
const LABOR_RATIO = 0.53;

type Network = Readonly<{ componentByTile: Int32Array; componentCount: number }>;
// Rebuild from current tiles: no stale graph when a test/import mutates an existing grid.

export type TrafficAnalysis = Readonly<{
  roadComponents: number;
  roadVolume: Float64Array;
  employed: number;
  inaccessibleResidents: number;
  roadlessJobs: number;
  congestedRoads: number;
  worstRoadLoad: number;
  congestion: number;
  averageCommute: number;
  productivity: number;
}>;

function neighbors(index: number, roads: readonly number[]): number[] {
  const x = index % SIZE;
  const y = Math.floor(index / SIZE);
  const next: number[] = [];
  if (y > 0 && roads[index - SIZE] === 1) next.push(index - SIZE);
  if (x > 0 && roads[index - 1] === 1) next.push(index - 1);
  if (x < SIZE - 1 && roads[index + 1] === 1) next.push(index + 1);
  if (y < SIZE - 1 && roads[index + SIZE] === 1) next.push(index + SIZE);
  return next;
}

function getNetwork(roads: number[]): Network {
  const componentByTile = new Int32Array(CELL_COUNT).fill(-1);
  let componentCount = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (roads[i] !== 1 || componentByTile[i]! >= 0) continue;
    const queue = [i];
    componentByTile[i] = componentCount;
    for (let q = 0; q < queue.length; q++) {
      for (const neighbor of neighbors(queue[q]!, roads)) {
        if (componentByTile[neighbor]! >= 0) continue;
        componentByTile[neighbor] = componentCount;
        queue.push(neighbor);
      }
    }
    componentCount++;
  }
  return { componentByTile, componentCount };
}

/** Select a building's lowest-index orthogonally adjacent road tile. */
export function buildingRoadAccess(roads: readonly number[], x: number, y: number): number | undefined {
  const adjacent: number[] = [];
  if (y > 0 && roads[(y - 1) * SIZE + x] === 1) adjacent.push((y - 1) * SIZE + x);
  if (x > 0 && roads[y * SIZE + x - 1] === 1) adjacent.push(y * SIZE + x - 1);
  if (x < SIZE - 1 && roads[y * SIZE + x + 1] === 1) adjacent.push(y * SIZE + x + 1);
  if (y < SIZE - 1 && roads[(y + 1) * SIZE + x] === 1) adjacent.push((y + 1) * SIZE + x);
  return adjacent.length ? Math.min(...adjacent) : undefined;
}

type Anchor = Readonly<{ building: Building; access: number; component: number }>;

export function analyzeTraffic(city: City): TrafficAnalysis {
  const roads = city.roads;
  if (roads.length !== CELL_COUNT) throw new RangeError('Invalid road grid length');
  const network = getNetwork(roads);
  const roadVolume = new Float64Array(CELL_COUNT);
  const populationByComponent = new Float64Array(network.componentCount);
  const jobsByComponent = new Float64Array(network.componentCount);
  const homeAnchors: Anchor[] = [];
  const jobAnchors: Anchor[] = [];
  let inaccessibleResidents = 0;
  let roadlessJobs = 0;

  // Stable entity ordering makes the same saved city reproduce the same traffic.
  for (const b of [...city.buildings].sort((a, c) => a.id - c.id)) {
    const access = buildingRoadAccess(roads, b.x, b.y);
    const component = access === undefined ? -1 : network.componentByTile[access]!;
    if (b.kind === 1 && b.residents > 0) {
      if (component < 0 || access === undefined) inaccessibleResidents += b.residents;
      else {
        populationByComponent[component] = populationByComponent[component]! + b.residents;
        homeAnchors.push({ building: b, access, component });
      }
    } else if (b.kind !== 1 && b.jobs > 0) {
      if (component < 0 || access === undefined) roadlessJobs += b.jobs;
      else {
        jobsByComponent[component] = jobsByComponent[component]! + b.jobs;
        jobAnchors.push({ building: b, access, component });
      }
    }
  }

  const employmentByComponent = new Float64Array(network.componentCount);
  let employmentTotal = 0;
  for (let comp = 0; comp < network.componentCount; comp++) {
    const employed = Math.min(Math.round(populationByComponent[comp]! * LABOR_RATIO), jobsByComponent[comp]!);
    employmentByComponent[comp] = employed;
    employmentTotal += employed;
    if (jobsByComponent[comp] === 0) inaccessibleResidents += populationByComponent[comp]!;
  }

  // Multi-source shortest paths: each populated road tile knows the nearest workplace.
  const nextToJob = new Int32Array(CELL_COUNT).fill(-1);
  const distance = new Int32Array(CELL_COUNT).fill(-1);
  const queue: number[] = [];
  const jobSources = [...new Set(jobAnchors.map(a => a.access))].sort((a, b) => a - b);
  for (const source of jobSources) {
    distance[source] = 0;
    queue.push(source);
  }
  for (let q = 0; q < queue.length; q++) {
    const current = queue[q]!;
    for (const neighbor of neighbors(current, roads)) {
      if (distance[neighbor]! >= 0) continue;
      distance[neighbor] = distance[current]! + 1;
      nextToJob[neighbor] = current;
      queue.push(neighbor);
    }
  }

  let commuteDistance = 0;
  let routedEmployees = 0;
  for (const home of homeAnchors) {
    const people = populationByComponent[home.component]!;
    const employedComp = employmentByComponent[home.component]!;
    if (people === 0 || employedComp <= 0 || distance[home.access]! < 0) continue;
    const weightedWorkers = employedComp * (home.building.residents / people);
    routedEmployees += weightedWorkers;
    commuteDistance += weightedWorkers * distance[home.access]!;
    let road = home.access;
    // Distances strictly decrease on every hop: no infinite routing loops.
    while (road >= 0) {
      roadVolume[road] = roadVolume[road]! + weightedWorkers;
      road = nextToJob[road]!;
    }
  }

  // Deliveries create localized freight traffic without persisting vehicle agents.
  for (const business of jobAnchors) roadVolume[business.access] = roadVolume[business.access]! + business.building.jobs * 0.15;

  let congestedRoads = 0;
  let worstRoadLoad = 0;
  let weightedDelay = 0;
  let totalRoadLoad = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    const load = roadVolume[i]!;
    if (load <= 0) continue;
    if (load > ROAD_CAPACITY) congestedRoads++;
    worstRoadLoad = Math.max(worstRoadLoad, load);
    const saturation = load / ROAD_CAPACITY;
    const delay = Math.min(MAX_DELAY, 1 + 0.15 * Math.pow(saturation, 4));
    totalRoadLoad += load;
    weightedDelay += load * delay;
  }
  const avgDelay = totalRoadLoad === 0 ? 1 : weightedDelay / totalRoadLoad;
  const congestion = Math.round(100 * (1 - 1 / avgDelay));
  return {
    roadComponents: network.componentCount,
    roadVolume,
    employed: Math.min(employmentTotal, Math.round(city.buildings.reduce((n, b) => n + b.residents, 0) * LABOR_RATIO)),
    inaccessibleResidents: Math.round(inaccessibleResidents),
    roadlessJobs,
    congestedRoads,
    worstRoadLoad: Math.round(worstRoadLoad),
    congestion,
    averageCommute: routedEmployees === 0 ? 0 : Math.round(commuteDistance / routedEmployees * 10) / 10,
    productivity: Math.max(0.65, 1 - congestion * 0.0035),
  };
}
