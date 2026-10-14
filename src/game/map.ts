import { Application, Container, Graphics, type Ticker } from 'pixi.js';
import { buildAmbientScene, sampleVehicle, sampleWalker, nightLevel, type AmbientScene } from './ambient';
import {visibleTileWindow,paddedTileWindow,needsTileWindowRefresh,structureDetailAtZoom,tileNearViewport,type TileWindow,type StructureDetail} from './viewport';
import {appendGrowthPulses,detectGrowthEvents,visualMood,constructionStage,CONSTRUCTION_SECONDS,type CityMood,type GrowthPulse} from './visual-state';
import { canPlaceAt, type City, type Building, type Tool, SIZE, tileIndex } from '../core/city';
import { analyzeTraffic, getRoadCapacity } from '../core/traffic';
import { analyzeLand } from '../core/land';
import {getBuildingStyle} from './building-style';
import {constructionPhase,constructionProgress,type ConstructionSite} from '../core/construction';
import { appendLine, canDragPaint, insideTile, type InteractionMode, type TilePoint } from '../core/paint';

const HW = 26;
const HH = 13;
const GROUND = [0x84bb77, 0x8bc480, 0x7caf74, 0x92c686, 0x83b974];
const COVERAGE = [0, 0xcceaaa, 0x92d6cf, 0xe6bb9d];
const SERVICE_COLORS = {park:0x5d9862,school:0xe8bd70,clinic:0xe6e7e0};
const tilePosition = (x:number,y:number)=>({x:(x-y)*HW,y:(x+y)*HH});
const hash=(x:number,y:number,seed:number)=>Math.abs(Math.imul(x+17,73856093)^Math.imul(y+31,19349663)^seed)>>>0;
const tileCorners=(x:number,y:number)=>[x,y,x+HW,y+HH,x,y+HH*2,x-HW,y+HH];
function diamond(g:Graphics,x:number,y:number,color:number,alpha=1){g.poly(tileCorners(x,y)).fill({color,alpha});}
function diamondStroke(g:Graphics,x:number,y:number,color:number,width=2){g.poly(tileCorners(x,y)).stroke({width,color,alpha:1,join:'round'});}
function drawTree(g:Graphics,x:number,y:number,v:number){
  const trunk=0x6d644b,leaves=[0x3e825c,0x4e9260,0x5a9f67][v%3]!;
  g.ellipse(x,y+11,9,4).fill({color:0x345d3a,alpha:.16});
  g.rect(x-2,y+1,4,10).fill(trunk);
  g.circle(x-2,y+1,8).fill(leaves);
  g.circle(x+5,y-3,7).fill(0x5eaa70);
  g.circle(x-4,y-7,6).fill(0x78b579);
}
function buildingBox(g:Graphics,x:number,y:number,h:number,top:number,left:number,right:number,variant:number,detail:StructureDetail='detail'){
  // Drop shadow first to ground the house in the tile.
  g.ellipse(x+5,y+HH+9,HW*.8,HH*.55).fill({color:0x244c38,alpha:.15});
  g.poly([x-HW+4,y+HH+2,x,y+HH*2-1,x,y+HH*2-h,x-HW+4,y+HH-h+3]).fill(left);
  g.poly([x,y+HH*2-1,x+HW-4,y+HH+2,x+HW-4,y+HH-h+3,x,y+HH*2-h]).fill(right);
  g.poly([x-HW+4,y+HH-h+3,x,y+HH*2-h,x+HW-4,y+HH-h+3,x,y-h+5]).fill(top);
  if(variant===1){
    // Homes: warm pitched roof ridge + small front doorway.
    g.moveTo(x-8,y+HH-h-1).lineTo(x+8,y+6-h).stroke({width:2,color:0xf6d2a1,alpha:.85});
    g.poly([x+4,y+HH*2-6,x+10,y+HH*2-9,x+10,y+HH*2-1,x+4,y+HH*2+2]).fill(0x805d4c);
  } else if(variant===2){
    g.rect(x-6,y-h+6,10,3).fill(0xf7e1ae);
    g.rect(x-2,y-h+4,2,6).fill(0x678c9c);
  } else if(variant===3){
    g.rect(x-4,y-h+6,8,5).fill(0x687780);
    g.rect(x+1,y-h+3,5,3).fill(0xa28c77);
  }
  // At overview zoom the dozens of tiny window quads are sub-pixel noise.
  if(detail==='overview')return;
  const floors=Math.min(4,Math.max(1,Math.floor(h/12)));
  for(let floor=0;floor<floors;floor++){
    const yy=y+HH+5-floor*10;
    for(let col=0;col<2;col++){
      const xx=x+3+col*7;
      g.poly([xx,yy,xx+4,yy-2,xx+4,yy+3,xx,yy+5]).fill({color:0x6996ab,alpha:.92});
      g.poly([x-16+col*7,yy-8,x-12+col*7,yy-6,x-12+col*7,yy-2,x-16+col*7,yy-4]).fill({color:0xf3e4c9,alpha:.78});
    }
  }
}
/** Draw distinct skylines per district and level; only derived building geometry.
 * Details are omitted at overview zoom for mobile GPU budgets.
 */
