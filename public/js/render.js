import { T, Z, hash, inside } from './map.js';

const TILE_W = 72;
const TILE_H = 36;
const TYPES = {
  [Z.HOME]: { roof:'#dc9370', wallL:'#e5c1a0', wallR:'#b88d75', window:'#e9f6d4' },
  [Z.SHOP]: { roof:'#499fb0', wallL:'#c8d8d1', wallR:'#7fa5a9', window:'#fff3c2' },
  [Z.INDUSTRY]: { roof:'#957f7a', wallL:'#a4a9a2', wallR:'#737f7f', window:'#f3c789' },
};

function polygon(ctx, pts, fill, stroke, width=1) {
  ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}
}
const diamond=(ctx,x,y,fill,stroke)=>polygon(ctx,[[x,y-18],[x+36,y],[x,y+18],[x-36,y]],fill,stroke,.8);
const rnd=(seed,x,y)=>hash(seed,x,y);

function extrude(ctx,x,y,height,palette) {
  // Ground shadow and left/right walls, roof in painter's order.
  polygon(ctx,[[x-31,y+4],[x,y+23],[x+33,y+4],[x+9,y-7]],'rgba(20,36,26,.26)');
  polygon(ctx,[[x-30,y-height],[x,y+15-height],[x,y+15],[x-30,y]],palette.wallL,'rgba(24,44,44,.3)');
  polygon(ctx,[[x,y+15-height],[x+30,y-height],[x+30,y],[x,y+15]],palette.wallR,'rgba(24,44,44,.3)');
  polygon(ctx,[[x,y-15-height],[x+30,y-height],[x,y+15-height],[x-30,y-height]],palette.roof,'rgba(255,255,255,.18)');
  const floorCount=Math.max(1,Math.floor(height/12));
  for(let f=0;f<floorCount;f++){
    const oy = y - height + 10 + f*12;
    for(let k=0;k<2;k++){
      polygon(ctx,[[x-23+k*10,oy-k*-.0],[x-18+k*10,oy+3],[x-18+k*10,oy+8],[x-23+k*10,oy+5]],palette.window,'rgba(18,50,58,.23)',.6);
      polygon(ctx,[[x+6+k*10,oy+8-k*3],[x+11+k*10,oy+5-k*3],[x+11+k*10,oy+10-k*3],[x+6+k*10,oy+13-k*3]],palette.window,'rgba(18,50,58,.18)',.6);
    }
  }
}
function tree(ctx,x,y,scale=1,seed=0){
  ctx.strokeStyle='#655943';ctx.lineWidth=3*scale;ctx.beginPath();ctx.moveTo(x,y+2);ctx.lineTo(x,y-13*scale);ctx.stroke();
  const colors=['#517e52','#67965b','#477b58','#7ea66b'];
  for(let i=0;i<3;i++){
    const xx=x+(i-1)*6*scale, yy=y-17*scale+(i%2)*3*scale;
    ctx.fillStyle=colors[(seed+i)%4];ctx.beginPath();ctx.ellipse(xx,yy,8*scale,7*scale,0,0,Math.PI*2);ctx.fill();
  }
}
function road(ctx,x,y,city,gx,gy){
  diamond(ctx,x,y,'#586b71','#819092');
  const up = gy>0 && city.roads[(gy-1)*city.size+gx];
  const down = gy<city.size-1 && city.roads[(gy+1)*city.size+gx];
  const left = gx>0 && city.roads[gy*city.size+gx-1];
  const right = gx<city.size-1 && city.roads[gy*city.size+gx+1];
  ctx.lineWidth=1.5;ctx.strokeStyle='#e4d6a8';ctx.setLineDash([5,6]);
  if(up||down){ctx.beginPath();ctx.moveTo(x+12,y-5);ctx.lineTo(x-12,y+5);ctx.stroke();}
  if(left||right){ctx.beginPath();ctx.moveTo(x-12,y-5);ctx.lineTo(x+12,y+5);ctx.stroke();}
  ctx.setLineDash([]);
}
function zoneOutline(ctx,x,y,z){
  const fill=z===Z.HOME?'rgba(233,176,123,.26)':z===Z.SHOP?'rgba(93,205,211,.23)':'rgba(188,155,138,.24)';
  const edge=z===Z.HOME?'#dfad82':z===Z.SHOP?'#82d9de':'#d8ab92';
  diamond(ctx,x,y,fill,edge);
  ctx.fillStyle=edge;ctx.globalAlpha=.7;ctx.fillRect(x-2,y-2,4,4);ctx.globalAlpha=1;
}
function service(ctx,x,y,kind){
  if(kind==='park'){
    diamond(ctx,x,y,'#80ac67','#c5dc83');
    tree(ctx,x-11,y+4,.72,0);tree(ctx,x+13,y+4,.66,2);
    ctx.strokeStyle='#decda6';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-16,y+8);ctx.lineTo(x+16,y-8);ctx.stroke();
  }else{
    const hospital=kind==='clinic';
    extrude(ctx,x,y,kind==='clinic'?45:37,{roof:hospital?'#f2e6e0':'#d8b271',wallL:hospital?'#e3ece7':'#ecdec1',wallR:hospital?'#a5c5bd':'#ae987d',window:'#82b6ba'});
    if(hospital){ctx.strokeStyle='#cb6659';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x,y-57);ctx.lineTo(x,y-43);ctx.moveTo(x-7,y-50);ctx.lineTo(x+7,y-50);ctx.stroke();}
    else {ctx.fillStyle='#f7f1cf';ctx.fillRect(x-4,y-44,8,10);}
  }
}
function drawBuilding(ctx,x,y,b){
  const p=TYPES[b.kind];
  const height=b.kind===Z.HOME?24+b.level*6:b.kind===Z.SHOP?39:30;
  extrude(ctx,x,y,height,p);
  if(b.kind===Z.SHOP){polygon(ctx,[[x-30,y-7],[x,y+8],[x,y+13],[x-30,y-2]],'#e2bc7c');}
  if(b.kind===Z.INDUSTRY){ctx.fillStyle='#b6b2a2';ctx.fillRect(x+8,y-height-18,7,23);ctx.fillStyle='#d7cfc0';ctx.fillRect(x+9,y-height-19,5,3);}
  if(b.kind===Z.HOME){polygon(ctx,[[x,y-16-height],[x+30,y-height],[x,y+9-height],[x-30,y-height]],'#d78567');}
}

