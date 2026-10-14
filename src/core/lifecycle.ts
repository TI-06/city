import type { City } from './city';

export type MaintenancePlan = 'minimum' | 'standard' | 'preventive';
export const MAINTENANCE_LABELS: Readonly<Record<MaintenancePlan,string>> = {
  minimum:'最低限の維持', standard:'標準保全', preventive:'予防保全',
};
const SPENDING_RATE:Readonly<Record<MaintenancePlan,number>> = {
  minimum:0.55, standard:1, preventive:1.42,
};
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
export const maintenancePlan=(city:City):MaintenancePlan=>city.maintenancePlan??'standard';
export const maintenanceBacklog=(city:City):number=>city.maintenanceBacklog??0;

export type LifecycleBudget=Readonly<{
  assetBase:number;
  renewalDue:number;
  renewalSpend:number;
  nextBacklog:number;
  backlog:number;
  condition:number;
  maturityServices:number;
  upkeepRatio:number;
  plan:MaintenancePlan;
}>;

/**
 * Aggregate fiscal model, deterministic from the present city and month.
 * No per-road annual service history or large new save arrays.
 * Month = 0 is a new city's asset condition, then the annual renewal
 * budget rises with city age. Existing saves default to standard/zero debt.
 */
export function infrastructureBudget(city:City):LifecycleBudget {
  let regular=0,arterial=0;
  for(const road of city.roads){
    if(road===1)regular++;
    else if(road===2)arterial++;
  }
  let parks=0,schools=0,clinics=0;
  for(const service of city.services){
    if(service.kind==='park')parks++;
    else if(service.kind==='school')schools++;
    else clinics++;
  }
  const assetBase=regular*3.1+arterial*11+parks*190+schools*1050+clinics*1250;
  const ageYears=city.month/12;
  const agingFactor=0.12+Math.min(1.4,ageYears/75*1.4);
  const renewalDue=Math.round(assetBase*agingFactor);
  const plan=maintenancePlan(city);
  const renewalSpend=Math.round(renewalDue*SPENDING_RATE[plan]);
  const backlog=maintenanceBacklog(city);
  const nextBacklog=clamp(backlog+renewalDue-renewalSpend,0,100_000_000);
  // Condition follows multi-year maintenance neglect, not a single unpaid month.
  const condition=clamp(Math.round(100-backlog/Math.max(900,assetBase*8)*75),12,100);
  let population=0;
  for(const building of city.buildings)population+=building.residents;
  // Mature cities need additional healthcare, welfare and public administration.
  const maturityServices=Math.round(population*.75*clamp(ageYears/80,0,1));
  return {
    assetBase:Math.round(assetBase),renewalDue,renewalSpend,nextBacklog,
    backlog,condition,maturityServices,upkeepRatio:SPENDING_RATE[plan],plan,
  };
}

export function nextMaintenanceBacklog(city:City):number {
  return infrastructureBudget(city).nextBacklog;
}
