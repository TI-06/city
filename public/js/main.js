import { COST, SERVICE, TOOL_LABEL, advanceMonth, calculate, createCity, perform, setPolicy } from './engine.js';
import { Z, T, findTile } from './map.js';
import { IsoRenderer } from './render.js';
import { saveCity, loadCity, exportCity, importCity } from './persistence.js';

const $ = sel => document.querySelector(sel);
const all = sel => [...document.querySelectorAll(sel)];
const formatted = n => Math.round(n).toLocaleString('ja-JP');
const signed = n => `${n >= 0 ? '+' : '−'}${formatted(Math.abs(n))}`;
const monthName = month => {
  const index = (month + 3) % 12;
  return `${2025 + Math.floor((month+3)/12)}年 ${index + 1}月`;
};
let city = createCity(42);
let currentTool='inspect';
let currentPanel='city';
let dirty=false;
let toastTimeout;
let lastError='';
let lastAutoSave=0;

const renderer=new IsoRenderer($('#city-canvas'),{
  paint: (tool,x,y) => {
    const result=perform(city,tool,x,y);
    if(result.ok && result.changed){dirty=true;refresh(false);saveSoon();}
    if(!result.ok && result.message !== lastError){lastError=result.message;toast(result.message,true);}
    if(result.ok)lastError='';
  },
  inspect: (x,y) => {showInspect(x,y);}
});

