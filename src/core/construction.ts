import type {Building,City,Zone} from './city';

/** Private development sites advance on the city's MONTHLY clock.
 * Optional in schema 1: older saves simply have no sites in progress.
 * A site may share a building ID only while upgrading that same building.
 */
export type ConstructionSite=Readonly<{
  id:number;x:number;y:number;kind:Exclude<Zone,0>;level:number;
  startMonth:number;duration:number;upgradeFrom?:number;
}>;
export type ConstructionPhase='foundation'|'frame'|'finishing';
export function constructionDuration(kind:Exclude<Zone,0>,level:number,upgrade=false):number{
  if(upgrade)return level>=3?6:3;
  return kind===1?1:kind===2?2:3;
}
export function constructionProgress(site:ConstructionSite,month:number):number{
  return Math.max(0,Math.min(1,(month-site.startMonth)/site.duration));
}
export function constructionPhase(site:ConstructionSite,month:number):ConstructionPhase{
  const progress=constructionProgress(site,month);
  return progress<.2?'foundation':progress<.8?'frame':'finishing';
}
export function siteAt(city:City,x:number,y:number):ConstructionSite|undefined{
  return city.construction?.find(s=>s.x===x&&s.y===y);
}
export function remainingMonths(site:ConstructionSite,month:number):number{
  return Math.max(0,site.startMonth+site.duration-month);
}
export function describeConstruction(site:ConstructionSite,month:number):string{
  const work=site.upgradeFrom?'増築・建て替え':'新築';
  const category=site.kind===1?'住宅':site.kind===2?'商業':'工業';
  return `${category} Lv.${site.level} の${work}中（${constructionPhase(site,month)==='foundation'?'基礎工事':constructionPhase(site,month)==='frame'?'建設中':'仕上げ'}・残り${remainingMonths(site,month)}か月）`;
}
/** Mutates only the cloned simulation state, never the input city. */
export function finishConstruction(city:City):number{
  let finished=0;
  const outstanding:ConstructionSite[]=[];
  for(const site of city.construction??[]){
    if(remainingMonths(site,city.month)>0){outstanding.push(site);continue;}
    if(site.upgradeFrom!==undefined){
      const existing=city.buildings.find(b=>b.id===site.id);
      if(existing&&existing.level===site.upgradeFrom){
        existing.level=site.level;
        if(existing.kind!==1)existing.jobs=existing.kind===2?8+site.level*5:12+site.level*8;
        finished++;
      }
    }else{
      const building:Building={id:site.id,x:site.x,y:site.y,kind:site.kind,
        level:site.level,residents:0,jobs:site.kind===1?0:site.kind===2?8+site.level*5:12+site.level*8};
      city.buildings.push(building);finished++;
    }
  }
  city.construction=outstanding;
  return finished;
}
