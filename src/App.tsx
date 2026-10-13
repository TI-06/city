import {useCallback,useEffect,useRef,useState} from 'react';
import {applyTool,advanceMonths,changePolicy,changeTax,createCity,describeTile,getStats,type City,type Policy,type Tool,COSTS,toolNames,POLICY_LABELS} from './core/city';
import {mountMap,type MapController} from './game/map';
import {exportCity,importCity,loadCity,saveCity} from './persistence/storage';

type Menu='build'|'finance'|'residents'|'policy';
const palettes: {tool:Tool; icon:string; hint:string}[] = [
  {tool:'inspect',icon:'⌖',hint:'土地を調べる'},
  {tool:'road',icon:'═',hint:'道路を建設'},
  {tool:'home',icon:'⌂',hint:'住宅地区'},
  {tool:'shop',icon:'▤',hint:'商業地区'},
  {tool:'industry',icon:'▥',hint:'工業地区'},
  {tool:'park',icon:'♣',hint:'公園'},
  {tool:'school',icon:'▣',hint:'学校'},
  {tool:'clinic',icon:'✚',hint:'診療所'},
  {tool:'bulldoze',icon:'✕',hint:'撤去する'},
];
const format=(n:number)=>new Intl.NumberFormat('ja-JP').format(n);
const shortMoney=(n:number)=>`${n<0?'−':' '}${format(Math.abs(n))} C`;
const monthText=(m:number)=>`${2025+Math.floor(m/12)}年 ${m%12+1}月`;
function Sparkline({numbers}:{numbers:number[]}){
  if(numbers.length<2)return <div className="empty-chart">都市の歴史を記録しています</div>;
  const w=280,h=72,min=Math.min(...numbers),max=Math.max(...numbers),span=max-min||1;
  const pts=numbers.map((v,i)=>`${(i/(numbers.length-1))*w},${h-5-((v-min)/span)*(h-13)}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="直近の人口推移"><path d="M0 64 H280" stroke="currentColor" opacity=".12"/><polyline points={pts} fill="none" stroke="#58b38a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/></svg>;
}
export function App(){
  const [city,setCity]=useState<City>(()=>createCity());
  const cityRef=useRef(city);cityRef.current=city;
  const [tool,setTool]=useState<Tool>('inspect');
  const toolRef=useRef<Tool>('inspect');toolRef.current=tool;
  const [active,setActive]=useState<Menu>('build');
  const [selected,setSelected]=useState<{x:number;y:number}|null>(null);
  const selectedRef=useRef<{x:number;y:number}|null>(null);selectedRef.current=selected;
  const [message,setMessage]=useState('道路を敷いたり、住宅地区を指定して街を育てましょう。');
  const [saveLabel,setSaveLabel]=useState('ローカル保存');
  const [ready,setReady]=useState(false);
  const [help,setHelp]=useState(false);
  const mapHost=useRef<HTMLDivElement>(null);const mapRef=useRef<MapController|null>(null);
  const importRef=useRef<HTMLInputElement>(null);
  const stats=getStats(city);
  const onTile=useCallback((x:number,y:number)=>{
    const current=cityRef.current,nowTool=toolRef.current;
    selectedRef.current={x,y};setSelected({x,y});
    if(nowTool==='inspect'){setMessage(describeTile(current,x,y));return;}
    const result=applyTool(current,nowTool,x,y);
    setMessage(result.message);
    if(result.changed){cityRef.current=result.city;setCity(result.city);void saveCity(result.city).then(()=>setSaveLabel('自動保存済み')).catch(()=>setSaveLabel('保存エラー'));}
  },[]);
  useEffect(()=>{
    let disposed=false;
    const host=mapHost.current;
    if(!host)return;
    mountMap(host,cityRef.current,onTile).then(controller=>{
      if(disposed){controller.destroy();return;}
      mapRef.current=controller;setReady(true);controller.setSelected(selectedRef.current,toolRef.current);
    }).catch(e=>{if(!disposed)setMessage(`描画を開始できませんでした：${String(e)}`);});
    return()=>{disposed=true;mapRef.current?.destroy();mapRef.current=null;};
  },[onTile]);
  useEffect(()=>{mapRef.current?.setCity(city);},[city]);
  useEffect(()=>{mapRef.current?.setSelected(selected,tool);},[selected,tool]);
  useEffect(()=>{let cancelled=false;void loadCity().then(saved=>{if(saved&&!cancelled){const fresh={...saved,paused:true};cityRef.current=fresh;setCity(fresh);setMessage('前回の都市を復元しました');}}).catch(()=>{if(!cancelled)setSaveLabel('保存先を利用できません');});return()=>{cancelled=true;};},[]);
  useEffect(()=>{
    if(city.paused)return;
    const timer=window.setInterval(()=>{const next=advanceMonths(cityRef.current,1);cityRef.current=next;setCity(next);if(next.month%2===0)void saveCity(next).then(()=>setSaveLabel('自動保存済み')).catch(()=>setSaveLabel('保存エラー'));},20000/city.speed);
    return()=>window.clearInterval(timer);
  },[city.paused,city.speed]);
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','BUTTON'].includes((e.target as HTMLElement).tagName)){e.preventDefault();setCity(c=>({...c,paused:!c.paused}));}if(e.code==='Escape')setTool('inspect');};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  const toggle=()=>setCity(c=>({...c,paused:!c.paused}));
  const setSpeed=(speed:1|2|4)=>setCity(c=>({...c,speed,paused:false}));
  const applyPolicy=(p:Policy)=>{const next=changePolicy(city,p);setCity(next);void saveCity(next);setMessage(`${POLICY_LABELS[p]}の方針へ変更しました`);};
  const applyTax=(t:number)=>{const next=changeTax(city,t);setCity(next);void saveCity(next);};
  const setCurrentTool=(t:Tool)=>{setTool(t);setActive('build');setMessage(t==='inspect'?'調べたい建物や道路をクリックしてください':`${toolNames[t]}：土地をクリックして配置してください`);};
  const manualSave=()=>{void saveCity(cityRef.current,'manual').then(()=>{setSaveLabel('手動保存完了');setMessage('都市を保存しました');}).catch(()=>setMessage('保存に失敗しました'));};
  const doImport=async(f:File|undefined)=>{if(!f)return;try{const next=await importCity(f);next.paused=true;cityRef.current=next;setCity(next);await saveCity(next);setMessage('都市のデータを読み込みました');}catch(e){setMessage(e instanceof Error?e.message:'読込エラー');}};
  const selectedDescription=selected?describeTile(city,selected.x,selected.y):'マップをクリックして土地を選択';
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark">C<span>•</span></div><div><strong>CITYSCAPE</strong><small>街づくりと都市経営</small></div></div>
      <div className="sidebar-section-label">CITY MANAGER</div>
      <nav aria-label="メインメニュー" className="menu">
        {([{id:'build',icon:'▦',name:'都市建設'},{id:'finance',icon:'▥',name:'財政と経済'},{id:'residents',icon:'♙',name:'住民と人口'},{id:'policy',icon:'⚑',name:'政策と行政'}] as const).map(item=><button key={item.id} className={`menu-link ${active===item.id?'active':''}`} onClick={()=>setActive(item.id)}><span className="menu-icon">{item.icon}</span>{item.name}{active===item.id&&<span className="menu-dot"/>}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-label">あなたの都市</div><div className="city-identity"><div className="avatar">緑</div><div><b>{city.name}</b><small>市長として運営中</small></div></div><div className="side-footer">PHASE 0 · REBUILD 0.1</div></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div className="breadcrumb">CITY OVERVIEW <span>/</span> <strong>{active==='build'?'都市建設':active==='finance'?'財政と経済':active==='residents'?'住民と人口':'政策と行政'}</strong></div><div className="top-actions"><span className="autosave"><span className="save-dot"/>{saveLabel}</span><button className="top-button" onClick={manualSave}>保存</button><button className="top-button" onClick={()=>setHelp(true)} aria-label="ヘルプ">？</button></div></header>
      <div className="city-bar"><div><div className="eyebrow">MY CITY · JAPAN</div><div className="city-heading"><h1>{city.name}</h1><span className="level-tag">発展中の街</span></div><p>あなたの選択が、街の未来をつくる。</p></div><div className="time-control"><div className="date-label">▣ {monthText(city.month)}</div><div className="time-buttons"><button aria-label={city.paused?'再生':'一時停止'} onClick={toggle} className="play-button">{city.paused?'▶':'Ⅱ'}</button>{([1,2,4] as const).map(n=><button key={n} className={!city.paused&&city.speed===n?'chosen':''} onClick={()=>setSpeed(n)}>×{n}</button>)}</div></div></div>
      <div className="stat-strip"><div className="stat"><span>総人口</span><strong>{format(stats.population)} <small>人</small></strong><em>⌁ 街の住民</em></div><div className="stat"><span>市の資金</span><strong>{format(city.funds)} <small>C</small></strong><em>◈ 現在の予算</em></div><div className="stat"><span>月間収支</span><strong className={stats.balance>=0?'positive':'negative'}>{stats.balance>=0?'+':''}{format(stats.balance)} <small>C</small></strong><em>前月規模の見込み</em></div><div className="stat"><span>住民満足度</span><strong>{stats.happiness}<small> / 100</small></strong><div className="mini-progress"><i style={{width:`${stats.happiness}%`}}/></div></div></div>
      <div className="content-area">
        <div className="main-panel"><div className="map-heading"><div><strong>都市マップ</strong><span>建設・道路・地区を編集</span></div><div className="map-heading-right"><span className="map-status"><b/> {ready?'マップ稼働中':'読み込み中'}</span><span className="map-size">64 × 64</span></div></div><div className="map-host" ref={mapHost}><div className="map-hint">ドラッグで移動　•　ホイールで拡大縮小</div></div><div className="notice"><span>ⓘ</span><span role="status">{message}</span></div>
        {active==='build'&&<div className="build-panel"><div className="panel-title"><strong>建設・都市開発</strong><span>設置する施設を選択</span></div><div className="tool-grid">{palettes.map(p=><button key={p.tool} title={p.hint} aria-pressed={tool===p.tool} onClick={()=>setCurrentTool(p.tool)} className={`tool-tile ${tool===p.tool?'active':''}`}><span className="tool-glyph">{p.icon}</span><strong>{toolNames[p.tool]}</strong><small>{COSTS[p.tool]===0?'選択':`${format(COSTS[p.tool])} C`}</small></button>)}</div></div>}
        {active==='finance'&&<div className="data-panel"><div className="panel-title"><strong>財政と経済</strong><span>都市の収入・支出を確認</span></div><div className="metric-grid"><div><small>税収・企業収入</small><b className="positive">+{format(stats.income)} C / 月</b></div><div><small>維持・公共サービス費</small><b className="negative">−{format(stats.expenses)} C / 月</b></div><div><small>就業者数</small><b>{format(stats.employed)} 人</b></div><div><small>商業 / 工業</small><b>{stats.commerce} / {stats.industry} 棟</b></div></div><div className="control-row"><label htmlFor="tax">住民税率 <strong>{city.tax}%</strong></label><input id="tax" type="range" min="3" max="18" value={city.tax} onChange={e=>applyTax(Number(e.target.value))}/></div></div>}
        {active==='residents'&&<div className="data-panel"><div className="panel-title"><strong>住民と都市の成長</strong><span>人口の推移と雇用</span></div><Sparkline numbers={city.history.map(x=>x.population)}/><div className="metric-grid"><div><small>住宅建物</small><b>{stats.homes} 棟</b></div><div><small>雇用枠</small><b>{format(stats.jobs)} 人</b></div><div><small>就業者</small><b>{format(stats.employed)} 人</b></div><div><small>空き求人</small><b>{format(stats.vacancies)} 件</b></div></div></div>}
        {active==='policy'&&<div className="data-panel"><div className="panel-title"><strong>市政方針</strong><span>都市の経営方針を選択</span></div><div className="policy-grid">{([{id:'balanced',desc:'住民と経済をバランスよく成長'},{id:'growth',desc:'税収増を狙うが環境に負荷'},{id:'eco',desc:'住環境を優先し産業利益は減少'}] as {id:Policy;desc:string}[]).map(p=><button key={p.id} className={`policy-option ${city.policy===p.id?'current':''}`} onClick={()=>applyPolicy(p.id)}><b>{POLICY_LABELS[p.id]}</b><small>{p.desc}</small></button>)}</div></div>}
        </div>
        <aside className="inspector"><div className="inspector-header"><span className="inspector-label">CITY INSIGHTS</span><strong>都市の状況</strong></div><div className="inspector-body"><div className="info-highlight"><span className="tiny-label">選択中のエリア</span><strong>{selected?`区画 ${selected.x}, ${selected.y}`:'区画を選択'}</strong><p>{selectedDescription}</p></div><div className="inspector-section"><div className="section-title"><strong>都市の指標</strong><span>月次更新</span></div><div className="inspector-kpi"><span>住宅</span><b>{stats.homes}棟</b></div><div className="inspector-kpi"><span>商業</span><b>{stats.commerce}棟</b></div><div className="inspector-kpi"><span>工業</span><b>{stats.industry}棟</b></div><div className="inspector-kpi"><span>道路</span><b>{stats.roads}マス</b></div><div className="inspector-kpi"><span>公園</span><b>{stats.green}か所</b></div></div><div className="inspector-section"><div className="section-title"><strong>都市の成長</strong><span>直近120か月</span></div><Sparkline numbers={city.history.map(x=>x.population)}/></div><div className="tips"><span>💡 市長へのヒント</span><p>道路の隣に住宅・商業・工業地区を指定すると、時間の経過で建物が建設されます。</p></div></div>
        <div className="inspector-foot"><button onClick={()=>exportCity(city)}>都市データを書き出す ↗</button><button onClick={()=>importRef.current?.click()}>データを読み込む ↥</button><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e=>{void doImport(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/><button className="new-game" onClick={()=>{if(window.confirm('現在の都市を新規作成しますか？ 自動保存は上書きされます。')){const next=createCity();setCity(next);cityRef.current=next;setSelected(null);void saveCity(next);setMessage('新しい都市を作りました');}}}>新しい都市を始める</button></div></aside>
      </div>
    </section>
    {help&&<div className="modal-backdrop" role="presentation" onClick={()=>setHelp(false)}><div role="dialog" aria-modal="true" aria-label="操作ガイド" className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setHelp(false)}>✕</button><h2>街づくりガイド</h2><p>都市マップをクリックして、道路や地区、公共施設を配置できます。</p><ul><li>道路に面した土地だけ住宅・商業・工業の開発が可能です。</li><li>時間を再生すると建物と人口が増え、毎月の収支も反映されます。</li><li>Spaceキーで一時停止。ドラッグで移動、ホイールでズーム。</li><li>都市データはブラウザのIndexedDBに自動保存されます。端末を変える場合は書き出し機能を利用してください。</li></ul><button className="primary" onClick={()=>setHelp(false)}>街づくりを始める</button></div></div>}
  </main>;
}