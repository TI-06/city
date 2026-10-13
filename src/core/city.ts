/** All game logic is deterministic and independent of the renderer and browser storage. */
export const SIZE = 64;
export const SAVE_SCHEMA = 1;
export type Zone = 0 | 1 | 2 | 3;
export type Tool = 'inspect' | 'road' | 'home' | 'shop' | 'industry' | 'park' | 'school' | 'clinic' | 'bulldoze';
export type Policy = 'balanced' | 'growth' | 'eco';
export type Building = { id: number; x: number; y: number; kind: Exclude<Zone, 0>; level: number; residents: number; jobs: number };
export type Service = { id: number; x: number; y: number; kind: 'park' | 'school' | 'clinic' };
export type History = { month: number; population: number; funds: number; income: number; expense: number; happiness: number };
export type City = {
  schema: 1; name: string; seed: number; random: number; month: number; funds: number; tax: number; policy: Policy;
  land: number[]; roads: number[]; zones: number[]; buildings: Building[]; services: Service[];
  nextId: number; history: History[]; paused: boolean; speed: 1 | 2 | 4;
};
export type Stats = { population: number; jobs: number; employed: number; vacancies: number; happiness: number; income: number; expenses: number; balance: number; homes: number; roads: number; commerce: number; industry: number; green: number };

const COST: Record<Tool, number> = { inspect: 0, road: 65, home: 12, shop: 12, industry: 12, park: 750, school: 2900, clinic: 4200, bulldoze: 90 };
export const COSTS = COST;
export const SERVICE_COST: Record<Service['kind'], number> = { park: 18, school: 95, clinic: 145 };
export const POLICY_LABELS: Record<Policy, string> = { balanced: '均衡発展', growth: '産業振興', eco: '環境優先' };
const idx = (x: number, y: number) => y * SIZE + x;
export const inside = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const seeded = (v: number) => ((v ^ (v >>> 16)) * 2246822519) >>> 0;
const stepRandom = (city: City) => { city.random = (Math.imul(city.random, 1664525) + 1013904223) >>> 0; return city.random / 4294967296; };
const adjacent = (city: City, x: number, y: number) => [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b]) => inside(a!,b!) && city.roads[idx(a!,b!)] === 1);
const landAt = (city: City,x:number,y:number) => inside(x,y) && city.land[idx(x,y)] !== 0;
const buildingAt = (city: City,x:number,y:number) => city.buildings.find(b=>b.x===x && b.y===y);
const serviceAt = (city: City,x:number,y:number) => city.services.find(s=>s.x===x && s.y===y);
export const tileIndex = idx;
export const zoneNames = ['', '住宅', '商業', '工業'];
const serviceNames: Record<Service['kind'],string> = { park:'公園',school:'学校',clinic:'診療所' };
export const toolNames: Record<Tool,string> = {inspect:'調査',road:'道路',home:'住宅地区',shop:'商業地区',industry:'工業地区',park:'公園',school:'学校',clinic:'診療所',bulldoze:'撤去'};