function drawCityBuilding(g:Graphics,x:number,y:number,b:Building,seed:number,detail:StructureDetail,progress=1){
  const design=getBuildingStyle(b,seed),h=Math.max(6,Math.round(design.height*progress));
  const roofline=y-h+5;
  const isHome=b.kind===1;
  const fittedVariant=isHome&&(design.silhouette==='pitched'||design.name==='townhouse')?1:b.kind===3?3:2;
  buildingBox(g,x,y,h,design.roof,design.left,design.right,fittedVariant,progress<.9?'overview':detail);
  // During construction only the block silhouette rises. Details and rooftop
  // equipment arrive in the finishing stage, so the change is visible.
  if(progress<.9)return;
  if(design.silhouette==='pitched'){
    // Raised ridge, chimney and porch visually distinguish small homes.
    g.moveTo(x-18,y+HH-h+6).lineTo(x,y-h+3).lineTo(x+18,y+HH-h+6)
      .stroke({color:0xffe4af,width:2.1});
    g.rect(x+8,roofline-10,4,11).fill(0xac7963);
    g.poly([x+5,roofline-10,x+10,roofline-13,x+14,roofline-10,x+9,roofline-7]).fill(0x8f5d53);
    if(detail==='detail'){
      g.poly([x-7,y+HH*2+2,x,y+HH*2-1,x+5,y+HH*2+2,x-2,y+HH*2+5])
        .fill(0xe8cd98);
      g.circle(x-16,y+HH+12,3).fill(0x4b9460);
    }
    return;
  }
  if(design.silhouette==='terraced'){
    // Lowrise apartment balconies and row-house roof stair.
    g.rect(x-9,roofline-6,12,5).fill(0xb7c6bd);
    if(detail==='detail'){
      for(let floor=0;floor<Math.min(5,Math.floor(h/12));floor++){
        const yy=y+HH+5-floor*10;
        g.moveTo(x+1,yy+8).lineTo(x+15,yy+1).stroke({color:design.accent,width:2.2,alpha:.8});
      }
    }
  } else if(design.silhouette==='tower'||design.silhouette==='glass'){
    // A slender stepped rooftop silhouette is visible even on overview.
    g.poly([x-9,roofline,x,roofline-6,x+9,roofline,x,roofline+5]).fill(design.accent);
    g.rect(x-2,roofline-11,4,7).fill(0x708b99);
    if(detail==='detail'){
      for(let floor=1;floor<Math.min(7,Math.floor(h/11));floor++){
        const yy=y+HH+5-floor*9;
        g.poly([x+4,yy,x+11,yy-3,x+11,yy+1,x+4,yy+4])
          .fill({color:0xb7e6f3,alpha:.83});
        g.poly([x-14,yy-8,x-7,yy-5,x-7,yy-1,x-14,yy-4])
          .fill({color:0x8bc3de,alpha:.8});
      }
    }
  } else if(design.silhouette==='awning'){
    // Retail shopfronts have prominent colorful awnings/signage.
    g.poly([x+1,y+HH+2,x+19,y+HH-8,x+19,y+HH-3,x+1,y+HH+7])
      .fill(design.accent);
    g.rect(x-8,roofline-5,16,4).fill(design.accent);
    if(detail==='detail'){
      g.poly([x+3,y+HH+13,x+10,y+HH+10,x+10,y+HH+19,x+3,y+HH+22])
        .fill(0x476f78);
      g.circle(x+14,y+HH+5,2).fill(0xfff2bd);
    }
  } else if(design.silhouette==='shed'){
    // Wide low industrial roof with sawtooth highlights.
    g.poly([x-17,roofline+7,x-10,roofline-2,x-3,roofline+5,x+5,roofline-4,x+14,roofline+7])
      .fill({color:design.accent,alpha:.85});
    if(detail==='detail'){
      g.rect(x+4,y+HH+8,9,10).fill(0x617782);
      g.rect(x+6,y+HH+11,5,4).fill(0xc0d3ce);
    }
  } else if(design.silhouette==='industrial'){
    // Smokestack plus rooftop tanks makes a recognizable industrial plant.
    g.rect(x+13,roofline-21,6,26).fill(0x768a8c);
    g.rect(x+12,roofline-22,8,4).fill(design.accent);
    g.ellipse(x+16,roofline-22,4,2).fill(0xb3c6be);
    if(detail==='detail'){
      g.circle(x-8,roofline-2,5).fill(0x95a6a1);
      g.rect(x-11,roofline-5,6,4).fill(0xbdd1ce);
    }
  }
}
/** A construction site stays on the map for entire game months.
 * The silhouette and stage depend on the saved month, not frame animation.
 */
