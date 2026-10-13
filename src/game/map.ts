import { Application, Container, Graphics } from 'pixi.js';
import { type City, type Tool, SIZE, tileIndex } from '../core/city';

const HALF_W = 26;
const HALF_H = 13;
const ground = [0x79b46e,0x85bf77,0x90c582,0x71aa68];
const roof = [0,0xe9ae76,0x80b6c1,0xc6a79b];
const wall = [0,0xe6d8b6,0xb0c7cb,0xa8a0a0];
const serviceColors = {park:0x5e9f64,school:0xe9d28f,clinic:0xe1e8e7};
const xy=(x:number,y:number)=>({px:(x-y)*HALF_W,py:(x+y)*HALF_H});
function diamond(g:Graphics,x:number,y:number,color:number,alpha=1){g.poly([x,y,x+HALF_W,y+HALF_H,x,y+HALF_H*2,x-HALF_W,y+HALF_H]).fill({color,alpha});}
function box(g:Graphics,x:number,y:number,h:number,top:number,left:number,right:number){
  // Building is aligned to the tile's central diamond.
  g.poly([x-HALF_W+4,y+HALF_H+2,x,y+HALF_H*2-1,x,y+HALF_H*2-h,x-HALF_W+4,y+HALF_H-h+3]).fill(left);
  g.poly([x,y+HALF_H*2-1,x+HALF_W-4,y+HALF_H+2,x+HALF_W-4,y+HALF_H-h+3,x,y+HALF_H*2-h]).fill(right);
  g.poly([x-HALF_W+4,y+HALF_H-h+3,x,y+HALF_H*2-h,x+HALF_W-4,y+HALF_H-h+3,x,y-h+5]).fill(top);
  if(h>=17){for(let q=0;q<Math.min(3,Math.ceil(h/15));q++){
    const wy=y+HALF_H+1-q*9;
    g.poly([x+5,wy,x+11,wy-3,x+11,wy+1,x+5,wy+4]).fill({color:0x54819c,alpha:.88});
    g.poly([x-14,wy-6,x-9,wy-4,x-9,wy,x-14,wy-2]).fill({color:0xf9ecd4,alpha:.7});
  }}
}
function renderWorld(g:Graphics,city:City,selection:{x:number;y:number}|null,tool:Tool){
  g.clear();
  const buildings = new Map(city.buildings.map(b=>[tileIndex(b.x,b.y),b]));
  const services = new Map(city.services.map(s=>[tileIndex(s.x,s.y),s]));
  for(let sum=0;sum<(SIZE-1)*2+1;sum++){
    for(let y=Math.max(0,sum-(SIZE-1));y<=Math.min(SIZE-1,sum);y++){
      const x=sum-y,i=tileIndex(x,y),p=xy(x,y);
      if(city.land[i]===0){diamond(g,p.px,p.py,0x82bed0);g.moveTo(p.px-8,p.py+12).lineTo(p.px+4,p.py+8).stroke({width:1,color:0xcce6ee,alpha:.45});continue;}
      const r=(x*7+y*13+city.seed)%4;
      diamond(g,p.px,p.py,ground[r]!);
      if(city.zones[i])diamond(g,p.px,p.py,[0,0xd9e5a0,0x8bcac6,0xd5ad92][city.zones[i]!]!,.38);
      if(city.roads[i]){
        diamond(g,p.px,p.py,0x717779);
        const neighbors=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].map(([a,b])=>a!>=0&&a!<SIZE&&b!>=0&&b!<SIZE&&city.roads[tileIndex(a!,b!)]===1);
        if(neighbors[0]||neighbors[1])g.moveTo(p.px-18,p.py+16).lineTo(p.px+17,p.py+8).stroke({width:1,color:0xffdfac,alpha:.55});
        else if(neighbors[2]||neighbors[3])g.moveTo(p.px-17,p.py+10).lineTo(p.px+18,p.py+16).stroke({width:1,color:0xffdfac,alpha:.55});
      }
      const building=buildings.get(i),service=services.get(i);
      if(building){
        const h=building.kind===1?12+building.level*6:building.kind===2?21+building.level*7:17+building.level*8;
        box(g,p.px,p.py,h,roof[building.kind]!,wall[building.kind]!,building.kind===1?0xc5ad91:building.kind===2?0x668f9f:0x837e80);
      }else if(service){
        if(service.kind==='park'){
          diamond(g,p.px,p.py,0x5b985f);
          for(const [dx,dy] of [[-9,6],[7,16],[2,1]]){
            g.rect(p.px+dx!-2,p.py+dy!+1,4,9).fill(0x785b46);
            g.circle(p.px+dx!,p.py+dy!-3,9).fill(serviceColors.park);
            g.circle(p.px+dx!-3,p.py+dy!-6,5).fill(0x90c880);
          }
        } else box(g,p.px,p.py,18,serviceColors[service.kind],0xb2bbb2,0xe5e0d2);
      }
      if(selection?.x===x&&selection.y===y){
        g.poly([p.px,p.py,p.px+HALF_W,p.py+HALF_H,p.px,p.py+HALF_H*2,p.px-HALF_W,p.py+HALF_H]).stroke({width:3,color:tool==='bulldoze'?0xff7c78:0xffffff,alpha:1});
      }
    }
  }
}
export type MapController = {setCity:(city:City)=>void;setSelected:(point:{x:number;y:number}|null,tool:Tool)=>void;destroy:()=>void};
export async function mountMap(host:HTMLElement,initial:City,onTile:(x:number,y:number)=>void):Promise<MapController>{
  const app=new Application();
  await app.init({resizeTo:host,backgroundColor:0xc7dfc7,antialias:true,preference:'webgl',resolution:Math.min(window.devicePixelRatio||1,2)});
  const stage=new Container(),g=new Graphics();stage.addChild(g);app.stage.addChild(stage);
  host.appendChild(app.canvas);
  app.canvas.style.touchAction='none';
  let city=initial,selection:null|{x:number;y:number}=null,tool:Tool='inspect',zoom=.85,panX=host.clientWidth/2,panY=host.clientHeight/2-(29+29)*HALF_H*zoom;
  stage.scale.set(zoom);stage.position.set(panX,panY);
  renderWorld(g,city,selection,tool);
  let down:{x:number;y:number;panX:number;panY:number;pointer:number}|null=null;
  let dragged=false;
  const updateCamera=()=>{stage.scale.set(zoom);stage.position.set(panX,panY);};
  const local=(e:PointerEvent|WheelEvent)=>{const r=app.canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  const pointerDown=(e:PointerEvent)=>{if(e.button!==0&&e.pointerType==='mouse')return;const p=local(e);down={x:p.x,y:p.y,panX,panY,pointer:e.pointerId};dragged=false;app.canvas.setPointerCapture(e.pointerId);};
  const pointerMove=(e:PointerEvent)=>{if(!down||down.pointer!==e.pointerId)return;const p=local(e);if(Math.hypot(p.x-down.x,p.y-down.y)>6)dragged=true;if(dragged){panX=down.panX+p.x-down.x;panY=down.panY+p.y-down.y;updateCamera();}};
  const pointerUp=(e:PointerEvent)=>{if(!down||down.pointer!==e.pointerId)return;const p=local(e);if(!dragged){const wx=(p.x-panX)/zoom,wy=(p.y-panY)/zoom;const x=Math.floor((wy/HALF_H+wx/HALF_W)/2),y=Math.floor((wy/HALF_H-wx/HALF_W)/2);if(x>=0&&y>=0&&x<SIZE&&y<SIZE)onTile(x,y);}down=null;};
  const pointerCancel=()=>{down=null;};
  const wheel=(e:WheelEvent)=>{e.preventDefault();const p=local(e);const factor=e.deltaY<0?1.12:.89;const next=Math.max(.35,Math.min(2.1,zoom*factor));const wx=(p.x-panX)/zoom,wy=(p.y-panY)/zoom;panX=p.x-wx*next;panY=p.y-wy*next;zoom=next;updateCamera();};
  app.canvas.addEventListener('pointerdown',pointerDown);app.canvas.addEventListener('pointermove',pointerMove);app.canvas.addEventListener('pointerup',pointerUp);app.canvas.addEventListener('pointercancel',pointerCancel);app.canvas.addEventListener('wheel',wheel,{passive:false});
  return {setCity(next){city=next;renderWorld(g,city,selection,tool);},setSelected(point,nextTool){selection=point;tool=nextTool;renderWorld(g,city,selection,tool);},destroy(){app.canvas.removeEventListener('pointerdown',pointerDown);app.canvas.removeEventListener('pointermove',pointerMove);app.canvas.removeEventListener('pointerup',pointerUp);app.canvas.removeEventListener('pointercancel',pointerCancel);app.canvas.removeEventListener('wheel',wheel);app.destroy(true,{children:true});}};
}