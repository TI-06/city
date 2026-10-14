import type { City } from './city';

export type CapitalKind='transit'|'housing'|'culture';
export type CapitalProjects=Record<CapitalKind,number>;
export const CAPITAL_LABELS:Readonly<Record<CapitalKind,string>>={
  transit:'交通ネットワーク強化',
  housing:'住宅負担支援',
  culture:'文化・生活環境',
};
export const CAPITAL_NOTES:Readonly<Record<CapitalKind,string>>={
  transit:'通勤時の道路負荷を軽減。運行維持費が増える',
  housing:'市が家賃の一部を補助。人口に応じた支援費が増える',
  culture:'住民満足度を底上げ。施設運営費が増える',
};
export const CAPITAL_MAX_LEVEL=3;
const PRICES:Readonly<Record<CapitalKind,readonly number[]>>={
  transit:[35_000,100_000,250_000],
  housing:[25_000,80_000,180_000],
  culture:[45_000,110_000,260_000],
};
export function capitalLevel(city:City,kind:CapitalKind):number{
  return city.capitalProjects?.[kind]??0;
}
/** Cost of the NEXT permanent project level; undefined at max level. */
export function capitalNextCost(city:City,kind:CapitalKind):number|undefined {
  return PRICES[kind][capitalLevel(city,kind)];
}
export function capitalOperatingCost(city:City,population:number):number {
  const transit=capitalLevel(city,'transit');
  const housing=capitalLevel(city,'housing');
  const culture=capitalLevel(city,'culture');
  return Math.round(transit*(65+transit*18)+housing*(45+population*.21)+culture*(58+culture*20));
}
export function validateCapitalProjects(value:unknown):boolean {
  if(value===undefined)return true;
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const obj=value as Record<string,unknown>;
  return Object.keys(obj).length===3
    &&Object.keys(CAPITAL_LABELS).every(k=>Number.isInteger(obj[k])&&(obj[k] as number)>=0&&(obj[k] as number)<=CAPITAL_MAX_LEVEL);
}
