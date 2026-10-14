import { SIZE } from '../core/grid';
import { analyzeTraffic } from '../core/traffic';
import type { City } from '../core/city';

/**
 * Bounded, ephemeral street life driven by the city's actual road network,
 * workplaces and population. These are illustrations of aggregate activity,
 * not persisted traffic agents or a second simulation.
 */
export type AmbientPoint = Readonly<{x:number;y:number;phase:number}>;
export type AmbientStep = Readonly<{x:number;y:number}>;
export type AmbientLane = Readonly<{
  x:number;y:number;toX:number;toY:number;phase:number;period:number;bus:boolean;
  route:readonly AmbientStep[];alternate:readonly AmbientStep[];
  travelSeconds:number;restSeconds:number;density:number;
}>;
export type AmbientWalker = Readonly<{x:number;y:number;phase:number;duration:number;residents:number}>;
export type AmbientScene = Readonly<{
  lanes:readonly AmbientLane[];
  pedestrians:readonly AmbientWalker[];
  windows:readonly AmbientPoint[];
  factories:readonly AmbientPoint[];
  parks:readonly AmbientPoint[];
  water:readonly AmbientPoint[];
}>;

const hash=(a:number,b:number)=>((Math.imul(a^0x9e3779b9,1664525)+Math.imul(b+37,1013904223))>>>0);
const neighbors=(roads:readonly number[],index:number):number[]=>{
  const x=index%SIZE,y=Math.floor(index/SIZE),out:number[]=[];
  if(x>0&&roads[index-1])out.push(index-1);
  if(x<SIZE-1&&roads[index+1])out.push(index+1);
  if(y>0&&roads[index-SIZE])out.push(index-SIZE);
  if(y<SIZE-1&&roads[index+SIZE])out.push(index+SIZE);
  return out;
};
const point=(i:number):AmbientStep=>({x:i%SIZE,y:Math.floor(i/SIZE)});
function routeFrom(roads:readonly number[],start:number,seed:number):AmbientStep[]{
  const route=[start],seen=new Set<number>([start]);
  let previous=-1;
  for(let step=0;step<9;step++){
    const here=route[route.length-1]!;
    const all=neighbors(roads,here);
    const fresh=all.filter(i=>i!==previous&&!seen.has(i));
    const forward=all.filter(i=>i!==previous);
    const choices=fresh.length?fresh:forward.length?forward:all;
    if(!choices.length)break;
    const next=choices[hash(seed+step*17,here)%choices.length]!;
    previous=here;seen.add(next);route.push(next);
  }
  return route.map(point);
}
export type AnimatedVehicle=Readonly<{x:number;y:number;directionX:number;directionY:number;bus:boolean;alpha:number}>;

/** One trip follows connected road cells from start to destination, then rests.
 * Each subsequent trip may choose a different path/direction. There is no sine
 * wave shuttling back and forth on one road tile.
 */
