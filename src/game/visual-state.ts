import type { City } from '../core/city';

export type CityMood='crisis'|'repairs'|'developing'|'stable';
export type GrowthEvent=Readonly<{x:number;y:number;kind:'new'|'upgrade'|'service'}>;

export function visualMood(city:City):CityMood {
  if(city.funds<0)return 'crisis';
  const arrears=city.maintenanceBacklog??0;
  // Avoid flagging trivial inherited debt as a citywide disaster.
  const roads=city.roads.reduce((n,r)=>n+(r>0?1:0),0);
  if(arrears>Math.max(8000,roads*25))return 'repairs';
  if(city.month>=24&&city.buildings.length>=140)return 'developing';
  return 'stable';
}

/** Effects are visual-only; a restore/rewind must not spawn a city's entire history. */
export function detectGrowthEvents(before:City,after:City,limit=10):readonly GrowthEvent[] {
  if(after.month<before.month || after.seed!==before.seed || after.name!==before.name)return [];
  const previous=new Map(before.buildings.map(b=>[b.id,b]));
  const oldServices=new Set(before.services.map(s=>s.id));
  const events:GrowthEvent[]=[];
  for(const b of after.buildings){
    const prior=previous.get(b.id);
    if(prior&&prior.level>=b.level)continue;
    if(!prior&&before.month===after.month)continue; // Manual restore/import into a running city.
    events.push({x:b.x,y:b.y,kind:prior?'upgrade':'new'});
    if(events.length>=limit)return events;
  }
  for(const service of after.services){
    if(oldServices.has(service.id))continue;
    events.push({x:service.x,y:service.y,kind:'service'});
    if(events.length>=limit)return events;
  }
  return events;
}

/** A single pulse lives for 3 seconds; keep max 10 concurrent markers. */
export type GrowthPulse=GrowthEvent&Readonly<{createdAt:number}>;
export function appendGrowthPulses(current:readonly GrowthPulse[],changes:readonly GrowthEvent[],time:number):GrowthPulse[] {
  return [
    ...current.filter(p=>time-p.createdAt<3),
    ...changes.map(change=>({...change,createdAt:time})),
  ].slice(-10);
}
