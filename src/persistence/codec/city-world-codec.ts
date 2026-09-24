import type { WorldSaveCodec } from '../../simulation/core/kernel-save';
import { createCityWorldState, type CityWorldState } from '../../simulation/world/city-world-state';
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
import { decodeZoningState, encodeZoningState, type EncodedZoningState } from './zoning-codec';

export const CITY_WORLD_CODEC_VERSION = 1;

export type EncodedCityWorldState = Readonly<{
  codecVersion: typeof CITY_WORLD_CODEC_VERSION;
  map: EncodedWorldMapState;
  roads: EncodedRoadNetworkState;
  zoning: EncodedZoningState;
}>;

export function encodeCityWorldState(world: CityWorldState): EncodedCityWorldState {
  const validated = createCityWorldState(world.map, world.roads, world.zoning);

  return {
    codecVersion: CITY_WORLD_CODEC_VERSION,
    map: encodeWorldMapState(validated.map),
    roads: encodeRoadNetworkState(validated.roads),
    zoning: encodeZoningState(validated.zoning),
  };
}

export function decodeCityWorldState(saved: EncodedCityWorldState): CityWorldState {
  if (saved.codecVersion !== CITY_WORLD_CODEC_VERSION) {
    throw new RangeError('Unsupported city world codec version; expected 1');
  }

  return createCityWorldState(
    decodeWorldMapState(saved.map),
    decodeRoadNetworkState(saved.roads),
    decodeZoningState(saved.zoning),
  );
}

export const cityWorldSaveCodec: WorldSaveCodec<CityWorldState, EncodedCityWorldState> = {
  encode: encodeCityWorldState,
  decode: decodeCityWorldState,
};
