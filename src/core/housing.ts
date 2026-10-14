import type { City, Building } from './city';
import type { LandAnalysis } from './land';
import { SIZE } from './grid';

/**
 * Housing occupancy is stored in Building.residents (schema v1).
 * Capacity is derived from building level; rent and migration are forecasts.
 * No individual agents or per-month household data are persisted.
 */
export function housingCapacity(level: number): number {
  return 6 + level * 6;
}

export type HousingMarket = Readonly<{
  capacity: number;
  occupied: number;
  vacant: number;
  demandGap: number;
  estimatedRent: number;
  rentBurden: number;
  affordability: number;
  monthlyMigrationEstimate: number;
  averageHousingLand: number;
}>;

function clamp(value:number,min:number,max:number):number {
  return Math.max(min,Math.min(max,value));
}
const tile=(b:Building)=>b.y*SIZE+b.x;

export function assessHousing(
  city:City,
  employed:number,
  happiness:number,
  land:Pick<LandAnalysis,'values'>,
):HousingMarket {
  let capacity=0,occupied=0,totalValue=0,numberOfHomes=0;
  let jobSlots=0;
  for (const b of city.buildings) {
    if (b.kind===1) {
      capacity+=housingCapacity(b.level);
      occupied+=b.residents;
      totalValue+=land.values[tile(b)]??45;
      numberOfHomes++;
    } else jobSlots+=b.jobs;
  }
  const vacant=Math.max(0,capacity-occupied);
  const averageHousingLand=numberOfHomes?Math.round(totalValue/numberOfHomes):45;
  // Jobs and city conditions create indicative pressure; not an actual waiting list.
  const targetResidents=Math.max(0,Math.round((jobSlots/0.53)*0.90*clamp(happiness/75,0.55,1.25)+25));
  const demandGap=Math.max(0,targetResidents-capacity);
  const pressure=clamp(0.6+0.43*Math.log1p(targetResidents/Math.max(1,capacity)),0.65,1.95);
  const estimatedRent=Math.round((2.5+averageHousingLand*0.035)*pressure*10)/10;
  // Explicit estimated non-wage household support avoids a zero-income divide.
  // Empty new towns have potential wage earners rather than zero-income tenants.
  const workingShare=occupied>0?employed/occupied:Math.min(0.53,jobSlots*0.53/Math.max(12,capacity));
  const availableIncome=4+18*workingShare;
  const rentBurden=Math.round(100*estimatedRent/availableIncome);
  const affordability=Math.round(clamp(110-1.4*Math.max(0,rentBurden-28),0,100));
  const workingPopulation=Math.round(occupied*0.53);
  const jobless=Math.max(0,workingPopulation-employed);
  const unemployment=jobless/Math.max(1,workingPopulation);
  const departure=Math.min(occupied,Math.ceil(
    (unemployment>0.24?jobless*0.028:0)+
    (rentBurden>65?occupied*0.008:0)+
    (happiness<35?occupied*0.007:0)
  ));
  const opportunity=Math.max(0,jobSlots-employed);
  const attraction=clamp((happiness-25)/50,0.2,1);
  const entry=happiness>=35&&rentBurden<=95?
    Math.min(vacant,Math.max(0,Math.floor(opportunity*0.11*attraction)),8):0;
  return {
    capacity,occupied,vacant,demandGap,estimatedRent,rentBurden,
    affordability,monthlyMigrationEstimate:entry-departure,averageHousingLand,
  };
}

/**
 * Apply a bounded monthly net-migration forecast to dwellings.
 * Most desirable buildings fill first; least desirable housing empties first.
 * This mutates only the cloned, in-progress simulation state.
 */
export function applyHousingMigration(city:City,market:HousingMarket,land:Pick<LandAnalysis,'values'>):void {
  const remaining=Math.abs(market.monthlyMigrationEstimate);
  if (!remaining) return;
  const coming=market.monthlyMigrationEstimate>0;
  const homes=city.buildings.filter(b=>b.kind===1)
    .sort((a,b)=>{
      const scoreA=land.values[tile(a)]??0;
      const scoreB=land.values[tile(b)]??0;
      return (coming?scoreB-scoreA:scoreA-scoreB)||a.id-b.id;
    });
  let budget=remaining;
  for(const home of homes){
    if(budget<=0)break;
    const room=coming?Math.max(0,housingCapacity(home.level)-home.residents):home.residents;
    const changed=Math.min(room,budget);
    home.residents+=coming?changed:-changed;
    budget-=changed;
  }
}
