import { SIZE, T, Z, createTerrain, hash, hasRoadAccess, inside } from './map.js';

export const SAVE_VERSION = 1;
export const COST = Object.freeze({ road: 180, home: 45, shop: 65, industry: 75, erase: 10, park: 2800, school: 9000, clinic: 12000 });
export const SERVICE = Object.freeze({ park: { monthly: 105, reach: 7, name: '公園' }, school: { monthly: 260, reach: 12, name: '学校' }, clinic: { monthly: 380, reach: 15, name: '診療所' } });
export const TOOL_LABEL = Object.freeze({ inspect: '調査', road: '道路', home: '住宅用地', shop: '商業用地', industry: '工業用地', park: '公園', school: '学校', clinic: '診療所', erase: '撤去' });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const idx = (city, x, y) => y * city.size + x;
const occupied = (city, x, y) => city.buildings.some(b => b.x === x && b.y === y) || city.services.some(s => s.x === x && s.y === y);
const money = n => Math.round(n);

function seedBlock(city, x, y, zone, occupancy = 0) {
  const i = idx(city, x, y);
  if (city.terrain[i] === T.WATER || city.roads[i] || occupied(city, x, y)) return;
  city.zones[i] = zone;
  if (occupancy > 0) {
    city.buildings.push({ id: city.nextId++, x, y, kind: zone, level: 1, occupants: zone === Z.HOME ? occupancy : 0 });
  }
}

export function createCity(seed = 42) {
  const s = Number(seed) >>> 0;
  const city = {
    schemaVersion: SAVE_VERSION, size: SIZE, seed: s, name: '日ノ出市', month: 0,
    treasury: 48500, taxRate: 8, serviceFunding: 100, speed: 1, paused: false,
    terrain: createTerrain(s), roads: new Array(SIZE * SIZE).fill(0), zones: new Array(SIZE * SIZE).fill(0),
    buildings: [], services: [], nextId: 1, history: [], events: [], lastFlow: { income: 0, expenses: 0, net: 0 },
  };
  // Pre-built starter town: small enough to invite construction, lively on first load.
  for (let x = 29; x <= 44; x++) city.roads[idx(city, x, 31)] = 1;
  for (let y = 22; y <= 42; y++) city.roads[idx(city, 35, y)] = 1;
  for (let x = 33; x <= 41; x++) city.roads[idx(city, x, 37)] = 1;
  for (let x = 37; x <= 42; x++) city.roads[idx(city, x, 26)] = 1;
  for (let y = 26; y <= 37; y++) city.roads[idx(city, 41, y)] = 1;
  for (let y = 28; y <= 34; y++) {
    for (let x = 30; x <= 33; x++) {
      if (city.roads[idx(city, x, y)]) continue;
      const v = hash(s + 31, x, y);
      seedBlock(city, x, y, Z.HOME, v < .53 ? 7 + Math.floor(v * 8) : 0);
    }
  }
  for (let y = 27; y <= 35; y++) {
    for (let x = 37; x <= 39; x++) {
      if (city.roads[idx(city, x, y)]) continue;
      const v = hash(s + 8, x, y);
      seedBlock(city, x, y, y < 31 ? Z.SHOP : Z.HOME, v < .34 ? 8 : 0);
    }
  }
  for (let x = 38; x <= 44; x++) {
    seedBlock(city, x, 39, Z.INDUSTRY, x % 3 === 0 ? 1 : 0);
  }
  city.services.push({ id: city.nextId++, x: 34, y: 29, kind: 'park' });
  city.lastFlow = calculate(city).flow;
  city.history.push(snapshot(city));
  city.events = [{ month: 0, text: '日ノ出市が誕生しました。最初の都市計画を始めましょう。', type: 'good' }];
  return city;
}