export class IsoRenderer {
  constructor(canvas, callbacks) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.callbacks=callbacks;
    this.city=null;this.tool='inspect';this.hover=null;this.selected=null;
    this.zoom=1.02;this.offsetX=0;this.offsetY=0;this.dragging=false;this.panning=false;this.lastCell='';this.space=false;
    this.centerOn(36,32);
    canvas.addEventListener('pointerdown',e=>this.onDown(e));
    canvas.addEventListener('pointermove',e=>this.onMove(e));
    canvas.addEventListener('pointerup',e=>this.onUp(e));
    canvas.addEventListener('pointercancel',e=>this.onUp(e));
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoomBy(e.deltaY>0?.88:1.12,e.offsetX,e.offsetY);},{passive:false});
    window.addEventListener('keydown',e=>{if(e.code==='Space' && e.target?.tagName!=='INPUT'){this.space=true;e.preventDefault();}});
    window.addEventListener('keyup',e=>{if(e.code==='Space')this.space=false;});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);
    this.resize();
  }
  destroy(){this.resizeObserver.disconnect();}
  centerOn(x,y){this.focusX=x;this.focusY=y;this.offsetX=0;this.offsetY=0;}
  resetView(){this.centerOn(36,32);this.zoom=1.02;this.render();}
  setCity(city){this.city=city;this.render();}
  setTool(tool){this.tool=tool;this.render();}
  zoomBy(mul,cx=this.width/2,cy=this.height/2){
    const before=this.screenToWorld(cx,cy);this.zoom=Math.min(2.25,Math.max(.46,this.zoom*mul));
    const after=this.screenToWorld(cx,cy);this.focusX+=before.x-after.x;this.focusY+=before.y-after.y;
    this.render();
  }
  resize(){
    const r=this.canvas.parentElement.getBoundingClientRect();this.width=r.width;this.height=r.height;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);
    this.canvas.style.width=this.width+'px';this.canvas.style.height=this.height+'px';
    this.ctx.setTransform(dpr,0,0,dpr,0,0);this.render();
  }
  worldToScreen(x,y){const wx=(x-y)*TILE_W/2,wy=(x+y)*TILE_H/2;
    const fx=(this.focusX-this.focusY)*TILE_W/2,fy=(this.focusX+this.focusY)*TILE_H/2;
    return {x:(wx-fx)*this.zoom+this.width*.51+this.offsetX,y:(wy-fy)*this.zoom+this.height*.43+this.offsetY};}
  screenToWorld(x,y){const wx=((x-this.width*.51-this.offsetX)/this.zoom)+(this.focusX-this.focusY)*TILE_W/2;
    const wy=((y-this.height*.43-this.offsetY)/this.zoom)+(this.focusX+this.focusY)*TILE_H/2;
    return {x:(wx/(TILE_W/2)+wy/(TILE_H/2))/2,y:(wy/(TILE_H/2)-wx/(TILE_W/2))/2};}
  cellAt(e){const rect=this.canvas.getBoundingClientRect(),p=this.screenToWorld(e.clientX-rect.left,e.clientY-rect.top);return {x:Math.round(p.x),y:Math.round(p.y)};}
  onDown(e){if(e.button!==0&&e.button!==1&&e.button!==2)return;
    this.canvas.setPointerCapture(e.pointerId);this.dragging=true;this.panning=e.button!==0||this.space||e.shiftKey;this.lastPX=e.clientX;this.lastPY=e.clientY;this.lastCell='';
    if(!this.panning)this.paint(e);
  }
  onMove(e){if(!this.city)return;this.hover=this.cellAt(e);
    if(this.dragging){if(this.panning){this.offsetX+=e.clientX-this.lastPX;this.offsetY+=e.clientY-this.lastPY;}
      else if(this.tool!=='inspect')this.paint(e);}
    this.lastPX=e.clientX;this.lastPY=e.clientY;this.render();}
  onUp(e){if(this.dragging&&!this.panning&&this.tool==='inspect'){
    const c=this.cellAt(e);this.selected=c;this.callbacks.inspect?.(c.x,c.y);}
    this.dragging=false;this.panning=false;this.lastCell='';this.render();}
  paint(e){const c=this.cellAt(e),s=`${c.x},${c.y}`;if(!inside(c.x,c.y,this.city.size)||this.lastCell===s)return;
    this.lastCell=s;this.callbacks.paint?.(this.tool,c.x,c.y);this.render();}
  render(){if(!this.ctx||!this.width||!this.height)return;const ctx=this.ctx;
    ctx.fillStyle='#bad1b2';ctx.fillRect(0,0,this.width,this.height);
    if(!this.city)return;
    // Static, reproducible projection. Render only visible tiles, never offscreen sprites.
    const world=this.city;ctx.save();ctx.translate(0,0);ctx.scale(this.zoom,this.zoom);
    const visibleInset=115;const w=this.width,h=this.height;
    const buildingByCell=new Map(world.buildings.map(b=>[`${b.x},${b.y}`,b]));
    const serviceByCell=new Map(world.services.map(s=>[`${s.x},${s.y}`,s]));
    for(let diag=0;diag<world.size*2-1;diag++){
      const minX=Math.max(0,diag-(world.size-1)),maxX=Math.min(world.size-1,diag);
      for(let x=minX;x<=maxX;x++){
        const y=diag-x,point=this.worldToScreen(x,y),sx=point.x/this.zoom,sy=point.y/this.zoom;
        if(point.x < -visibleInset||point.x>w+visibleInset||point.y<-visibleInset||point.y>h+visibleInset)continue;
        const i=y*world.size+x,terrain=world.terrain[i];
        const n=rnd(world.seed,x,y),bright=Math.floor(n*3);
        if(terrain===T.WATER) diamond(ctx,sx,sy,['#6aabbb','#77b3bd','#66a8b7'][bright],'#87c4c3');
        else diamond(ctx,sx,sy,terrain===T.FOREST?['#9ebf8e','#a2c498','#9cbb88'][bright]:['#b2cba1','#b9d0aa','#b6cda5'][bright],'rgba(121,155,112,.22)');
        if(terrain===T.FOREST&&!world.roads[i]&&!world.zones[i]&&!buildingByCell.has(`${x},${y}`)&&!serviceByCell.has(`${x},${y}`) && n>.91){tree(ctx,sx,sy+2,.7,Math.floor(n*100));}
        if(world.zones[i] && !buildingByCell.has(`${x},${y}`)) zoneOutline(ctx,sx,sy,world.zones[i]);
        if(world.roads[i])road(ctx,sx,sy,world,x,y);
        const b=buildingByCell.get(`${x},${y}`);if(b)drawBuilding(ctx,sx,sy,b);
        const svc=serviceByCell.get(`${x},${y}`);if(svc)service(ctx,sx,sy,svc.kind);
        if(this.hover?.x===x&&this.hover?.y===y)diamond(ctx,sx,sy,'rgba(250,252,200,.18)','#fff5bf');
        if(this.selected?.x===x&&this.selected?.y===y){diamond(ctx,sx,sy,'rgba(255,255,255,.11)','#ffffff');}
      }
    }
    ctx.restore();
  }
}
