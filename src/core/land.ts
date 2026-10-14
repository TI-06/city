import { SIZE } from './grid';
import type { City, Zone } from './city';
import { analyzeTraffic, getRoadCapacity } from './traffic';

export type LandAnalysis = Readonly<{
  values: Uint8Array;
  average: number;
  averageResidential: number;
  desirableTiles: number;
}>;

const cell=(x:number,y:number)=>y*SIZE+x;
const inside=(x:number,y:number)=>x>=0&&y>=0&&x<SIZE&&y<SIZE;

/**
 * City-state-derived neighborhood attractiveness, never serialized.
 * Project building/service influence locally: O(grid + entities * radius²).
 */
export function analyzeLand(city:City): LandAnalysis {
  const values=new Float32Array(SIZE*SIZE);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const i=cell(x,y);
    if(city.land[i]===0)continue;
    const roadAccess=(x>0&&(city.roads[i-1]??0)>0)
      ||(x<SIZE-1&&(city.roads[i+1]??0)>0)
      ||(y>0&&(city.roads[i-SIZE]??0)>0)
      ||(y<SIZE-1&&(city.roads[i+SIZE]??0)>0);
    const waterfront=(x>0&&city.land[i-1]===0)||(x<SIZE-1&&city.land[i+1]===0)
      ||(y>0&&city.land[i-SIZE]===0)||(y<SIZE-1&&city.land[i+SIZE]===0);
    values[i]=38+(roadAccess?10:-8)+(waterfront?6:0);
  }

  const project=(x:number,y:number,radius:number,impact:number)=>{
    for(let dy=-radius;dy<=radius;dy++){
      const ty=y+dy;if(ty<0||ty>=SIZE)continue;
      for(let dx=-radius;dx<=radius;dx++){
        const tx=x+dx;if(tx<0||tx>=SIZE)continue;
        const d=Math.abs(dx)+Math.abs(dy);
        if(d>radius)continue;
        const i=cell(tx,ty);
        if(city.land[i]===0)continue;
        values[i] = values[i]! + impact*(radius+1-d)/(radius+1);
      }
    }
  };

  for(const service of city.services){
    if(service.kind==='park')project(service.x,service.y,6,28);
    else if(service.kind==='school')project(service.x,service.y,5,13);
    else project(service.x,service.y,5,11);
  }
  for(const building of city.buildings){
    if(building.kind===3)project(building.x,building.y,6,-23*building.level/2);
    else if(building.kind===2)project(building.x,building.y,4,8);
  }

  // Wide roads ease access but create local noise; assess road load separately.
  const traffic=analyzeTraffic(city);
  for(let i=0;i<city.roads.length;i++){
    if(city.roads[i]!==2)continue;
    project(i%SIZE,Math.floor(i/SIZE),1,-3);
  }
  for(let i=0;i<city.roads.length;i++){
    const capacity=getRoadCapacity(city.roads[i]!);
    if(!capacity)continue;
    const ratio=(traffic.roadVolume[i]??0)/capacity;
    if(ratio>1)project(i%SIZE,Math.floor(i/SIZE),2,-Math.min(15,(ratio-1)*6));
  }

  const result=new Uint8Array(values.length);
  let total=0,landCount=0,desirableTiles=0;
  for(let i=0;i<values.length;i++){
    if(city.land[i]===0)continue;
    const value=Math.max(0,Math.min(100,Math.round(values[i]!)));
    result[i]=value;
    total+=value;landCount++;
    if(value>=65)desirableTiles++;
  }
  let residenceTotal=0,residenceCount=0;
  for(const building of city.buildings){
    if(building.kind!==1)continue;
    residenceTotal+=result[cell(building.x,building.y)]??0;
    residenceCount++;
  }
  return {
    values:result,
    average:landCount?Math.round(total/landCount):0,
    averageResidential:residenceCount?Math.round(residenceTotal/residenceCount):0,
    desirableTiles,
  };
}

/** Favor desirable housing, well-situated commercial areas, and cheaper industrial land. */
export function developmentWeight(zone:Exclude<Zone,0>,landValue:number):number{
  if(zone===1)return Math.max(5,landValue);
  if(zone===2)return Math.max(5,80-Math.abs(landValue-60));
  return Math.max(5,105-landValue);
}