export function sampleVehicle(lane:AmbientLane,seconds:number):AnimatedVehicle|null {
  const cycleDuration=lane.travelSeconds+lane.restSeconds;
  const offset=Math.max(0,seconds)+lane.phase*cycleDuration;
  const cycle=Math.floor(offset/cycleDuration);
  const current=offset-cycle*cycleDuration;
  if(current>=lane.travelSeconds)return null;
  if((hash(cycle+lane.x*71,lane.y*97)%1000)/1000>lane.density)return null;
  const path=cycle%3===1?lane.alternate:lane.route;
  if(path.length<2)return null;
  const reverse=cycle%4>=2;
  const distance=Math.min(path.length-1-1e-7,current/lane.travelSeconds*(path.length-1));
  const segment=Math.floor(distance);
  const t=distance-segment;
  const a=path[reverse?path.length-1-segment:segment]!;
  const b=path[reverse?path.length-2-segment:segment+1]!;
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
    directionX:b.x-a.x,directionY:b.y-a.y,bus:lane.bus,alpha:Math.min(1,current*3,(lane.travelSeconds-current)*2)};
}
export type AnimatedWalker=Readonly<{x:number;y:number;alpha:number}>;
export function sampleWalker(walker:AmbientWalker,seconds:number):AnimatedWalker|null {
  const cycle=walker.duration+3;
  const tick=seconds+walker.phase*cycle;
  const trip=Math.floor(tick/cycle),elapsed=tick-trip*cycle;
  // People walk to/from nearby amenities intermittently, not orbit constantly.
  if(elapsed>=walker.duration||hash(trip+walker.x*17,walker.y*23)%5===0)return null;
  const t=elapsed/walker.duration;
  const direction=trip%2===0?1:-1;
  return {x:walker.x+direction*(t-.5)*.6,y:walker.y+(t-.5)*.45,
    alpha:Math.min(1,elapsed*2,(walker.duration-elapsed)*2)};
}
export function nightLevel(seconds:number):number{
  // A short stylized day/night progression: dusk, dark, dawn, daytime.
  const phase=((seconds%72)+72)%72/72;
  return Math.max(0,Math.min(1,(phase-.40)*11, (0.94-phase)*13));
}
export function buildAmbientScene(city:City):AmbientScene {
  const volume=analyzeTraffic(city).roadVolume;
  const roads=city.roads;
  const ranked:number[]=[];
  for(let i=0;i<roads.length;i++){
    if(!roads[i]||neighbors(roads,i).length===0)continue;
    ranked.push(i);
  }
  ranked.sort((a,b)=>{
    const score=(i:number)=>Math.min(140,volume[i]??0)*10+(hash(i,city.seed)%700);
    return score(b)-score(a)||a-b;
  });
  const lanes:AmbientLane[]=[];
  const level=city.capitalProjects?.transit??0;
  for(const i of ranked){
    if(lanes.length>=32)break;
    const start=point(i);
    if(lanes.some(l=>Math.abs(l.x-start.x)+Math.abs(l.y-start.y)<3))continue;
    const k=hash(i,city.seed),path=routeFrom(roads,i,k),alternate=routeFrom(roads,i,k^0x5bd1e995);
    if(path.length<2)continue;
    const bus=(level>0||city.policy==='mobility')&&(k%8)<Math.min(6,level*2+(city.policy==='mobility'?2:0));
    const load=volume[i]??0;
    const density=Math.min(.97,Math.max(.26,.38+load/180));
    const travelSeconds=(bus?9:6.5)+(k%40)/10;
    const restSeconds=(bus?4:2.8)+(k%29)/10;
    const first=path[1]!;
    lanes.push({x:start.x,y:start.y,toX:first.x,toY:first.y,
      phase:(k%791)/791,period:travelSeconds+restSeconds,
      route:path,alternate,travelSeconds,restSeconds,density,bus});
  }
  const factories=city.buildings.filter(b=>b.kind===3).slice(0,7).map(b=>({x:b.x,y:b.y,phase:(hash(b.id,city.seed)%100)/100}));
  const parks=city.services.filter(s=>s.kind==='park').slice(0,8).map(s=>({x:s.x,y:s.y,phase:(hash(s.id,city.seed)%100)/100}));
  const occupiedBuildings=city.buildings.filter(b=>b.residents>0||b.jobs>0);
  const pedestrians=occupiedBuildings.filter((_,i)=>i%2===0).slice(0,24).map(b=>({
    x:b.x,y:b.y,phase:(hash(b.id,city.seed)%100)/100,duration:3+(b.id%5),residents:b.residents
  }));
  const windows=occupiedBuildings.filter((_,i)=>i%3===0).slice(0,32).map(b=>({
    x:b.x,y:b.y,phase:(hash(b.id+1000,city.seed)%100)/100
  }));
  const water:AmbientPoint[]=[];
  for(let i=0;i<city.land.length&&water.length<12;i++){
    if(city.land[i]!==0)continue;
    const v=hash(i,city.seed);
    if(v%39===0)water.push({x:i%SIZE,y:Math.floor(i/SIZE),phase:(v%100)/100});
  }
  return {lanes,pedestrians,windows,factories,parks,water};
}
