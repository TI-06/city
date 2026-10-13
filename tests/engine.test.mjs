import test from 'node:test';
import assert from 'node:assert/strict';
import { createCity, calculate, advanceMonth, perform, setPolicy, verifyCity, SAVE_VERSION } from '../public/js/engine.js';
import { Z, T, inside } from '../public/js/map.js';

function emptyCell(c) {
 for(let y=0;y<c.size;y++)for(let x=0;x<c.size;x++){
  const i=y*c.size+x;
  if(c.terrain[i]===T.GRASS&&!c.roads[i]&&!c.zones[i]&&!c.buildings.some(b=>b.x===x&&b.y===y)&&!c.services.some(s=>s.x===x&&s.y===y))return [x,y];
 }
 throw Error('No empty cell');
}

test('fresh city has valid state, finite economy and seeded terrain',()=>{
 const a=createCity(42),b=createCity(42);
 assert.equal(a.schemaVersion,SAVE_VERSION);
 assert.equal(verifyCity(a),true);
 assert.deepEqual(a.terrain,b.terrain);
 assert.equal(a.terrain.length,64*64);
 assert.ok(calculate(a).population>0);
 assert.ok(Number.isFinite(calculate(a).flow.net));
});

test('construction deducts exact cost and cannot spend twice on same road tile',()=>{
 const c=createCity(),[x,y]=emptyCell(c),before=c.treasury;
 assert.equal(perform(c,'road',x,y).ok,true);
 assert.equal(c.treasury,before-180);
 assert.equal(perform(c,'road',x,y).changed,false);
 assert.equal(c.treasury,before-180);
 assert.equal(verifyCity(c),true);
});

test('water and occupied plots reject construction without charging',()=>{
 const c=createCity(),before=c.treasury;
 const i=c.terrain.indexOf(T.WATER),x=i%c.size,y=Math.floor(i/c.size);
 assert.equal(perform(c,'road',x,y).ok,false);
 assert.equal(c.treasury,before);
 const existing=c.buildings[0];
 assert.equal(perform(c,'road',existing.x,existing.y).ok,false);
 assert.equal(c.treasury,before);
});

test('policies change tax, funding, happiness and financial outcome',()=>{
 const c=createCity(),base=calculate(c);
 setPolicy(c,'taxRate',15);
 const higher=calculate(c);
 assert.ok(higher.flow.income>base.flow.income);
 assert.ok(higher.wellbeing<base.wellbeing);
 setPolicy(c,'serviceFunding',150);
 const funded=calculate(c);
 assert.ok(funded.flow.expenses>higher.flow.expenses);
 assert.throws(()=>setPolicy(c,'taxRate',55));
 assert.throws(()=>setPolicy(c,'serviceFunding',0));
});

test('monthly advances are deterministic and history is bounded to 60 months',()=>{
 const a=createCity(786),b=createCity(786);
 for(let t=0;t<1300;t++){advanceMonth(a);advanceMonth(b);}
 assert.equal(a.month,1300);
 assert.deepEqual(a,b);
 assert.equal(a.history.length,60);
 assert.ok(a.events.length<=18);
 assert.equal(verifyCity(a),true);
 assert.ok(Number.isSafeInteger(a.treasury));
});

test('city can be JSON saved and restored without drifting next monthly simulation',()=>{
 const a=createCity(45);
 for(let t=0;t<120;t++)advanceMonth(a);
 const b=JSON.parse(JSON.stringify(a));
 assert.equal(verifyCity(b),true);
 for(let t=0;t<150;t++){advanceMonth(a);advanceMonth(b);}
 assert.deepEqual(a,b);
});

test('zoning funds check prevents partial mutation',()=>{
 const c=createCity(),[x,y]=emptyCell(c);
 c.treasury=0;
 assert.equal(perform(c,'home',x,y).ok,false);
 assert.equal(c.zones[y*c.size+x],Z.NONE);
});

test('corrupt saves and incompatible schemas are rejected',()=>{
 const base=createCity();
 assert.throws(()=>verifyCity({...base,schemaVersion:99}));
 assert.throws(()=>verifyCity({...base,roads:[1]}));
 assert.throws(()=>verifyCity({...base,history:new Array(61).fill({})}));
 const bad=JSON.parse(JSON.stringify(base));bad.buildings[0].x=-1;
 assert.throws(()=>verifyCity(bad));
});

test('out of bounds placement is safe',()=>{
 const c=createCity();for(const [x,y] of [[-1,4],[2,-1],[64,3],[2,64]]){
  assert.equal(inside(x,y),false);assert.equal(perform(c,'road',x,y).ok,false);
 }
});

test('public services need road access and charge exactly once',()=>{
 const city=createCity(1337);
 let candidate;
 for(let y=0;y<city.size;y++)for(let x=0;x<city.size;x++){
  const i=y*city.size+x;
  if(!city.roads[i]&&!city.zones[i]&&city.terrain[i]===T.GRASS && city.services.every(s=>s.x!==x||s.y!==y)
    && city.buildings.every(b=>b.x!==x||b.y!==y)
    && [[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy])=>{
      const px=x+dx,py=y+dy;return inside(px,py)&&city.roads[py*city.size+px];
    })) candidate=[x,y];
 }
 assert.ok(candidate);
 const before=city.treasury;
 const [x,y]=candidate;
 assert.equal(perform(city,'park',x,y).ok,true);
 assert.equal(city.treasury,before-2800);
 assert.equal(perform(city,'park',x,y).ok,false);
 assert.equal(city.treasury,before-2800);
 assert.equal(verifyCity(city),true);
});