function renderWorkSite(g:Graphics,city:City,site:ConstructionSite,detail:StructureDetail){
  const p=tilePosition(site.x,site.y),t=constructionProgress(site,city.month);
  const phase=constructionPhase(site,city.month);
  const target:Building={id:site.id,x:site.x,y:site.y,kind:site.kind,level:site.level,residents:0,jobs:0};
  const old=site.upgradeFrom===undefined?0:getBuildingStyle({...target,level:site.upgradeFrom},city.seed).height;
  const desired=getBuildingStyle(target,city.seed).height;
  const heightRatio=Math.min(.98,Math.max(old/desired,(site.upgradeFrom?old/desired:.12)+t*(1-old/desired)));
  diamond(g,p.x,p.y,0xc99e68,.62);
  if(phase==='foundation'&&site.upgradeFrom===undefined){
    g.poly([p.x-16,p.y+HH,p.x,p.y+HH-9,p.x+16,p.y+HH,p.x,p.y+HH+9])
      .stroke({color:0xf9e1a6,width:2.7,alpha:.92});
    g.moveTo(p.x-9,p.y+HH-2).lineTo(p.x+9,p.y+HH+2)
      .stroke({color:0x8d654a,width:1.5});
  }else{
    drawCityBuilding(g,p.x,p.y,target,city.seed,detail,heightRatio);
  }
  // Site fence, crane and visible month-progress bar.
  const top=p.y+10-Math.max(9,desired*heightRatio);
  g.moveTo(p.x-20,p.y+HH+12).lineTo(p.x-20,top-5)
    .lineTo(p.x+19,top-5).lineTo(p.x+19,p.y+HH+12)
    .stroke({color:0xf5bc62,width:1.6,alpha:.9});
  g.moveTo(p.x-20,p.y+HH+4).lineTo(p.x+19,p.y+HH+4)
    .stroke({color:0xe1b477,width:1.4,alpha:.75});
  g.moveTo(p.x+19,top-11).lineTo(p.x-7,top-11).stroke({color:0xfce1a3,width:2.4});
  g.moveTo(p.x-4,top-11).lineTo(p.x-4,top+1).stroke({color:0xb59b75,width:1.1});
  const barX=p.x-15,barY=p.y+HH*2+10;
  g.roundRect(barX,barY,30,5,2).fill(0x284d42);
  g.roundRect(barX,barY,Math.max(2,30*t),5,2).fill(0xffcc70);
  if(detail==='detail'){
    g.circle(p.x-16,p.y+HH+11,2).fill(0xe6dbb3);
    g.circle(p.x+17,p.y+HH+11,2).fill(0xe6dbb3);
  }
}
function renderTerrain(g:Graphics,city:City){
  g.clear();
  for(let sum=0;sum<2*SIZE-1;sum++)for(let y=Math.max(0,sum-SIZE+1);y<=Math.min(SIZE-1,sum);y++){
    const x=sum-y,i=tileIndex(x,y),p=tilePosition(x,y),v=hash(x,y,city.seed);
    if(city.land[i]===0){
      diamond(g,p.x,p.y,v%4===0?0x81bcc5:0x7bb6c2);
      if(v%3===0)g.moveTo(p.x-14,p.y+14).lineTo(p.x+3,p.y+9).stroke({width:1.2,color:0xd8f2f1,alpha:.45});
      continue;
    }
    diamond(g,p.x,p.y,GROUND[v%GROUND.length]!);
    if(v%12===0){g.circle(p.x-10,p.y+HH-2,1.5).fill({color:0xcad5a1,alpha:.6});}
  }
}
function renderStructures(g:Graphics,city:City,window:TileWindow|null,detail:StructureDetail,
  viewport:{width:number;height:number;panX:number;panY:number;zoom:number},
  constructionTiles:ReadonlySet<number>=new Set()):number{
  g.clear();
  if(!window)return 0;
  let renderedTiles=0;
  const buildings=new Map(city.buildings.map(b=>[tileIndex(b.x,b.y),b]));
  const services=new Map(city.services.map(s=>[tileIndex(s.x,s.y),s]));
  const sites=new Map((city.construction??[]).map(site=>[tileIndex(site.x,site.y),site]));
  for(let sum=window.minX+window.minY;sum<=window.maxX+window.maxY;sum++)
    for(let y=Math.max(window.minY,sum-window.maxX);y<=Math.min(window.maxY,sum-window.minX);y++){
    const x=sum-y,i=tileIndex(x,y);
    if(!tileNearViewport(x,y,viewport.width,viewport.height,viewport.panX,viewport.panY,viewport.zoom))continue;
    renderedTiles++;
    if(city.land[i]===0)continue;
    const p=tilePosition(x,y),v=hash(x,y,city.seed),b=buildings.get(i),s=services.get(i),site=sites.get(i);
    if(city.zones[i]){
      diamond(g,p.x,p.y,COVERAGE[city.zones[i]!]!,0.42);
      if(!b&&!site){
        // Vacant zoned land has a visible foundation even at overview zoom:
        // a zoned lot is NOT an already built home/shop/factory.
        g.poly([p.x-12,p.y+HH,p.x,p.y+HH-6,p.x+12,p.y+HH,p.x,p.y+HH+6])
          .stroke({width:1.6,color:0xfff4d2,alpha:.92,join:'round'});
        if(detail==='detail'){
          g.moveTo(p.x-8,p.y+HH-1).lineTo(p.x+8,p.y+HH+1)
            .stroke({width:1.3,color:0xffffff,alpha:.68});
        }
      }
    }
    if(city.roads[i]){
      diamond(g,p.x,p.y,city.roads[i]===2?0x485b6f:0x647879);
      if(city.roads[i]===2)diamond(g,p.x,p.y,0x8bacc1,0.13);
      if(detail==='detail'){
      const dirs=[[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dy])=>{
        const xx=x+dx!, yy=y+dy!;return xx>=0&&yy>=0&&xx<SIZE&&yy<SIZE&&(city.roads[tileIndex(xx,yy)]??0)>0;
      });
      const [west,east,north,south]=dirs;
      if(west||east)g.moveTo(p.x-15,p.y+6).lineTo(p.x+15,p.y+20).stroke({width:1.4,color:0xf5d5a0,alpha:.76});
      if(north||south)g.moveTo(p.x+15,p.y+6).lineTo(p.x-15,p.y+20).stroke({width:1.4,color:0xf5d5a0,alpha:.76});
      if((west||east)&&(north||south))g.circle(p.x,p.y+HH,2).fill(0xf4d4a6);
      if(city.roads[i]===2){g.circle(p.x-9,p.y+HH-4,2).fill(0xffe8a8);g.circle(p.x+9,p.y+HH+4,2).fill(0xffe8a8);}
      }
    }
    if(site){
      renderWorkSite(g,city,site,detail);
    }else if(b){
      if(!constructionTiles.has(i))drawCityBuilding(g,p.x,p.y,b,city.seed,detail);
    } else if(s){
      if(s.kind==='park'){
        diamond(g,p.x,p.y,0x5e9c69);
        drawTree(g,p.x-9,p.y+7,v);if(detail==='detail')drawTree(g,p.x+9,p.y+16,v+1);
        g.circle(p.x+1,p.y+14,3).fill(0xe6d6a9);
      } else {
        buildingBox(g,p.x,p.y,s.kind==='school'?22:29,SERVICE_COLORS[s.kind],0xc6c8b2,0xe2e8db,2,detail);
        if(s.kind==='clinic'){
          g.rect(p.x-2,p.y-24,4,12).fill(0xb9585e);
          g.rect(p.x-6,p.y-20,12,4).fill(0xb9585e);
        }
      }
    } else if(detail==='detail'&&!city.roads[i]&&!city.zones[i]&&v%29===0){
      drawTree(g,p.x-2,p.y+9,v);
    }
  }
  return renderedTiles;
}
/**
 * Draw only ~60 ephemeral objects per 30fps step; the 4,096 world tiles
 * remain cached in their original Graphics objects.
 */
