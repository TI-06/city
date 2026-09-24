import type { WorldSaveCodec } from '../../simulation/core/kernel-save';
import {
  createCityWorldState,
  type CityWorldState,
} from '../../simulation/world/city-world-state';
import {
  decodeRoadNetworkState,
  encodeRoadNetworkState,
  type EncodedRoadNetworkState,
} from './road-network-codec';
import {
  decodeWorldMapState,
  encodeWorldMapState,
  type EncodedWorldMapState,
} from './world-map-codec';

export type EncodedCityWorldState = Readonly<{
  map: EncodedWorldMapState;
  roads: EncodedRoadNetworkState;
}>;

export function encodeCityWorldState(
  world: CityWorldState,
): EncodedCityWorldState {
  const validated = createCityWorldState(world.map, world.roads);

  return {
    map: encodeWorldMapState(validated.map),
    roads: encodeRoadNetworkState(validated.roads),
  };
}

export function decodeCityWorldState(
  saved: EncodedCityWorldState,
): CityWorldState {
  return createCityWorldState(
    decodeWorldMapState(saved.map),
    decodeRoadNetworkState(saved.roads),
  );
}

export const cityWorldSaveCodec: WorldSaveCodec<
  CityWorldState,
  EncodedCityWorldState
> = {
  encode: encodeCityWorldState,
  decode: decodeCityWorldState,
};
