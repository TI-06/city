import type {City,Building} from '../core/city';
import {getBuildingStyle} from './building-style';

/** Short-lived UI-only notifications, derived from two immutable city states. */
export type CityMoment=Readonly<{key:string;title:string;detail:string;kind:'milestone'|'construction'|'redevelopment'}>;
const checkpoints=[250,500,1000,2500,5000,10000,25000,50000,100000];
const population=(city:City)=>city.buildings.reduce((n,b)=>n+b.residents,0);

export function getCityMoment(previous:City,next:City):CityMoment|null{
  if(next.month<=previous.month||next.seed!==previous.seed)return null;
  const oldPop=population(previous),newPop=population(next);
  const milestone=checkpoints.find(p=>oldPop<p&&newPop>=p);
  if(milestone){
    return {key:`milestone-${next.month}-${milestone}`,title:`人口${milestone.toLocaleString('ja-JP')}人を突破！`,
      detail:'都市がひと回り成長しました。住宅と仕事、生活環境のバランスを確認しましょう。',kind:'milestone'};
  }
  const byId=new Map(previous.buildings.map(b=>[b.id,b]));
  const upgrades=next.buildings.filter(b=>{const old=byId.get(b.id);return old&&b.level>old.level;});
  if(upgrades.length){
    const b=upgrades[0]!;
    const old=byId.get(b.id)!;
    const oldStyle=getBuildingStyle(old,next.seed);
    const newStyle=getBuildingStyle(b,next.seed);
    const title=oldStyle.label===newStyle.label?`${newStyle.label}が増築されました！`
      :`${oldStyle.label}が${newStyle.label}に成長！`;
    return {key:`redevelopment-${next.month}-${b.id}`,title,
      detail:`区画 ${b.x}, ${b.y} の建物が Lv.${old.level} → Lv.${b.level} に発展しました。`,kind:'redevelopment'};
  }
  const built=next.buildings.filter(b=>!byId.has(b.id));
  if(built.length){
    const names=built.slice(0,2).map(b=>getBuildingStyle(b,next.seed).label);
    return {key:`construction-${next.month}`,title:`${built.length}棟の建物が新築！`,
      detail:`${names.join('・')}${built.length>2?' など':''}が街に加わりました。`,kind:'construction'};
  }
  return null;
}
export function buildingStyleLabel(city:City,x:number,y:number):string|null{
  const b:Building|undefined=city.buildings.find(v=>v.x===x&&v.y===y);
  return b?getBuildingStyle(b,city.seed).label:null;
}