export function calculate(city) {
  const homes = city.buildings.filter(b => b.kind === Z.HOME);
  const shops = city.buildings.filter(b => b.kind === Z.SHOP);
  const industries = city.buildings.filter(b => b.kind === Z.INDUSTRY);
  const population = homes.reduce((n,b) => n + b.occupants, 0);
  const homeCapacity = homes.reduce((n,b) => n + (b.level === 1 ? 18 : 32), 0);
  const jobs = shops.reduce((n,b) => n + 14 * b.level, 0) + industries.reduce((n,b) => n + 28 * b.level, 0);
  const workers = Math.floor(population * .55);
  const employed = Math.min(jobs, workers);
  const unemployment = workers > 0 ? Math.round((workers - employed) / workers * 100) : 0;
  const roadCount = city.roads.reduce((a,v) => a + (v === 1 ? 1 : 0), 0);
  const traffic = clamp(Math.round((population * .7 + jobs * .3) / Math.max(50, roadCount * 4.3) * 100), 2, 180);
  const serviceCount = { park: 0, school: 0, clinic: 0 };
  for (const service of city.services) serviceCount[service.kind]++;
  const parkAccess = homes.length ? homes.filter(b => city.services.some(s => s.kind === 'park' && Math.abs(b.x - s.x) + Math.abs(b.y - s.y) <= SERVICE.park.reach)).length / homes.length : 0;
  const schoolAccess = homes.length ? homes.filter(b => city.services.some(s => s.kind === 'school' && Math.abs(b.x - s.x) + Math.abs(b.y - s.y) <= SERVICE.school.reach)).length / homes.length : 0;
  const clinicAccess = homes.length ? homes.filter(b => city.services.some(s => s.kind === 'clinic' && Math.abs(b.x - s.x) + Math.abs(b.y - s.y) <= SERVICE.clinic.reach)).length / homes.length : 0;
  const wellbeing = clamp(Math.round(67 + parkAccess * 7 + schoolAccess * 7 + clinicAccess * 8 + (city.serviceFunding - 100) * .13 - unemployment * .31 - Math.max(0, traffic - 75) * .16 - Math.max(0, city.taxRate - 8) * 2.5 - industries.length * .25), 5, 100);
  // Approximated aggregate fiscal model; all effects use the same public parameters.
  const residentTaxes = money(population * (city.taxRate / 8) * 10);
  const corporateTaxes = money(employed * 7 + shops.length * 6 + industries.length * 13);
  const income = residentTaxes + corporateTaxes;
  const fixed = 390;
  const infrastructure = roadCount * 9;
  const services = money(city.services.reduce((n,s) => n + SERVICE[s.kind].monthly, 0) * city.serviceFunding / 100);
  const social = money(population * .75);
  const expenses = fixed + infrastructure + services + social;
  return { population, homeCapacity, jobs, workers, employed, unemployment, traffic, wellbeing,
    roadCount, services: serviceCount, buildings: city.buildings.length, flow: { income, expenses, net: income - expenses } };
}

function snapshot(city) {
  const m = calculate(city);
  return { month: city.month, population: m.population, treasury: city.treasury, jobs: m.jobs, happiness: m.wellbeing, income: m.flow.income, expenses: m.flow.expenses };
}

function develop(city) {
  const stats = calculate(city);
  const activeZoneCounts = [Z.HOME, Z.SHOP, Z.INDUSTRY].map(kind => city.buildings.filter(b=>b.kind===kind).length);
  const priorities = [];
  if (stats.homeCapacity < Math.max(80, stats.jobs * 1.65)) priorities.push(Z.HOME);
  if (stats.jobs < Math.max(80, stats.population * .7)) priorities.push(Z.SHOP, Z.INDUSTRY);
  if (activeZoneCounts[1] * 2 < activeZoneCounts[0]) priorities.push(Z.SHOP);
  priorities.push(Z.HOME, Z.SHOP, Z.INDUSTRY);
  const order = [...new Set(priorities)];
  for (const kind of order) {
    const prospects = [];
    for (let y=0;y<city.size;y++) for(let x=0;x<city.size;x++) {
      const i=idx(city,x,y);
      if(city.zones[i]===kind && !occupied(city,x,y) && hasRoadAccess(city,x,y)) prospects.push([x,y]);
    }
    if (!prospects.length) continue;
    const which = Math.floor(hash(city.seed + city.month * 11, kind, prospects.length) * prospects.length);
    const [x,y] = prospects[which];
    city.buildings.push({ id: city.nextId++, x, y, kind, level: 1, occupants: kind === Z.HOME ? 4 : 0 });
    return;
  }
}