export function createCity(name = 'みどり野市', seed = 12937): City {
  const land = Array.from({length:SIZE*SIZE}, (_, n) => {
    const x=n%SIZE, y=Math.floor(n/SIZE);
    const river = 49 + Math.floor(Math.sin(y*0.22 + seed*0.01)*3);
    const lake = (x-8)*(x-8) + (y-51)*(y-51) < 24;
    return Math.abs(x-river)<=1 || lake ? 0 : 1;
  });
  const city: City = {schema:1, name,seed,random:seeded(seed)||1,month:0,funds:38000,tax:9,policy:'balanced',land,
    roads:Array(SIZE*SIZE).fill(0), zones:Array(SIZE*SIZE).fill(0),buildings:[],services:[],nextId:1,history:[],paused:true,speed:1};
  for (let x=17;x<=41;x++) for(const y of [23,31,39]) city.roads[idx(x,y)]=1;
  for (let y=18;y<=44;y++) for(const x of [20,29,38]) city.roads[idx(x,y)]=1;
  for (let y=18;y<=44;y++) for(let x=17;x<=42;x++){
    if(city.roads[idx(x,y)]||!adjacent(city,x,y))continue;
    const kind:Exclude<Zone,0> = x<33?1:x>38?3:2;
    city.zones[idx(x,y)]=kind;
    const rand=stepRandom(city);
    if(rand<0.27){city.buildings.push(createBuilding(city,x,y,kind,1));}
  }
  for (const s of [{x:24,y:24,kind:'park' as const},{x:32,y:32,kind:'school' as const}]){
    city.zones[idx(s.x,s.y)]=0;city.buildings=city.buildings.filter(b=>b.x!==s.x||b.y!==s.y);city.services.push({id:city.nextId++,...s});
  }
  city.history.push(historyEntry(city));
  return city;
}
function createBuilding(city:City,x:number,y:number,kind:Exclude<Zone,0>,level:number):Building{
  return {id:city.nextId++,x,y,kind,level,residents:kind===1?(6+level*6):0,jobs:kind===2?(8+level*5):kind===3?(12+level*8):0};
}
export function getStats(city:City):Stats {
  const population=city.buildings.reduce((n,b)=>n+b.residents,0);
  const jobs=city.buildings.reduce((n,b)=>n+b.jobs,0);
  const labor=Math.round(population*0.53);
  const employed=Math.min(labor,jobs);
  const commerce=city.buildings.filter(b=>b.kind===2).length;
  const industry=city.buildings.filter(b=>b.kind===3).length;
  const roads=city.roads.reduce((n,v)=>n+(v===1?1:0),0);
  const green=city.services.filter(s=>s.kind==='park').length;
  const vacancies=Math.max(0,jobs-employed);
  const access=Math.min(16,city.services.filter(s=>s.kind!=='park').length*5);
  const pollution=Math.round(industry*.65*(city.policy==='eco'?0.6:1));
  const crowded=population>2000?Math.min(12,(population-2000)/200):0;
  const happiness=Math.max(20,Math.min(98,Math.round(62+green*2+access-pollution-crowded+(city.tax-9)*-1.4+(city.policy==='eco'?8:city.policy==='growth'?-3:0))));
  const enterpriseFactor=city.policy==='growth'?1.22:city.policy==='eco'?0.9:1;
  const income=Math.round(population*(city.tax/10)*2.2 + employed*1.5 + (commerce*32+industry*40)*enterpriseFactor);
  const expenses=Math.round(roads*0.85+city.services.reduce((n,s)=>n+SERVICE_COST[s.kind],0)+population*.55+85);
  return {population,jobs,employed,vacancies,happiness,income,expenses,balance:income-expenses,homes:city.buildings.filter(b=>b.kind===1).length,roads,commerce,industry,green};
}
const historyEntry=(city:City):History=>{const s=getStats(city);return {month:city.month,population:s.population,funds:city.funds,income:s.income,expense:s.expenses,happiness:s.happiness};};
export type CommandResult = {ok:true;changed:boolean;message:string;city:City}|{ok:false;changed:false;message:string;city:City};
/** Command is atomic: invalid operations never modify the input world. */
export function applyTool(current: City,tool:Tool,x:number,y:number):CommandResult{
  if(!inside(x,y))return {ok:false,changed:false,message:'マップの範囲外です',city:current};
  const i=idx(x,y), currentBuilding=buildingAt(current,x,y), currentService=serviceAt(current,x,y);
  if(tool==='inspect')return {ok:true,changed:false,message:describeTile(current,x,y),city:current};
  if(tool==='bulldoze'){
    if(!current.roads[i]&&!current.zones[i]&&!currentBuilding&&!currentService)return {ok:false,changed:false,message:'撤去するものがありません',city:current};
    if(current.funds<COST.bulldoze)return {ok:false,changed:false,message:'撤去資金が足りません',city:current};
    const city=structuredClone(current);city.funds-=COST.bulldoze;city.roads[i]=0;city.zones[i]=0;city.buildings=city.buildings.filter(b=>b.x!==x||b.y!==y);city.services=city.services.filter(s=>s.x!==x||s.y!==y);
    return {ok:true,changed:true,message:'撤去しました',city};
  }
  if(!landAt(current,x,y))return {ok:false,changed:false,message:'水域には建設できません',city:current};
  if(current.roads[i]||current.zones[i]||currentBuilding||currentService)return {ok:false,changed:false,message:'すでに建物・地区・道路があります',city:current};
  if(tool!=='road'&&!adjacent(current,x,y))return {ok:false,changed:false,message:'道路に接する土地を選択してください',city:current};
  if(current.funds<COST[tool])return {ok:false,changed:false,message:'資金が足りません',city:current};
  const city=structuredClone(current);city.funds-=COST[tool];
  if(tool==='road')city.roads[i]=1;
  if(tool==='home'||tool==='shop'||tool==='industry')city.zones[i]=tool==='home'?1:tool==='shop'?2:3;
  if(tool==='park'||tool==='school'||tool==='clinic')city.services.push({id:city.nextId++,x,y,kind:tool});
  return {ok:true,changed:true,message:`${toolNames[tool]}を設置しました`,city};
}
export function describeTile(city:City,x:number,y:number):string{
  if(!inside(x,y))return '';
  if(city.land[idx(x,y)]===0)return '川・水域';
  if(city.roads[idx(x,y)])return '道路：建設済み';
  const s=serviceAt(city,x,y);if(s)return `${serviceNames[s.kind]}：運営中`;
  const b=buildingAt(city,x,y);if(b)return `${zoneNames[b.kind]}建物 Lv.${b.level} ／ 居住 ${b.residents}人 ／ 雇用 ${b.jobs}人`;
  return city.zones[idx(x,y)]?`${zoneNames[city.zones[idx(x,y)]!]}地区：開発待ち`:'空き地：開発できます';
}
export function advanceMonths(current:City,count=1):City{
  if(!Number.isInteger(count)||count<0||count>1200)throw new RangeError('Invalid month advance');
  const city=structuredClone(current);
  for(let n=0;n<count;n++){
    // Income is assessed from the preceding month's current population and jobs.
    const stats=getStats(city);
    city.funds+=stats.balance;
    city.month++;
    const candidates: {x:number;y:number;kind:Exclude<Zone,0>}[]=[];
    const occupied=new Set(city.buildings.map(b=>idx(b.x,b.y)));
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const i=idx(x,y),z=city.zones[i] as Zone;
      if(z && !occupied.has(i) && adjacent(city,x,y))candidates.push({x,y,kind:z});
    }
    const growth=Math.min(3,Math.max(0,Math.floor(stats.happiness/40)));
    for(let j=0;j<growth&&candidates.length;j++){
      if(stats.happiness<40 && stepRandom(city)>0.25)continue;
      const choice=Math.floor(stepRandom(city)*candidates.length);
      const [target]=candidates.splice(choice,1);
      if(target)city.buildings.push(createBuilding(city,target.x,target.y,target.kind,1));
    }
    // Gradual redevelopment is a meaningful long-term growth mechanism.
    if(city.month%12===0 && city.buildings.length){
      const b=city.buildings[Math.floor(stepRandom(city)*city.buildings.length)];
      if(b && b.level<3 && stats.happiness>=60){ b.level++; b.residents=b.kind===1?6+b.level*6:0;b.jobs=b.kind===2?8+b.level*5:b.kind===3?12+b.level*8:0; }
    }
    city.history.push(historyEntry(city));
    if(city.history.length>120)city.history.shift();
  }
  return city;
}
export function changePolicy(current:City,policy:Policy):City{if(current.policy===policy)return current;return {...current,policy};}
export function changeTax(current:City,tax:number):City{if(!Number.isInteger(tax)||tax<3||tax>18)return current;return {...current,tax};}
export function validateCity(candidate:unknown):City{
  if(!candidate||typeof candidate!=='object')throw new Error('セーブ形式が正しくありません');
  const c=candidate as Partial<City>;
  if(c.schema!==SAVE_SCHEMA||!Array.isArray(c.land)||!Array.isArray(c.roads)||!Array.isArray(c.zones)||c.land.length!==SIZE*SIZE||c.roads.length!==SIZE*SIZE||c.zones.length!==SIZE*SIZE)throw new Error('対応していないセーブデータです');
  if(!Array.isArray(c.buildings)||!Array.isArray(c.services)||!Array.isArray(c.history)||!Number.isSafeInteger(c.funds)||!Number.isSafeInteger(c.month)||!Number.isSafeInteger(c.random)||!Number.isSafeInteger(c.nextId)||!Number.isInteger(c.tax)||c.tax!<3||c.tax!>18)throw new Error('セーブデータが破損しています');
  if(typeof c.name!=='string'||c.name.length>50||!['eco','growth','balanced'].includes(c.policy??''))throw new Error('都市の設定が無効です');
  const occupied=new Set<number>(),ids=new Set<number>();
  for(const b of c.buildings){if(!inside(b.x,b.y)||!Number.isInteger(b.id)||!Number.isInteger(b.level)||b.level<1||b.level>3||![1,2,3].includes(b.kind)||!Number.isSafeInteger(b.residents)||!Number.isSafeInteger(b.jobs))throw new Error('建物情報が無効です');const i=idx(b.x,b.y);if(occupied.has(i)||ids.has(b.id))throw new Error('建物が重複しています');occupied.add(i);ids.add(b.id);}
  for(const s of c.services){if(!inside(s.x,s.y)||!['park','school','clinic'].includes(s.kind)||!Number.isInteger(s.id))throw new Error('公共施設情報が無効です');const i=idx(s.x,s.y);if(occupied.has(i)||ids.has(s.id))throw new Error('公共施設が重複しています');occupied.add(i);ids.add(s.id);}
  for(let i=0;i<c.land.length;i++){if(![0,1].includes(c.land[i]!)||![0,1].includes(c.roads[i]!)||![0,1,2,3].includes(c.zones[i]!))throw new Error('マップデータが不正です'); if((c.roads[i]&&c.zones[i])||(occupied.has(i)&&c.roads[i])||(c.services.some(s=>idx(s.x,s.y)===i)&&c.zones[i]))throw new Error('マップの配置情報が重複しています');}
  return c as City;
}