function renderAmbient(g:Graphics,scene:AmbientScene,time:number){
  g.clear();
  const dusk=nightLevel(time);
  // Routed cars and buses complete connected journeys, disappear at a stop,
  // then resume a newly chosen trip. Only the active tiny sprites are drawn.
  for(const lane of scene.lanes){
    const moving=sampleVehicle(lane,time);
    if(!moving)continue;
    const p=tilePosition(moving.x,moving.y),py=p.y+HH;
    const bus=moving.bus;
    g.ellipse(p.x+2,py+4,bus?7:5,bus?3:2.8).fill({color:0x152b31,alpha:.22*moving.alpha});
    g.ellipse(p.x,py,bus?6.6:4.3,bus?3:2.5)
      .fill({color:bus?0x39cbed:0xf2dd9a,alpha:moving.alpha});
    g.circle(p.x-1,py-1,1).fill({color:bus?0xeaffff:0xffffff,alpha:moving.alpha});
    if(dusk>.15){
      const dx=(moving.directionX-moving.directionY)*2.5;
      const dy=(moving.directionX+moving.directionY)*1.2;
      g.circle(p.x+dx,py+dy,1.8).fill({color:0xfff6c9,alpha:dusk*.8*moving.alpha});
    }
  }
  // Walkers are present only while travelling; idle and shopping periods
  // deliberately produce a less mechanical, intermittently alive street.
  for(const walker of scene.pedestrians){
    const moving=sampleWalker(walker,time);
    if(!moving)continue;
    const p=tilePosition(moving.x,moving.y),ground=p.y+HH+6;
    g.ellipse(p.x+3,ground+3,2.7,1.4).fill({color:0x1b473b,alpha:.2*moving.alpha});
    g.circle(p.x,ground-4,2.1).fill({color:walker.residents>0?0xffda9a:0xb5c9e7,alpha:moving.alpha});
    g.moveTo(p.x,ground-1).lineTo(p.x,ground+3).stroke({width:1.5,color:0x355d70,alpha:moving.alpha});
  }
  // Workday smoke appears in separate bursts, with offsets per factory.
  for(const f of scene.factories){
    const p=tilePosition(f.x,f.y),cycle=(time+f.phase*13)/11;
    const batch=Math.floor(cycle),local=cycle-batch;
    if(batch%5===3)continue;
    for(let i=0;i<3;i++){
      const age=(local*1.45-i*.28);
      if(age<=0||age>=1)continue;
      const side=Math.sin(batch*3.1+i*1.7+f.phase*5)*5;
      g.circle(p.x+15+side+age*9,p.y-26-age*28,2+age*4.8)
        .fill({color:0xe3e7df,alpha:(1-age)*.35});
    }
  }
  // Parks and waterways become active at different moments rather than
  // repeating the same ellipse position on every frame.
  for(const park of scene.parks){
    const phase=(time*.14+park.phase)%1;
    if(phase>.64)continue;
    const p=tilePosition(park.x,park.y),sweep=phase/.64;
    g.circle(p.x-12+sweep*21,p.y+HH+Math.sin(sweep*6)*5,1.9)
      .fill({color:0xffe49c,alpha:Math.min(1,sweep*5,(1-sweep)*5)*.85});
  }
  for(const water of scene.water){
    const phase=(time*.12+water.phase)%1;
    if(phase>.6)continue;
    const p=tilePosition(water.x,water.y),progress=phase/.6;
    const x=p.x-15+progress*26;
    g.moveTo(x,p.y+HH-2).lineTo(x+8,p.y+HH-5)
      .stroke({color:0xe1fdff,width:1.5,alpha:(1-progress)*.5});
  }
  // Night activity is a separate small set of emissive windows, not a redraw
  // of the 4,096-tile city. Their lights change across successive evenings.
  if(dusk>.02){
    for(const w of scene.windows){
      const date=Math.floor(time/72);
      if((Math.floor(w.phase*100)+date*7)%5===0)continue;
      const p=tilePosition(w.x,w.y);
      g.circle(p.x+7,p.y-11,3.5)
        .fill({color:0xffdb8b,alpha:dusk*.26});
      g.rect(p.x+5,p.y-13,4,4)
        .fill({color:0xffe5a7,alpha:dusk*.80});
    }
  }
}
/**
 * The city-condition layer is independent of the 4,096 cached map tiles.
 * Stable markers remain visible even when motion is disabled.
 */
