import { Application, Container, Graphics } from 'pixi.js';
import { canPlaceAt, type City, type Tool, SIZE, tileIndex } from '../core/city';
import { analyzeTraffic, getRoadCapacity } from '../core/traffic';
import { appendLine, canDragPaint, insideTile, type InteractionMode, type TilePoint } from '../core/paint';

const HW = 26;
const HH = 13;
const GROUND = [0x84bb77, 0x8bc480, 0x7caf74, 0x92c686, 0x83b974];
const ROOFS = [0, 0xe9b27a, 0x8cb7c4, 0xb6a5a0];
const WALLS = [0, 0xf1dcc3, 0xdce9e6, 0xc4b8b0];
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
function buildingBox(g:Graphics,x:number,y:number,h:number,top:number,left:number,right:number,variant:number){
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
function renderStructures(g:Graphics,city:City){
  g.clear();
  const buildings=new Map(city.buildings.map(b=>[tileIndex(b.x,b.y),b]));
  const services=new Map(city.services.map(s=>[tileIndex(s.x,s.y),s]));
  for(let sum=0;sum<2*SIZE-1;sum++)for(let y=Math.max(0,sum-SIZE+1);y<=Math.min(SIZE-1,sum);y++){
    const x=sum-y,i=tileIndex(x,y);
    if(city.land[i]===0)continue;
    const p=tilePosition(x,y),v=hash(x,y,city.seed),b=buildings.get(i),s=services.get(i);
    if(city.zones[i]){
      diamond(g,p.x,p.y,COVERAGE[city.zones[i]!]!,0.42);
      if(!b){g.circle(p.x,p.y+HH,2.5).fill({color:COVERAGE[city.zones[i]!]!,alpha:.9});}
    }
    if(city.roads[i]){
      diamond(g,p.x,p.y,city.roads[i]===2?0x485b6f:0x647879);
      if(city.roads[i]===2)diamond(g,p.x,p.y,0x8bacc1,0.13);
      const dirs=[[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dy])=>{
        const xx=x+dx!, yy=y+dy!;return xx>=0&&yy>=0&&xx<SIZE&&yy<SIZE&&(city.roads[tileIndex(xx,yy)]??0)>0;
      });
      const [west,east,north,south]=dirs;
      if(west||east)g.moveTo(p.x-15,p.y+6).lineTo(p.x+15,p.y+20).stroke({width:1.4,color:0xf5d5a0,alpha:.76});
      if(north||south)g.moveTo(p.x+15,p.y+6).lineTo(p.x-15,p.y+20).stroke({width:1.4,color:0xf5d5a0,alpha:.76});
      if((west||east)&&(north||south))g.circle(p.x,p.y+HH,2).fill(0xf4d4a6);
      if(city.roads[i]===2){g.circle(p.x-9,p.y+HH-4,2).fill(0xffe8a8);g.circle(p.x+9,p.y+HH+4,2).fill(0xffe8a8);}
    }
    if(b){
      const h=b.kind===1?13+b.level*7:b.kind===2?24+b.level*9:19+b.level*9;
      const roof=ROOFS[b.kind]!+(v%3)*0x010101;
      buildingBox(g,p.x,p.y,h,roof,WALLS[b.kind]!,b.kind===1?0xcba98c:b.kind===2?0x7ea5a5:0x9a8781,b.kind);
      if(b.kind===3){g.rect(p.x+14,p.y-h-12,5,15).fill(0x889190);g.ellipse(p.x+16,p.y-h-16,6,3).fill({color:0xe2e6e0,alpha:.45});}
    } else if(s){
      if(s.kind==='park'){
        diamond(g,p.x,p.y,0x5e9c69);
        drawTree(g,p.x-9,p.y+7,v);drawTree(g,p.x+9,p.y+16,v+1);
        g.circle(p.x+1,p.y+14,3).fill(0xe6d6a9);
      } else {
        buildingBox(g,p.x,p.y,s.kind==='school'?22:29,SERVICE_COLORS[s.kind],0xc6c8b2,0xe2e8db,2);
        if(s.kind==='clinic'){
          g.rect(p.x-2,p.y-24,4,12).fill(0xb9585e);
          g.rect(p.x-6,p.y-20,12,4).fill(0xb9585e);
        }
      }
    } else if(!city.roads[i]&&!city.zones[i]&&v%29===0){
      drawTree(g,p.x-2,p.y+9,v);
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
  resetView:()=>void;
  zoomBy:(factor:number)=>void;
  destroy:()=>void;
};
export async function mountMap(host:HTMLElement,initial:City,onTiles:(path:readonly TilePoint[])=>void):Promise<MapController>{
  const app=new Application();
  await app.init({resizeTo:host,backgroundColor:0xbad4bf,antialias:true,preference:'webgl',resolution:Math.min(window.devicePixelRatio||1,2)});
  const stage=new Container();
  const terrain=new Graphics(),structures=new Graphics(),trafficHeatmap=new Graphics(),overlay=new Graphics();
  stage.addChild(terrain,structures,trafficHeatmap,overlay);app.stage.addChild(stage);host.appendChild(app.canvas);
  app.canvas.style.touchAction='none';
  let city=initial,selection:TilePoint|null=null,hover:TilePoint|null=null,tool:Tool='inspect',mode:InteractionMode='pan',trafficVisible=false;
  let zoom=.85,panX=0,panY=0;
  const resetView=()=>{zoom=Math.max(.35,Math.min(1.05,host.clientWidth/1000));panX=host.clientWidth/2;panY=host.clientHeight/2-((SIZE-1)*HH)*zoom;updateCamera();};
  const updateCamera=()=>{stage.scale.set(zoom);stage.position.set(panX,panY);};
  const updateOverlay=()=>renderOverlay(overlay,city,selection,hover,down?.path??[],tool);
  const zoomBy=(factor:number,cx=host.clientWidth/2,cy=host.clientHeight/2)=>{
    const next=Math.max(.3,Math.min(2.4,zoom*factor));
    const worldX=(cx-panX)/zoom,worldY=(cy-panY)/zoom;
    panX=cx-worldX*next;panY=cy-worldY*next;zoom=next;updateCamera();
  };
  renderTerrain(terrain,city);renderStructures(structures,city);resetView();
  let down:{pointer:number;originX:number;originY:number;panX:number;panY:number;action:'pan'|'paint';path:TilePoint[];moved:boolean}|null=null;
  const point=(e:PointerEvent)=>hitTile(app.canvas,e.clientX,e.clientY,panX,panY,zoom);
  const local=(e:PointerEvent|WheelEvent)=>{const r=app.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  const pointerDown=(e:PointerEvent)=>{
    if(down)return;
    if(e.pointerType==='mouse'&&e.button!==0&&e.button!==1&&e.button!==2)return;
    const position=local(e),hit=point(e);
    const action=e.button===1||e.button===2||mode==='pan'||!canDragPaint(tool)?'pan':'paint';
    down={pointer:e.pointerId,originX:position.x,originY:position.y,panX,panY,action,path:hit?[hit]:[],moved:false};
    if(app.canvas.setPointerCapture)app.canvas.setPointerCapture(e.pointerId);
    updateOverlay();
  };
  const pointerMove=(e:PointerEvent)=>{
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
  const lostCapture=(e:PointerEvent)=>{if(down?.pointer===e.pointerId){down=null;updateOverlay();}};
  const leave=()=>{if(!down){hover=null;updateOverlay();}};
  const contextMenu=(e:MouseEvent)=>e.preventDefault();
  const wheel=(e:WheelEvent)=>{e.preventDefault();const p=local(e);zoomBy(e.deltaY<0?1.12:1/1.12,p.x,p.y);};
  app.canvas.addEventListener('pointerdown',pointerDown);app.canvas.addEventListener('pointermove',pointerMove);
  app.canvas.addEventListener('pointerup',pointerUp);app.canvas.addEventListener('pointercancel',pointerCancel);
  app.canvas.addEventListener('lostpointercapture',lostCapture);app.canvas.addEventListener('pointerleave',leave);
  app.canvas.addEventListener('wheel',wheel,{passive:false});app.canvas.addEventListener('contextmenu',contextMenu);
  return {
    setCity(next){const mapChanged=next.seed!==city.seed||(next.land!==city.land&&next.land.some((value,index)=>value!==city.land[index]));
      const visualChanged=mapChanged||next.roads!==city.roads||next.zones!==city.zones||next.buildings!==city.buildings||next.services!==city.services;
      city=next;if(mapChanged)renderTerrain(terrain,city);if(visualChanged){renderStructures(structures,city);if(trafficVisible)renderTrafficHeatmap(trafficHeatmap,city);}updateOverlay();},
    setSelected(next,nextTool){selection=next;tool=nextTool;updateOverlay();},
    setMode(next){mode=next;hover=null;updateOverlay();},
    setTrafficView(enabled){if(trafficVisible===enabled)return;trafficVisible=enabled;if(enabled)renderTrafficHeatmap(trafficHeatmap,city);else trafficHeatmap.clear();},
    resetView,zoomBy:factor=>zoomBy(factor),
    destroy(){
      app.canvas.removeEventListener('pointerdown',pointerDown);app.canvas.removeEventListener('pointermove',pointerMove);
      app.canvas.removeEventListener('pointerup',pointerUp);app.canvas.removeEventListener('pointercancel',pointerCancel);
      app.canvas.removeEventListener('lostpointercapture',lostCapture);app.canvas.removeEventListener('pointerleave',leave);
      app.canvas.removeEventListener('wheel',wheel);app.canvas.removeEventListener('contextmenu',contextMenu);
      app.destroy(true,{children:true});
    },
  };
}