function settleResidents(city) {
  const current = calculate(city);
  for (const b of city.buildings) {
    if (b.kind !== Z.HOME) continue;
    const target = 18;
    if (b.occupants < target && current.wellbeing >= 42 && current.jobs >= current.workers * .65) {
      const incoming = current.wellbeing >= 75 ? 2 : 1;
      b.occupants = Math.min(target, b.occupants + incoming);
    } else if (b.occupants > 1 && (current.wellbeing < 28 || current.unemployment > 58)) {
      b.occupants -= 1;
    }
  }
}

export function advanceMonth(city) {
  city.month += 1;
  develop(city);
  settleResidents(city);
  const m = calculate(city);
  city.lastFlow = m.flow;
  city.treasury += m.flow.net;
  city.history.push(snapshot(city));
  if (city.history.length > 60) city.history.shift();
  if (city.month % 12 === 0) {
    const s = Math.floor(city.month / 12);
    city.events.unshift({ month: city.month, type: m.flow.net < 0 ? 'warning' : 'good', text: `${s}年目を迎えました。人口 ${m.population.toLocaleString('ja-JP')}人、月次収支 ${m.flow.net >= 0 ? '+' : ''}${m.flow.net.toLocaleString('ja-JP')} C。` });
  }
  if (city.treasury < 0 && (city.month === 1 || city.history.at(-2)?.treasury >= 0)) city.events.unshift({ month: city.month, type: 'warning', text: '財政赤字が発生。維持費や税率を見直しましょう。' });
  city.events = city.events.slice(0, 18);
  return m;
}

export function setPolicy(city, field, value) {
  if(field === 'taxRate') {
    if(!Number.isInteger(value) || value < 3 || value > 18) throw Error('税率は3〜18%で設定してください');
    city.taxRate = value;
  } else if(field === 'serviceFunding') {
    if(!Number.isInteger(value) || value < 50 || value > 150) throw Error('サービス予算は50〜150%で設定してください');
    city.serviceFunding = value;
  } else throw Error('不明な政策です');
  city.lastFlow = calculate(city).flow;
}