function renderCityEffects(g:Graphics,city:City,mood:CityMood,pulses:readonly GrowthPulse[],time:number,motion:boolean){
  g.clear();
  if(mood==='crisis'||mood==='repairs'){
    const caution=mood==='crisis'?0xd16d59:0xd49c54;
    const source=city.services.slice(0,10);
    for(const service of source){
      const p=tilePosition(service.x,service.y);
      g.circle(p.x+14,p.y-11,5).fill({color:caution,alpha:.9});
      g.circle(p.x+14,p.y-11,2).fill(0xfff9e3);
    }
  }
  if(!motion)return;
  for(const pulse of pulses){
    const age=time-pulse.createdAt;
    if(age<0||age>=CONSTRUCTION_SECONDS)continue;
    // New building construction already happened over real game months.
    // This temporary ring celebrates COMPLETION, never rebuilds it.
    const p=tilePosition(pulse.x,pulse.y),t=age/CONSTRUCTION_SECONDS;
    const color=pulse.kind==='upgrade'?0xffe08d:pulse.kind==='service'?0x7de4de:0x91e9ae;
    g.circle(p.x,p.y-20,8+t*19)
      .stroke({color,width:2.5-t*1.5,alpha:.7*(1-t)});
    if(t<.45){
      for(let i=0;i<3;i++){
        const angle=i*Math.PI*2/3+t*4;
        g.circle(p.x+Math.cos(angle)*(10+t*12),p.y-25+Math.sin(angle)*(8+t*12),2.5)
          .fill({color,alpha:1-t*2});
      }
    }
  }
}
function renderTrafficHeatmap(g:Graphics, city:City){
  g.clear();
  const traffic=analyzeTraffic(city);
  for(let i=0;i<city.roads.length;i++){
    if(!city.roads[i])continue;
    const load=traffic.roadVolume[i]??0;
    if(load<=0)continue;
    const p=tilePosition(i%SIZE,Math.floor(i/SIZE));
    const ratio=load/getRoadCapacity(city.roads[i]!);
    const color=ratio<0.6?0x43c69c:ratio<1?0xe9cc62:ratio<1.5?0xf2a14f:0xe26658;
    diamond(g,p.x,p.y,color,ratio<1?0.4:0.65);
    if(ratio>=1.5)g.circle(p.x,p.y+HH,3).fill({color:0xffefdd,alpha:0.82});
  }
}
function renderLandHeatmap(g:Graphics,city:City){
  g.clear();
  const scores=analyzeLand(city).values;
  for(let i=0;i<scores.length;i++){
    if(city.land[i]===0)continue;
    const score=scores[i]!;
    const p=tilePosition(i%SIZE,Math.floor(i/SIZE));
    const tint=score>=65?0x39b979:score>=45?0xaad46f:score>=25?0xe5bf66:0xd77a69;
    diamond(g,p.x,p.y,tint,0.35);
  }
}
function renderOverlay(g:Graphics,city:City,selection:TilePoint|null,hover:TilePoint|null,stroke:readonly TilePoint[],tool:Tool){
  g.clear();
  if(selection){const p=tilePosition(selection.x,selection.y);diamondStroke(g,p.x,p.y,0xfafdf6,2.2);}
  for(const pos of stroke){const p=tilePosition(pos.x,pos.y);diamond(g,p.x,p.y,0xf8edbd,.38);diamondStroke(g,p.x,p.y,0xf5e3aa,1.4);}
  if(hover){const p=tilePosition(hover.x,hover.y),valid=canPlaceAt(city,tool,hover.x,hover.y);const color=tool==='inspect'?0xffffff:valid?0x53e2b0:0xff7979;
    diamond(g,p.x,p.y,color,.24);diamondStroke(g,p.x,p.y,color,2.4);
  }
}
function hitTile(canvas:HTMLCanvasElement, clientX:number,clientY:number,panX:number,panY:number,zoom:number):TilePoint|null{
  const bounds=canvas.getBoundingClientRect();
  const wx=(clientX-bounds.left-panX)/zoom,wy=(clientY-bounds.top-panY)/zoom;
  const x=Math.floor((wy/HH+wx/HW)/2),y=Math.floor((wy/HH-wx/HW)/2);
  return insideTile({x,y})?{x,y}:null;
}
export type MapController = {
  setCity:(city:City)=>void;
  setSelected:(point:TilePoint|null,tool:Tool)=>void;
  setMode:(mode:InteractionMode)=>void;
  setTrafficView:(enabled:boolean)=>void;
  setLandView:(enabled:boolean)=>void;
  setMotion:(enabled:boolean)=>void;
  resetView:()=>void;
  zoomBy:(factor:number)=>void;
  destroy:()=>void;
};
export async function mountMap(host:HTMLElement,initial:City,onTiles:(path:readonly TilePoint[])=>void):Promise<MapController>{
  const app=new Application();
  const mobileCanvas=window.innerWidth<700;
  await app.init({resizeTo:host,backgroundColor:0xbad4bf,antialias:true,preference:'webgl',
    resolution:Math.min(window.devicePixelRatio||1,mobileCanvas?1.5:2)});
  // Avoid 60 high-cost full-stage renders each second for a slowly moving city.
  app.ticker.maxFPS=30;
  const stage=new Container();
  const terrain=new Graphics(),structures=new Graphics(),ambient=new Graphics(),cityEffects=new Graphics(),landHeatmap=new Graphics(),trafficHeatmap=new Graphics(),overlay=new Graphics();
  stage.addChild(terrain,structures,ambient,cityEffects,landHeatmap,trafficHeatmap,overlay);app.stage.addChild(stage);host.appendChild(app.canvas);
  app.canvas.style.touchAction='none';
  let city=initial,selection:TilePoint|null=null,hover:TilePoint|null=null,tool:Tool='inspect',mode:InteractionMode='pan',trafficVisible=false,landVisible=false;
  let scene=buildAmbientScene(initial),mood=visualMood(initial),pulses:GrowthPulse[]=[],motionEnabled=!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let animationTime=0,frameBudget=0;
  const onAnimationFrame=(ticker:Ticker)=>{
    if(!motionEnabled||document.hidden)return;
    frameBudget+=Math.min(75,ticker.deltaMS);
    if(frameBudget<33)return;
    animationTime+=Math.min(0.075,frameBudget/1000);frameBudget=0;
    renderAmbient(ambient,scene,animationTime);
    if(pulses.length){
      const before=pulses.length;
      pulses=pulses.filter(p=>animationTime-p.createdAt<CONSTRUCTION_SECONDS);
      if(pulses.length!==before)refreshVisibleStructures(true);
      renderCityEffects(cityEffects,city,mood,pulses,animationTime,motionEnabled);
    }
  };
  app.ticker.add(onAnimationFrame);
  let zoom=.85,panX=0,panY=0,renderedWindow:TileWindow|null=null;
  let renderedDetail:StructureDetail|null=null,structureBuilds=0,renderedZoom=0,structuresCached=false;
  const refreshVisibleStructures=(force=false)=>{
    const visible=visibleTileWindow(host.clientWidth,host.clientHeight,panX,panY,zoom);
    const detail=structureDetailAtZoom(zoom);
    const zoomChangedEnough=renderedZoom===0||zoom>renderedZoom*1.35||zoom<renderedZoom*.72;
    if(!force&&detail===renderedDetail&&!zoomChangedEnough
      &&!needsTileWindowRefresh(renderedWindow,visible))return;
    renderedWindow=paddedTileWindow(visible,8);
    renderedDetail=detail;
    renderedZoom=zoom;
    const hidden=new Set<number>();
    const renderedTiles=renderStructures(structures,city,renderedWindow,detail,
      {width:host.clientWidth,height:host.clientHeight,panX,panY,zoom},hidden);
    structureBuilds++;
    // Buildings are immutable between player edits/month ticks. Rasterize the
    // visible construction set once, then keep GPU draw cost constant between
    // rebuilds. Never cache moving vehicles, people or construction scenes.
    structures.visible=renderedTiles>0;
    if(renderedTiles>0){
      if(structuresCached)structures.updateCacheTexture();
      else{
        structures.cacheAsTexture({resolution:mobileCanvas?0.65:0.9,antialias:false});
        structuresCached=true;
      }
    }
    app.canvas.dataset.structureCached=String(structuresCached);
    app.canvas.dataset.structureTiles=String(renderedTiles);
    app.canvas.dataset.structureDetail=detail;
    app.canvas.dataset.structureBuilds=String(structureBuilds);
  };
  // Phone play starts close enough to see houses, people and traffic.
  // Players can pinch out for an overview at any time.
  const resetView=()=>{zoom=mobileCanvas?0.78:Math.max(.35,Math.min(1.05,host.clientWidth/1000));panX=host.clientWidth/2;panY=host.clientHeight/2-((SIZE-1)*HH)*zoom;updateCamera();};
  const updateCamera=()=>{stage.scale.set(zoom);stage.position.set(panX,panY);refreshVisibleStructures();};
  const updateOverlay=()=>renderOverlay(overlay,city,selection,hover,down?.path??[],tool);
  const zoomBy=(factor:number,cx=host.clientWidth/2,cy=host.clientHeight/2)=>{
    const next=Math.max(.3,Math.min(2.4,zoom*factor));
    const worldX=(cx-panX)/zoom,worldY=(cy-panY)/zoom;
    panX=cx-worldX*next;panY=cy-worldY*next;zoom=next;updateCamera();
  };
  renderTerrain(terrain,city);
  // The 4096-cell landscape changes only on a new map/import. Rasterize once
  // at bounded scale to avoid tessellating thousands of diamonds each frame.
  // Mobile retains a lower-resolution terrain cache for texture-memory safety.
  terrain.cacheAsTexture({resolution:mobileCanvas?0.65:0.9,antialias:false});
  // resetView() below builds only the visible structures and keeps an 8-tile guard.
  if(motionEnabled)renderAmbient(ambient,scene,animationTime);
  renderCityEffects(cityEffects,city,mood,pulses,animationTime,motionEnabled);
  resetView();
  let down:{pointer:number;originX:number;originY:number;panX:number;panY:number;action:'pan'|'paint';path:TilePoint[];moved:boolean}|null=null;
  // Two fingers always navigate (pan + pinch), even if a paint tool is active.
  // The second touch aborts the stroke rather than placing an accidental road.
  const touches=new Map<number,{x:number;y:number}>();
  let pinch:{distance:number;zoom:number;worldX:number;worldY:number}|null=null;
  const touchPair=()=>{
    const [a,b]=[...touches.values()];
    if(!a||!b)return null;
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
  };

  const point=(e:PointerEvent)=>hitTile(app.canvas,e.clientX,e.clientY,panX,panY,zoom);
  const local=(e:PointerEvent|WheelEvent)=>{const r=app.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  const pointerDown=(e:PointerEvent)=>{
    if(e.pointerType==='mouse'&&e.button!==0&&e.button!==1&&e.button!==2)return;
    const position=local(e);
    if(e.pointerType==='touch'){
      touches.set(e.pointerId,position);
      if(app.canvas.setPointerCapture)app.canvas.setPointerCapture(e.pointerId);
      const pair=touchPair();
      if(pair){
        down=null;hover=null;
        pinch={distance:pair.distance,zoom,worldX:(pair.x-panX)/zoom,worldY:(pair.y-panY)/zoom};
        updateOverlay();return;
      }
    }
    if(down||pinch)return;
    const hit=point(e);
    const action=e.button===1||e.button===2||mode==='pan'||!canDragPaint(tool)?'pan':'paint';
    down={pointer:e.pointerId,originX:position.x,originY:position.y,panX,panY,action,path:hit?[hit]:[],moved:false};
    if(e.pointerType!=='touch'&&app.canvas.setPointerCapture)app.canvas.setPointerCapture(e.pointerId);
    updateOverlay();
  };
  const pointerMove=(e:PointerEvent)=>{
    if(e.pointerType==='touch'&&touches.has(e.pointerId)){
      touches.set(e.pointerId,local(e));
      const pair=touchPair();
      if(pinch&&pair){
        zoom=Math.max(.3,Math.min(2.4,pinch.zoom*pair.distance/pinch.distance));
        panX=pair.x-pinch.worldX*zoom;panY=pair.y-pinch.worldY*zoom;
        updateCamera();return;
      }
    }
    if(pinch)return;
    if(!down){if(e.pointerType==='mouse'||e.pointerType==='pen'){const next=point(e);if(next?.x!==hover?.x||next?.y!==hover?.y){hover=next;updateOverlay();}}return;}
    if(down.pointer!==e.pointerId)return;
    const p=local(e);if(Math.hypot(p.x-down.originX,p.y-down.originY)>5)down.moved=true;
    if(down.action==='pan'){
      if(down.moved){panX=down.panX+p.x-down.originX;panY=down.panY+p.y-down.originY;updateCamera();}
    }else{
      const hit=point(e);
      if(hit){down.path=appendLine(down.path,hit);hover=hit;updateOverlay();}
    }
  };
  const finish=(e:PointerEvent,cancelled:boolean)=>{
    if(e.pointerType==='touch'){
      touches.delete(e.pointerId);
      if(pinch){
        pinch=null;down=null;hover=null;updateOverlay();
        if(app.canvas.hasPointerCapture?.(e.pointerId))app.canvas.releasePointerCapture(e.pointerId);
        return;
      }
    }
    if(!down||down.pointer!==e.pointerId)return;
    const gesture=down;down=null;
    if(!cancelled){
      if(gesture.action==='paint'){
        const hit=point(e),path=hit?appendLine(gesture.path,hit):gesture.path;
        if(path.length>0)onTiles(path);
      }else if(!gesture.moved&&e.button===0){const hit=point(e);if(hit)onTiles([hit]);}
    }
    hover=point(e);updateOverlay();
    if(app.canvas.hasPointerCapture?.(e.pointerId))app.canvas.releasePointerCapture(e.pointerId);
  };
  const pointerUp=(e:PointerEvent)=>finish(e,false);
  const pointerCancel=(e:PointerEvent)=>finish(e,true);
  const lostCapture=(e:PointerEvent)=>{
    touches.delete(e.pointerId);
    if(pinch){pinch=null;down=null;}
    if(down?.pointer===e.pointerId){down=null;}
    updateOverlay();
  };
  const leave=()=>{if(!down){hover=null;updateOverlay();}};
  const contextMenu=(e:MouseEvent)=>e.preventDefault();
  const wheel=(e:WheelEvent)=>{e.preventDefault();const p=local(e);zoomBy(e.deltaY<0?1.12:1/1.12,p.x,p.y);};
  app.canvas.addEventListener('pointerdown',pointerDown);app.canvas.addEventListener('pointermove',pointerMove);
  app.canvas.addEventListener('pointerup',pointerUp);app.canvas.addEventListener('pointercancel',pointerCancel);
  app.canvas.addEventListener('lostpointercapture',lostCapture);app.canvas.addEventListener('pointerleave',leave);
  app.canvas.addEventListener('wheel',wheel,{passive:false});app.canvas.addEventListener('contextmenu',contextMenu);
  // Re-evaluate visible structures after container/layout/rotation changes.
  const resizeObserver=new ResizeObserver(()=>refreshVisibleStructures(true));
  resizeObserver.observe(host);
  return {
    setCity(next){const mapChanged=next.seed!==city.seed||(next.land!==city.land&&next.land.some((value,index)=>value!==city.land[index]));
      const visualChanged=mapChanged||next.roads!==city.roads||next.zones!==city.zones||next.buildings!==city.buildings||next.services!==city.services;
      const ambientChanged=visualChanged||next.capitalProjects!==city.capitalProjects||next.policy!==city.policy||next.month!==city.month;
      if(visualChanged&&motionEnabled){pulses=appendGrowthPulses(pulses,detectGrowthEvents(city,next),animationTime);}
      mood=visualMood(next);
      city=next;if(mapChanged){renderTerrain(terrain,city);terrain.updateCacheTexture();}if(visualChanged){refreshVisibleStructures(true);if(trafficVisible)renderTrafficHeatmap(trafficHeatmap,city);if(landVisible)renderLandHeatmap(landHeatmap,city);}
      if(ambientChanged){scene=buildAmbientScene(city);if(motionEnabled)renderAmbient(ambient,scene,animationTime);}renderCityEffects(cityEffects,city,mood,pulses,animationTime,motionEnabled);updateOverlay();},
    setSelected(next,nextTool){selection=next;tool=nextTool;updateOverlay();},
    setMode(next){mode=next;hover=null;updateOverlay();},
    setTrafficView(enabled){if(trafficVisible===enabled)return;trafficVisible=enabled;if(enabled)renderTrafficHeatmap(trafficHeatmap,city);else trafficHeatmap.clear();},
    setLandView(enabled){if(landVisible===enabled)return;landVisible=enabled;if(enabled)renderLandHeatmap(landHeatmap,city);else landHeatmap.clear();},
    setMotion(enabled){motionEnabled=enabled;if(enabled)renderAmbient(ambient,scene,animationTime);else {ambient.clear();if(pulses.length){pulses=[];refreshVisibleStructures(true);}}renderCityEffects(cityEffects,city,mood,pulses,animationTime,motionEnabled);},
    resetView,zoomBy:factor=>zoomBy(factor),
    destroy(){
      resizeObserver.disconnect();
      app.ticker.remove(onAnimationFrame);
      app.canvas.removeEventListener('pointerdown',pointerDown);app.canvas.removeEventListener('pointermove',pointerMove);
      app.canvas.removeEventListener('pointerup',pointerUp);app.canvas.removeEventListener('pointercancel',pointerCancel);
      app.canvas.removeEventListener('lostpointercapture',lostCapture);app.canvas.removeEventListener('pointerleave',leave);
      app.canvas.removeEventListener('wheel',wheel);app.canvas.removeEventListener('contextmenu',contextMenu);
      app.destroy(true,{children:true});
    },
  };
}