function toast(message,error=false){
  const el=$('#toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('show');
  clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),2300);
}
function toggleClass(el,cls,on){el.classList.toggle(cls,on);}
function updateStats(){
  const m=calculate(city),prev=city.history.at(-2);
  $('#stat-pop').textContent=formatted(m.population);
  $('#stat-pop-delta').textContent=`居住枠 ${formatted(m.homeCapacity)} 人`;
  $('#stat-cash').textContent=formatted(city.treasury);
  $('#stat-net').textContent=`${signed(m.flow.net)} C / 月`;
  toggleClass($('#stat-net'),'negative',m.flow.net<0);
  $('#stat-happy').textContent=String(m.wellbeing);
  $('#stat-jobs').textContent=formatted(m.jobs);
  $('#stat-unemployment').textContent=`失業率 ${m.unemployment}%`;
  $('#date-label').textContent=monthName(city.month);
  $('#season-label').textContent=['春','夏','秋','冬'][Math.floor(((city.month+3)%12)/3)];
  $('#side-happy').innerHTML=`${m.wellbeing}<small>/100</small>`;
  $('#happy-meter').style.width=m.wellbeing+'%';
  $('#happy-description').textContent=m.wellbeing>=75?'住民は現在の暮らしに満足しています。':m.wellbeing>=55?'安定した街ですが、改善の余地があります。':'住民の不満が高まっています。税率や公共サービスを見直しましょう。';
  $('#side-employed').textContent=formatted(m.employed)+'人';
  $('#side-unemployment').textContent=m.unemployment+'%';
  $('#side-traffic').textContent=m.traffic+'%';
  $('#side-buildings').textContent=formatted(m.buildings)+'棟';
  $('#side-income').textContent='+'+formatted(m.flow.income)+' C';
  $('#side-expense').textContent='−'+formatted(m.flow.expenses)+' C';
  $('#side-net').textContent=signed(m.flow.net)+' C';
  toggleClass($('#side-net'),'negative',m.flow.net<0);
  $('#econ-cash').textContent=formatted(city.treasury);
  $('#econ-income').textContent='+'+formatted(m.flow.income)+' C';
  $('#econ-expense').textContent='−'+formatted(m.flow.expenses)+' C';
  $('#econ-net').textContent=signed(m.flow.net)+' C';
  toggleClass($('#econ-net'),'negative',m.flow.net<0);
  $('#tax-display').textContent=city.taxRate+'%';
  $('#fund-display').textContent=city.serviceFunding+'%';
  $('#tax-range').value=String(city.taxRate);$('#fund-range').value=String(city.serviceFunding);
  $('#stat-happy-caption').textContent=m.wellbeing>=70?'住みよい街':m.wellbeing>=45?'改善の余地あり':'市民の不満';
  $('#activity-feed').replaceChildren(...city.events.slice(0,4).map(e=>{
    const row=document.createElement('div');row.className='activity-item';
    const dot=document.createElement('span');dot.className='activity-bullet '+(e.type==='warning'?'warning':'');
    const content=document.createElement('div'),p=document.createElement('p'),small=document.createElement('small');
    p.textContent=e.text;small.textContent=`${monthName(e.month)} · 都市からのお知らせ`;
    content.append(p,small);row.append(dot,content);return row;
  }));
  if(prev&&m.population>prev.population)$('#stat-pop-delta').textContent+=`  · +${formatted(m.population-prev.population)}`;
  $('#auto-save-indicator').textContent=dirty?'変更を保存しています…':'自動保存有効';
  drawFinanceChart();
}
function drawFinanceChart(){
  const canvas=$('#finance-chart'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const arr=city.history.slice(-12);if(!arr.length)return;
  const vals=arr.map(x=>x.income-x.expenses),min=Math.min(0,...vals),max=Math.max(0,...vals),span=Math.max(1,max-min);
  const x0=16,x1=w-16,y0=18,y1=h-17;
  const toY=v=>y1-((v-min)/span)*(y1-y0);
  ctx.strokeStyle='#dce8dd';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0,toY(0));ctx.lineTo(x1,toY(0));ctx.stroke();
  if(arr.length>1){ctx.beginPath();arr.forEach((v,i)=>{const x=x0+i/(arr.length-1)*(x1-x0),y=toY(v.income-v.expenses);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.strokeStyle='#368e60';ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();}
  for(let i=0;i<arr.length;i++){const x=arr.length===1?w/2:x0+i/(arr.length-1)*(x1-x0),y=toY(vals[i]);ctx.fillStyle='#fff';ctx.strokeStyle='#368e60';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.stroke();}
}
function refresh(render=true){updateStats();if(render)renderer.setCity(city);}
function changePanel(panel){
  currentPanel=panel;
  all('.tab-panel').forEach(e=>e.classList.toggle('active',e.id===`panel-${panel}`));
  all('.nav-item[data-panel]').forEach(e=>e.classList.toggle('selected',e.dataset.panel===panel));
  $('#side-heading').textContent={city:'都市の概況',economy:'財政と経済',policy:'政策と予算',build:'建設ガイド',inspect:'区画の詳細'}[panel]??'都市の概況';
  if(window.innerWidth<=820)$('.sidebar').classList.add('mobile-open');
  drawFinanceChart();
}
function toolSelected(tool){
  currentTool=tool;renderer.setTool(tool);
  all('[data-tool]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tool===tool));
  $('#tool-name').textContent=(TOOL_LABEL[tool]??'調査')+'モード';
  $('#tool-hint').textContent=tool==='inspect'?'区画をクリックして詳細を確認':tool==='road'?'地面をドラッグして道路を敷く':'道路沿いの空き地を選択';
  $('#active-tool-side').textContent=TOOL_LABEL[tool]??'調査';
  $('#tool-cost').textContent=tool==='inspect'?'無料':`${formatted(COST[tool]??0)} C`;
  if(window.innerWidth<=820)$('.sidebar').classList.remove('mobile-open');
}
function showInspect(x,y){
  const tile=findTile(city,x,y);if(!tile)return;
  const zText=['未指定','住宅地域','商業地域','工業地域'];
  const kind=tile.building?zText[tile.building.kind]:tile.service?SERVICE[tile.service.kind].name:tile.road?'道路':tile.terrain===T.WATER?'河川':tile.terrain===T.FOREST?'森林':'空き地';
  const rows=[['座標',`${x}, ${y}`],['用途地域',zText[tile.zone]],['道路アクセス',tile.access?'あり':'なし'],['地形',tile.terrain===T.WATER?'水域':'陸地']];
  if(tile.building){rows.push(['建物','レベル '+tile.building.level]);if(tile.building.kind===Z.HOME)rows.push(['入居人口',tile.building.occupants+'人']);}
  if(tile.service)rows.push(['維持費',`${SERVICE[tile.service.kind].monthly} C/月`]);
  const details=$('#inspect-details');details.replaceChildren();
  const heading=document.createElement('h3');heading.textContent=kind;details.append(heading);
  const dl=document.createElement('dl');for(const [k,v] of rows){const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;div.append(dt,dd);dl.append(div);}details.append(dl);
  changePanel('inspect');
}
let pendingSave;
function saveSoon(){clearTimeout(pendingSave);pendingSave=setTimeout(()=>doSave('autosave',true),1000);}
async function doSave(slot='autosave',quiet=false){
  try{await saveCity(city,slot);dirty=false;lastAutoSave=Date.now();$('#auto-save-indicator').textContent=`保存済み · ${new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}`;if(!quiet)toast('都市を保存しました');}
  catch(err){$('#auto-save-indicator').textContent='保存に失敗';toast(`保存できません：${err.message}`,true);}
}
function tick(){advanceMonth(city);dirty=true;refresh();saveSoon();}
all('.nav-item[data-panel]').forEach(btn=>btn.addEventListener('click',()=>{
  if(window.innerWidth<=820 && currentPanel===btn.dataset.panel && $('.sidebar').classList.contains('mobile-open'))$('.sidebar').classList.remove('mobile-open');
  else changePanel(btn.dataset.panel);
}));
all('[data-goto]').forEach(btn=>btn.addEventListener('click',()=>changePanel(btn.dataset.goto)));
all('[data-tool]').forEach(btn=>btn.addEventListener('click',()=>toolSelected(btn.dataset.tool)));
$('#toggle-pause').addEventListener('click',()=>{city.paused=!city.paused;$('#toggle-pause').textContent=city.paused?'▶':'Ⅱ';$('#toggle-pause').title=city.paused?'再開':'一時停止';});
all('[data-speed]').forEach(btn=>btn.addEventListener('click',()=>{city.speed=Number(btn.dataset.speed);all('[data-speed]').forEach(b=>b.classList.toggle('is-on',b===btn));}));
$('#next-month').addEventListener('click',()=>tick());
$('#zoom-in').addEventListener('click',()=>renderer.zoomBy(1.2));
$('#zoom-out').addEventListener('click',()=>renderer.zoomBy(.83));
$('#zoom-reset').addEventListener('click',()=>renderer.resetView());
for(const [input,field] of [['#tax-range','taxRate'],['#fund-range','serviceFunding']]){
  $(input).addEventListener('input',e=>{setPolicy(city,field,Number(e.target.value));dirty=true;refresh();saveSoon();});
}
const dialog=$('#save-dialog');
$('#menu-save').addEventListener('click',()=>dialog.showModal());
$('#close-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
$('#save-manual').addEventListener('click',()=>doSave('manual'));
$('#load-manual').addEventListener('click',async()=>{
  try{const loaded=await loadCity('manual');if(!loaded){toast('手動保存データがありません',true);return;}city=loaded;renderer.setCity(city);refresh();dialog.close();toast('保存データを読み込みました');}
  catch(err){toast(`読込エラー：${err.message}`,true);}
});
$('#export-city').addEventListener('click',()=>{
  const blob=exportCity(city),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`hinode-city-${city.month}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('バックアップを出力しました');
});
$('#import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{city=await importCity(file);refresh();dirty=true;saveSoon();dialog.close();toast('バックアップを復元しました');}
  catch(err){toast(`インポートできません：${err.message}`,true);}
  e.target.value='';
});
$('#new-city').addEventListener('click',()=>{
  if(!window.confirm('現在の都市を新規作成しますか？未保存の変更は失われます。'))return;
  city=createCity(Date.now()>>>0);renderer.resetView();refresh();dirty=true;saveSoon();dialog.close();toast('新しい都市を作成しました');
});

let elapsed=0,lastFrame=performance.now();
function loop(now){
  const diff=Math.min(500,now-lastFrame);lastFrame=now;
  if(!city.paused){elapsed+=diff*city.speed;let steps=0;while(elapsed>=20000&&steps<6){elapsed-=20000;tick();steps++;}}
  else elapsed=Math.min(elapsed,19999);
  requestAnimationFrame(loop);
}
async function start(){
  try{
    const saved=await loadCity('autosave');if(saved){city=saved;toast('前回の都市を復元しました');}
  }catch(err){toast(`前回の保存データを読めません：${err.message}`,true);}
  renderer.setCity(city);refresh();toolSelected('inspect');
  all('.nav-item[data-panel]').forEach(e=>e.classList.toggle('selected',e.dataset.panel==='city'));
  if(city.speed)all('[data-speed]').forEach(b=>b.classList.toggle('is-on',Number(b.dataset.speed)===city.speed));
  if(city.paused)$('#toggle-pause').textContent='▶';
  requestAnimationFrame(loop);
}
start();