export function perform(city, tool, x, y) {
  if (!inside(x,y,city.size)) return { ok:false, message:'マップの範囲外です' };
  if (tool === 'inspect') return { ok:true, message:'区画を確認しました', changed:false };
  const i=idx(city,x,y);
  const building = city.buildings.find(b => b.x === x && b.y === y);
  const service = city.services.find(s => s.x === x && s.y === y);
  const hasContent = Boolean(city.roads[i] || city.zones[i] || building || service);
  if (tool === 'erase') {
    if (!hasContent) return {ok:false,message:'撤去するものがありません'};
    if (city.treasury < COST.erase) return {ok:false,message:'資金が不足しています'};
    city.roads[i]=0; city.zones[i]=0;
    city.buildings = city.buildings.filter(b => b.x !== x || b.y !== y);
    city.services = city.services.filter(s => s.x !== x || s.y !== y);
    city.treasury -= COST.erase;
    return {ok:true,message:'区画を撤去しました',changed:true};
  }
  if (city.terrain[i] === T.WATER) return {ok:false,message:'水上には建設できません'};
  if (tool === 'road') {
    if(city.roads[i]) return {ok:true,changed:false};
    if(hasContent) return {ok:false,message:'建物や用途地域と重複しています'};
    if(city.treasury < COST.road) return {ok:false,message:'道路を作る資金が不足しています'};
    city.roads[i]=1; city.treasury-=COST.road;
    return {ok:true,message:'道路を敷設しました',changed:true};
  }
  if (['home','shop','industry'].includes(tool)) {
    if (city.roads[i] || service || building) return {ok:false,message:'道路・建物のある場所は指定できません'};
    const zone = tool === 'home' ? Z.HOME : tool === 'shop' ? Z.SHOP : Z.INDUSTRY;
    if(city.zones[i] === zone) return {ok:true,changed:false};
    if(city.treasury < COST[tool]) return {ok:false,message:'用途地域を指定する資金が不足しています'};
    city.zones[i]=zone; city.treasury-=COST[tool];
    return {ok:true,message:'用途地域を指定しました。時間経過で建物が発展します。',changed:true};
  }
  if (SERVICE[tool]) {
    if (hasContent) return {ok:false,message:'建物や道路と重複しています'};
    if (!hasRoadAccess(city,x,y)) return {ok:false,message:'道路に隣接させてください'};
    if (city.treasury < COST[tool]) return {ok:false,message:'公共施設を建てる資金が不足しています'};
    city.services.push({id:city.nextId++,x,y,kind:tool});city.treasury-=COST[tool];
    city.events.unshift({month:city.month,type:'good',text:`${SERVICE[tool].name}が完成しました。`});
    return {ok:true,message:`${SERVICE[tool].name}を建設しました`,changed:true};
  }
  return {ok:false,message:'未知の建設ツールです'};
}

export function verifyCity(c) {
  if (!c || c.schemaVersion !== SAVE_VERSION || c.size !== SIZE || !Number.isInteger(c.seed) || !Number.isInteger(c.month) || c.month < 0 || !Number.isSafeInteger(c.treasury)) throw Error('互換性のないセーブデータです');
  if(!Array.isArray(c.roads) || c.roads.length !== SIZE*SIZE || !c.roads.every(x=>x===0||x===1)) throw Error('道路データが破損しています');
  if(!Array.isArray(c.zones) || c.zones.length !== SIZE*SIZE || !c.zones.every(x=>x>=0&&x<=3&&Number.isInteger(x))) throw Error('区画データが破損しています');
  if(!Array.isArray(c.terrain) || c.terrain.length!==SIZE*SIZE || !c.terrain.every(x=>x>=0&&x<=2&&Number.isInteger(x))) throw Error('地形データが破損しています');
  if(!Array.isArray(c.buildings) || !Array.isArray(c.services) || c.buildings.length>SIZE*SIZE || c.services.length>SIZE*SIZE) throw Error('建物データが破損しています');
  if(!Number.isInteger(c.taxRate) || c.taxRate<3 || c.taxRate>18 || !Number.isInteger(c.serviceFunding) || c.serviceFunding<50 || c.serviceFunding>150) throw Error('政策データが破損しています');
  const coord = new Set(), ids = new Set();
  for(const b of [...c.buildings,...c.services]) {
    if(!inside(b.x,b.y,SIZE) || !Number.isSafeInteger(b.id) || b.id<=0 || ids.has(b.id) || coord.has(`${b.x},${b.y}`)) throw Error('建物の座標・IDが不正です');
    ids.add(b.id);coord.add(`${b.x},${b.y}`);
    if(c.roads[idx(c,b.x,b.y)] || c.terrain[idx(c,b.x,b.y)]===T.WATER) throw Error('建物が道路・水域と重なっています');
    if('kind' in b && typeof b.occupants === 'number' && (!Number.isSafeInteger(b.occupants)||b.occupants<0||b.occupants>32)) throw Error('入居者数が不正です');
  }
  if(!Number.isSafeInteger(c.nextId) || c.nextId <= Math.max(0,...ids)) throw Error('次の建物IDが不正です');
  if(!Array.isArray(c.history) || c.history.length>60 || !Array.isArray(c.events) || c.events.length>18) throw Error('履歴データが不正です');
  return true;
}
