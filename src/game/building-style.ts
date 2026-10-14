import type { Building, City } from '../core/city';

/** Visual archetypes are reproducible from an existing schema-1 Building.
 * All styles are cosmetic: population/jobs/cost never depend on them.
 */
export type BuildingStyleName =
  'cottage'|'townhouse'|'apartment'|'residential-tower'|
  'storefront'|'market'|'office'|'shopping-plaza'|
  'workshop'|'factory'|'industrial-plant'|'logistics-hub';

export type BuildingStyle=Readonly<{
  name:BuildingStyleName;
  label:string;
  height:number;
  roof:number;
  left:number;
  right:number;
  accent:number;
  silhouette:'pitched'|'terraced'|'tower'|'awning'|'glass'|'shed'|'industrial';
}>;
const hash=(x:number,y:number,seed:number)=>{
  let n=Math.imul(x+13,73856093)^Math.imul(y+19,19349663)^seed;
  n=Math.imul(n^(n>>>16),2246822519);
  return (n^(n>>>13))>>>0;
};
const spec=(name:BuildingStyleName,label:string,height:number,roof:number,left:number,right:number,
  accent:number,silhouette:BuildingStyle['silhouette']):BuildingStyle=>
  ({name,label,height,roof,left,right,accent,silhouette});
export function getBuildingStyle(b:Building,seed:number):BuildingStyle{
  const variation=hash(b.x,b.y,seed),palette=variation%3;
  const level=Math.max(1,Math.min(3,b.level));
  if(b.kind===1){
    if(level===1)return variation%4===0
      ?spec('townhouse','連棟住宅',24,0xc97559,0xf0dcc4,0xd5b197,0xffe8b0,'terraced')
      :spec('cottage','戸建て住宅',19+palette*2,[0xb56e57,0xc8855c,0x9c6559][palette]!,
        0xf4dfc7,0xdab89c,0xf9e7bb,'pitched');
    if(level===2)return variation%3===0
      ?spec('townhouse','低層住宅街',33,0x945a4a,0xe9d7c4,0xc7aa93,0xe8c17f,'terraced')
      :spec('apartment','低層マンション',42+palette*2,0x7d9a9f,0xf3ede0,0xb6c8c4,0xffdfa0,'terraced');
    return variation%3===0
      ?spec('residential-tower','高層マンション',72+palette*4,0x5f8b92,0xe7eff1,0x99b9c3,0xcdeff0,'tower')
      :spec('apartment','中層マンション',59+palette*3,0x7f9da9,0xf0e9d9,0xb7c4c0,0xd8ebf0,'terraced');
  }
  if(b.kind===2){
    if(level===1)return variation%2===0
      ?spec('storefront','商店',29,0xb58a63,0xf0d8b1,0xd2b789,0xe78e6c,'awning')
      :spec('market','市場・小売店',34,0x7fb4af,0xf6dfbe,0xc6b297,0x60b7a4,'awning');
    if(level===2)return variation%2===0
      ?spec('office','オフィスビル',56+palette*4,0x5c8aa0,0xc5dfe4,0x8db5c3,0xffde91,'glass')
      :spec('shopping-plaza','商業施設',46+palette*2,0x8c849b,0xe6ddd6,0xb7a8b0,0xf4c071,'awning');
    return spec('office','高層オフィス',79+palette*5,0x4e7f97,0xc1dbe9,0x7bafc7,0xf5e0aa,'tower');
  }
  if(level===1)return variation%2===0
    ?spec('workshop','小規模工場',29,0xa88d76,0xd6c4ac,0xb2a495,0xcea97d,'shed')
    :spec('factory','工場',38,0x9c8780,0xc5b9aa,0x9c9e96,0xc99067,'industrial');
  if(level===2)return variation%2===0
    ?spec('industrial-plant','産業プラント',51+palette*4,0x8b9297,0xc2bdad,0x929ca4,0xd6a56c,'industrial')
    :spec('logistics-hub','物流拠点',44+palette*2,0x76969b,0xbdcbc4,0x92adaf,0xe1bc79,'shed');
  return spec('industrial-plant','大型産業プラント',66+palette*4,0x707c8a,0xc0b8ac,0x87959c,0xd3a879,'industrial');
}
export function citySkyline(city:City):Readonly<{cottages:number;apartments:number;towers:number;shops:number;plants:number}>{
  let cottages=0,apartments=0,towers=0,shops=0,plants=0;
  for(const b of city.buildings){
    const style=getBuildingStyle(b,city.seed);
    if(b.kind===1){
      if(style.name==='cottage'||style.name==='townhouse')cottages++;
      else if(style.name==='residential-tower')towers++;
      else apartments++;
    } else if(b.kind===2)shops++;
    else plants++;
  }
  return {cottages,apartments,towers,shops,plants};
}
