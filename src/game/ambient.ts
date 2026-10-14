import { SIZE } from '../core/grid';
import type { City } from '../core/city';

/**
 * Tiny, bounded, purely visual agents. Not actual routed vehicles or persisted data.
 * All positions are rebuilt only when city infrastructure changes.
 */
export type AmbientLane=Readonly<{x:number;y:number;toX:number;toY:number;phase:number;period:number;bus:boolean}>;
export type AmbientPoint=Readonly<{x:number;y:number;phase:number}>;
export type AmbientScene=Readonly<{
  lanes:readonly AmbientLane[];
  factories:readonly AmbientPoint[];
  parks:readonly AmbientPoint[];
  water:readonly AmbientPoint[];
}>;
const hash=(i:number,seed:number)=>Math.imul(i+17,1103515245)^Math.imul(seed+37,12345);
const occupied=(roads:readonly number[],x:number,y:number)=>x>=0&&y>=0&&x<SIZE&&y<SIZE&&(roads[y*SIZE+x]??0)>0;
export function buildAmbientScene(city:City):AmbientScene {
  const lanes:AmbientLane[]=[];
  const busLevel=city.capitalProjects?.transit??0;
  for(let y=0;y<SIZE&&lanes.length<32;y++)for(let x=0;x<SIZE&&lanes.length<32;x++){
    if(!occupied(city.roads,x,y))continue;
    const index=y*SIZE+x;
    const k=hash(index,city.seed)>>>0;
    if(k%6!==0)continue;
    const horizontal=(k%2===0)&&occupied(city.roads,x+1,y);
    const vertical=occupied(city.roads,x,y+1);
    if(!horizontal&&!vertical)continue;
    const toX=horizontal?x+1:x, toY=horizontal?y:y+1;
    lanes.push({x,y,toX,toY,phase:(k%791)/791,period:2.4+(k%37)/12,
      bus:busLevel>0&&(k%8)<busLevel*2});
  }
  const factories=city.buildings.filter(b=>b.kind===3).slice(0,7).map(b=>({x:b.x,y:b.y,phase:(hash(b.id,city.seed)>>>0)%100/100}));
  const parks=city.services.filter(s=>s.kind==='park').slice(0,8).map(s=>({x:s.x,y:s.y,phase:(hash(s.id,city.seed)>>>0)%100/100}));
  const water:AmbientPoint[]=[];
  for(let i=0;i<city.land.length&&water.length<12;i++){
    if(city.land[i]!==0)continue;
    const v=hash(i,city.seed)>>>0;
    if(v%39===0)water.push({x:i%SIZE,y:Math.floor(i/SIZE),phase:(v%100)/100});
  }
  return {lanes,factories,parks,water};
}
