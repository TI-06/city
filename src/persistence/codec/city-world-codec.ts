import type { WorldSaveCodec } from '../../simulation/core/kernel-save';
import { createCityWorldState, type CityWorldState } from '../../simulation/world/city-world-state';
import {
  decodeBuildingState,
  encodeBuildingState,
  type EncodedBuildingState,
} from './building-codec';
import { decodeCompanyState, encodeCompanyState, type EncodedCompanyState } from './company-codec';
import {
  decodeDevelopmentDemandState,
  encodeDevelopmentDemandState,
  type EncodedDevelopmentDemandState,
} from './development-demand-codec';
import { decodeEconomyState, encodeEconomyState, type EncodedEconomyState } from './economy-codec';
import {
  decodeHouseholdState,
  encodeHouseholdState,
  type EncodedHouseholdState,
} from './household-codec';
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

export const CITY_WORLD_CODEC_VERSION = 4;

export type EncodedCityWorldState = Readonly<{
  codecVersion: typeof CITY_WORLD_CODEC_VERSION;
  map: EncodedWorldMapState;
  roads: EncodedRoadNetworkState;
  zoning: EncodedZoningState;
  buildings: EncodedBuildingState;
  developmentDemand: EncodedDevelopmentDemandState;
  households: EncodedHouseholdState;
  companies: EncodedCompanyState;
  economy: EncodedEconomyState;
}>;

export function encodeCityWorldState(world: CityWorldState): EncodedCityWorldState {
  const validated = createCityWorldState(
    world.map,
    world.roads,
    world.zoning,
    world.buildings,
    world.developmentDemand,
    world.households,
    world.companies,
    world.economy,
  );

  return {
    codecVersion: CITY_WORLD_CODEC_VERSION,
    map: encodeWorldMapState(validated.map),
    roads: encodeRoadNetworkState(validated.roads),
    zoning: encodeZoningState(validated.zoning),
    buildings: encodeBuildingState(validated.buildings),
    developmentDemand: encodeDevelopmentDemandState(validated.developmentDemand),
    households: encodeHouseholdState(validated.households),
    companies: encodeCompanyState(validated.companies),
    economy: encodeEconomyState(validated.economy),
  };
}

export function decodeCityWorldState(saved: EncodedCityWorldState): CityWorldState {
  if (saved.codecVersion !== CITY_WORLD_CODEC_VERSION) {
    throw new RangeError('Unsupported city world codec version; expected 4');
  }

  return createCityWorldState(
    decodeWorldMapState(saved.map),
    decodeRoadNetworkState(saved.roads),
    decodeZoningState(saved.zoning),
    decodeBuildingState(saved.buildings),
    decodeDevelopmentDemandState(saved.developmentDemand),
    decodeHouseholdState(saved.households),
    decodeCompanyState(saved.companies),
    decodeEconomyState(saved.economy),
  );
}

export const cityWorldSaveCodec: WorldSaveCodec<CityWorldState, EncodedCityWorldState> = {
  encode: encodeCityWorldState,
  decode: decodeCityWorldState,
};
