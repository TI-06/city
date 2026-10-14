import {useCallback,useEffect,useRef,useState} from 'react';
import {applyStroke,advanceMonths,changePolicy,changeTax,createCity,describeTile,getStats,type City,type Policy,type Tool,COSTS,toolNames,POLICY_LABELS} from './core/city';
import {mountMap,type MapController} from './game/map';
import {canDragPaint,type InteractionMode,type TilePoint} from './core/paint';
import {exportCity,importCity,loadCity,loadLatestCity,saveCity} from './persistence/storage';

type Menu='build'|'finance'|'traffic'|'residents'|'policy';
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
  const [mode,setMode]=useState<InteractionMode>('pan');
  const undoRef=useRef<City|null>(null);
  const editedRef=useRef(false);
  const [canUndo,setCanUndo]=useState(false);
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
  const onTiles=useCallback((points:readonly TilePoint[])=>{
    const last=points[points.length-1];
    if(!last)return;
    const current=cityRef.current;
    selectedRef.current=last;setSelected(last);
    const result=applyStroke(current,toolRef.current,points);
    setMessage(result.message);
    if(result.changed){
      editedRef.current=true;undoRef.current=current;setCanUndo(true);
      cityRef.current=result.city;setCity(result.city);
      void saveCity(result.city).then(()=>setSaveLabel('自動保存済み')).catch(()=>setSaveLabel('保存エラー'));
    }
  },[]);
  const undo=useCallback(()=>{
    const previous=undoRef.current;
    if(!previous)return;
    undoRef.current=null;setCanUndo(false);
    cityRef.current=previous;setCity(previous);
    void saveCity(previous).then(()=>setSaveLabel('自動保存済み')).catch(()=>setSaveLabel('保存エラー'));
    setMessage('直前の建設・撤去を元に戻しました');
  },[]);
  useEffect(()=>{
    let disposed=false;
    const host=mapHost.current;
    if(!host)return;
    mountMap(host,cityRef.current,onTiles).then(controller=>{
      if(disposed){controller.destroy();return;}
      mapRef.current=controller;setReady(true);controller.setSelected(selectedRef.current,toolRef.current);controller.setMode(mode);
    }).catch(e=>{if(!disposed)setMessage(`描画を開始できませんでした：${String(e)}`);});
    return()=>{disposed=true;mapRef.current?.destroy();mapRef.current=null;};
  },[onTiles]);
  useEffect(()=>{mapRef.current?.setCity(city);},[city]);
  useEffect(()=>{mapRef.current?.setSelected(selected,tool);},[selected,tool]);
  useEffect(()=>{mapRef.current?.setMode(mode);},[mode]);
  useEffect(()=>{mapRef.current?.setTrafficView(active==='traffic');},[active,ready]);
  useEffect(()=>{let cancelled=false;void loadLatestCity().then(result=>{if(result&&!cancelled&&!editedRef.current){const fresh={...result.city,paused:true};cityRef.current=fresh;setCity(fresh);undoRef.current=null;setCanUndo(false);setMessage(result.recoveredFromBackup?'保存内容に問題があったため、バックアップから都市を復元しました':'前回の都市を復元しました');}}).catch(e=>{if(!cancelled){setSaveLabel('復元できません');setMessage(e instanceof Error?e.message:'保存データを復元できませんでした');}});return()=>{cancelled=true;};},[]);
  useEffect(()=>{
    if(city.paused)return;
    const timer=window.setInterval(()=>{const next=advanceMonths(cityRef.current,1);undoRef.current=null;setCanUndo(false);cityRef.current=next;setCity(next);if(next.month%2===0)void saveCity(next).then(()=>setSaveLabel('自動保存済み')).catch(()=>setSaveLabel('保存エラー'));},20000/city.speed);
    return()=>window.clearInterval(timer);
  },[city.paused,city.speed]);
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','BUTTON'].includes((e.target as HTMLElement).tagName)){e.preventDefault();setCity(c=>({...c,paused:!c.paused}));}if(e.code==='Escape'){setTool('inspect');setMode('pan');}if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'&&!['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)){e.preventDefault();undo();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[undo]);
  const toggle=()=>setCity(c=>({...c,paused:!c.paused}));
  const setSpeed=(speed:1|2|4)=>setCity(c=>({...c,speed,paused:false}));
  const applyPolicy=(p:Policy)=>{editedRef.current=true;const next=changePolicy(city,p);cityRef.current=next;setCity(next);void saveCity(next);setMessage(`${POLICY_LABELS[p]}の方針へ変更しました`);};
  const applyTax=(t:number)=>{editedRef.current=true;const next=changeTax(city,t);cityRef.current=next;setCity(next);void saveCity(next);};
  const setCurrentTool=(t:Tool)=>{setTool(t);setMode(canDragPaint(t)?'paint':'pan');setActive('build');setMessage(t==='inspect'?'調べたい建物や道路をクリックしてください':`${toolNames[t]}：土地をクリックして配置してください`);};
  const restoreBackup=async()=>{try{const saved=await loadCity('backup');if(!saved){setMessage('復元できるバックアップがありません');return;}if(!window.confirm('前回の自動保存から復元しますか？ 現在の未保存の変更は失われます。'))return;const next={...saved,paused:true};editedRef.current=true;cityRef.current=next;setCity(next);undoRef.current=null;setCanUndo(false);await saveCity(next);setMessage('バックアップから復元しました');}catch(e){setMessage(e instanceof Error?e.message:'バックアップを読み込めませんでした');}};
  const manualSave=()=>{void saveCity(cityRef.current,'manual').then(()=>{setSaveLabel('手動保存完了');setMessage('都市を保存しました');}).catch(()=>setMessage('保存に失敗しました'));};
  const doImport=async(f:File|undefined)=>{if(!f)return;try{const next=await importCity(f);next.paused=true;editedRef.current=true;cityRef.current=next;setCity(next);undoRef.current=null;setCanUndo(false);await saveCity(next);setMessage('都市のデータを読み込みました');}catch(e){setMessage(e instanceof Error?e.message:'読込エラー');}};
  const selectedDescription=selected?describeTile(city,selected.x,selected.y):'マップをクリックして土地を選択';
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark">C<span>•</span></div><div><strong>CITYSCAPE</strong><small>街づくりと都市経営</small></div></div>
      <div className="sidebar-section-label">CITY MANAGER</div>
      <nav aria-label="メインメニュー" className="menu">
        {([{id:'build',icon:'▦',name:'都市建設'},{id:'finance',icon:'▥',name:'財政と経済'},{id:'traffic',icon:'⇄',name:'交通・物流'},{id:'residents',icon:'♙',name:'住民と人口'},{id:'policy',icon:'⚑',name:'政策と行政'}] as const).map(item=><button key={item.id} className={`menu-link ${active===item.id?'active':''}`} onClick={()=>setActive(item.id)}><span className="menu-icon">{item.icon}</span>{item.name}{active===item.id&&<span className="menu-dot"/>}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-label">あなたの都市</div><div className="city-identity"><div className="avatar">緑</div><div><b>{city.name}</b><small>市長として運営中</small></div></div><div className="side-footer">PHASE 2 · TRAFFIC 0.3</div></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div className="breadcrumb">CITY OVERVIEW <span>/</span> <strong>{active==='build'?'都市建設':active==='finance'?'財政と経済':active==='traffic'?'交通・物流':active==='residents'?'住民と人口':'政策と行政'}</strong></div><div className="top-actions"><span className="autosave"><span className="save-dot"/>{saveLabel}</span><button className="top-button" onClick={manualSave}>保存</button><button className="top-button" onClick={()=>setHelp(true)} aria-label="ヘルプ">？</button></div></header>
      <div className="city-bar"><div><div className="eyebrow">MY CITY · JAPAN</div><div className="city-heading"><h1>{city.name}</h1><span className="level-tag">発展中の街</span></div><p>あなたの選択が、街の未来をつくる。</p></div><div className="time-control"><div className="date-label">▣ {monthText(city.month)}</div><div className="time-buttons"><button aria-label={city.paused?'再生':'一時停止'} onClick={toggle} className="play-button">{city.paused?'▶':'Ⅱ'}</button>{([1,2,4] as const).map(n=><button key={n} className={!city.paused&&city.speed===n?'chosen':''} onClick={()=>setSpeed(n)}>×{n}</button>)}</div></div></div>
      <div className="stat-strip"><div className="stat"><span>総人口</span><strong>{format(stats.population)} <small>人</small></strong><em>⌁ 街の住民</em></div><div className="stat"><span>市の資金</span><strong>{format(city.funds)} <small>C</small></strong><em>◈ 現在の予算</em></div><div className="stat"><span>月間収支</span><strong className={stats.balance>=0?'positive':'negative'}>{stats.balance>=0?'+':''}{format(stats.balance)} <small>C</small></strong><em>前月規模の見込み</em></div><div className="stat"><span>住民満足度</span><strong>{stats.happiness}<small> / 100</small></strong><div className="mini-progress"><i style={{width:`${stats.happiness}%`}}/></div></div></div>
      <div className="content-area">
        <div className="main-panel"><div className="map-heading"><div><strong>都市マップ</strong><span>建設・道路・地区を編集</span></div><div className="map-heading-right"><span className="map-status"><b/> {ready?'マップ稼働中':'読み込み中'}</span><span className="map-size">64 × 64</span></div></div><div className="map-host" ref={mapHost}>
          <div className="map-floating-toolbar" aria-label="マップ操作">
            <div className="view-modes" role="group" aria-label="操作モード">
              <button aria-pressed={mode==='pan'} className={mode==='pan'?'is-active':''} onClick={()=>setMode('pan')}>✥ 移動</button>
              <button aria-pressed={mode==='paint'} disabled={!canDragPaint(tool)} className={mode==='paint'?'is-active':''} onClick={()=>setMode('paint')}>✎ 描く</button>
            </div>
            <div className="zoom-controls" role="group" aria-label="拡大縮小">
              <button aria-label="拡大" onClick={()=>mapRef.current?.zoomBy(1.2)}>＋</button>
              <button aria-label="縮小" onClick={()=>mapRef.current?.zoomBy(1/1.2)}>－</button>
              <button aria-label="マップを中央に戻す" onClick={()=>mapRef.current?.resetView()}>⌂</button>
            </div>
          </div>
          {active==='traffic'&&<div className="traffic-legend" aria-label="推定交通量の凡例"><strong>交通負荷</strong><span><i className="traffic-low"/>余裕</span><span><i className="traffic-medium"/>注意</span><span><i className="traffic-high"/>混雑</span></div>}
           <div className="map-hint">{mode==='paint'&&canDragPaint(tool)?`${toolNames[tool]}：ドラッグでまとめて配置 ／ 移動は「移動」ボタン`:'ドラッグで移動 ／ クリックして選択 ／ ホイールで拡大縮小'}</div>
        </div><div className="notice"><span>ⓘ</span><span role="status">{message}</span></div>
        {active==='build'&&<div className="build-panel"><div className="panel-title"><strong>建設・都市開発</strong><span>設置する施設を選択</span><button className="undo-button" onClick={undo} disabled={!canUndo} title="Ctrl+Z / ⌘Z">↶ 元に戻す</button></div><div className="tool-grid">{palettes.map(p=><button key={p.tool} title={p.hint} aria-pressed={tool===p.tool} onClick={()=>setCurrentTool(p.tool)} className={`tool-tile ${tool===p.tool?'active':''}`}><span className="tool-glyph">{p.icon}</span><strong>{toolNames[p.tool]}</strong><small>{COSTS[p.tool]===0?'選択':`${format(COSTS[p.tool])} C`}</small></button>)}</div></div>}
        {active==='traffic'&&<div className="data-panel traffic-panel">
          <div className="panel-title"><strong>交通分析</strong><span>道路の接続・通勤・物流の推定値</span></div>
          <div className="metric-grid">
            <div><small>推定混雑度</small><b>{stats.congestion}%</b></div>
            <div><small>混雑している道路</small><b>{format(stats.congestedRoads)} マス</b></div>
            <div><small>平均通勤距離</small><b>{stats.averageCommute.toFixed(1)} 区画</b></div>
            <div><small>交通による企業生産効率</small><b>{Math.round(stats.trafficProductivity*100)}%</b></div>
            <div><small>道路ネットワーク</small><b>{format(stats.roadComponents)} 系統</b></div>
            <div><small>通勤先がない・道路未接続の住民</small><b>{format(stats.disconnectedResidents)} 人</b></div>
          </div>
          <div className="traffic-meter-label"><span>都市の交通混雑</span><b>{stats.congestion}%</b></div>
          <div className="traffic-progress" role="meter" aria-label="推定混雑度" aria-valuenow={stats.congestion} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${stats.congestion}%`}}/></div>
          <div className="traffic-advice">{stats.employed===0?'就業者がいません。住宅と職場を道路でつなぎ、雇用を増やしましょう。':stats.congestion>45?'交通が集中しています。職場と住宅を分散させ、別の道路ネットワークで混雑を軽減しましょう。':stats.congestion>20?'交通に負荷がかかっています。マップ上の橙・赤色の道路を確認しましょう。':'通勤路の混雑は小さい状態です。新しい開発地区と職場の接続を確認しましょう。'}</div>
          <p className="traffic-note">混雑は1マスの道路容量85を基準にした簡易推計です。車両の個別走行や交差点制御はまだ導入していません。</p>
        </div>}
        {active==='finance'&&<div className="data-panel"><div className="panel-title"><strong>財政と経済</strong><span>都市の収入・支出を確認</span></div><div className="metric-grid"><div><small>税収・企業収入</small><b className="positive">+{format(stats.income)} C / 月</b></div><div><small>維持・公共サービス費</small><b className="negative">−{format(stats.expenses)} C / 月</b></div><div><small>就業者数</small><b>{format(stats.employed)} 人</b></div><div><small>商業 / 工業</small><b>{stats.commerce} / {stats.industry} 棟</b></div></div><div className="control-row"><label htmlFor="tax">住民税率 <strong>{city.tax}%</strong></label><input id="tax" type="range" min="3" max="18" value={city.tax} onChange={e=>applyTax(Number(e.target.value))}/></div></div>}
        {active==='residents'&&<div className="data-panel"><div className="panel-title"><strong>住民と都市の成長</strong><span>人口の推移と雇用</span></div><Sparkline numbers={city.history.map(x=>x.population)}/><div className="metric-grid"><div><small>住宅建物</small><b>{stats.homes} 棟</b></div><div><small>雇用枠</small><b>{format(stats.jobs)} 人</b></div><div><small>就業者</small><b>{format(stats.employed)} 人</b></div><div><small>空き求人</small><b>{format(stats.vacancies)} 件</b></div></div></div>}
        {active==='policy'&&<div className="data-panel"><div className="panel-title"><strong>市政方針</strong><span>都市の経営方針を選択</span></div><div className="policy-grid">{([{id:'balanced',desc:'住民と経済をバランスよく成長'},{id:'growth',desc:'税収増を狙うが環境に負荷'},{id:'eco',desc:'住環境を優先し産業利益は減少'}] as {id:Policy;desc:string}[]).map(p=><button key={p.id} className={`policy-option ${city.policy===p.id?'current':''}`} onClick={()=>applyPolicy(p.id)}><b>{POLICY_LABELS[p.id]}</b><small>{p.desc}</small></button>)}</div></div>}
        </div>
        <aside className="inspector"><div className="inspector-header"><span className="inspector-label">CITY INSIGHTS</span><strong>都市の状況</strong></div><div className="inspector-body"><div className="info-highlight"><span className="tiny-label">選択中のエリア</span><strong>{selected?`区画 ${selected.x}, ${selected.y}`:'区画を選択'}</strong><p>{selectedDescription}</p></div><div className="inspector-section"><div className="section-title"><strong>都市の指標</strong><span>月次更新</span></div><div className="inspector-kpi"><span>住宅</span><b>{stats.homes}棟</b></div><div className="inspector-kpi"><span>商業</span><b>{stats.commerce}棟</b></div><div className="inspector-kpi"><span>工業</span><b>{stats.industry}棟</b></div><div className="inspector-kpi"><span>道路</span><b>{stats.roads}マス</b></div><div className="inspector-kpi"><span>推定混雑度</span><b>{stats.congestion}%</b></div><div className="inspector-kpi"><span>公園</span><b>{stats.green}か所</b></div></div><div className="inspector-section"><div className="section-title"><strong>都市の成長</strong><span>直近120か月</span></div><Sparkline numbers={city.history.map(x=>x.population)}/></div><div className="tips"><span>💡 市長へのヒント</span><p>道路の隣に住宅・商業・工業地区を指定すると、時間の経過で建物が建設されます。</p></div></div>
        <div className="inspector-foot"><button onClick={()=>exportCity(city)}>都市データを書き出す ↗</button><button onClick={()=>importRef.current?.click()}>データを読み込む ↥</button><button onClick={()=>{void restoreBackup();}}>前回のバックアップを復元 ↶</button><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e=>{void doImport(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/><button className="new-game" onClick={()=>{if(window.confirm('現在の都市を新規作成しますか？ 自動保存は上書きされます。')){const next=createCity();editedRef.current=true;setCity(next);cityRef.current=next;setSelected(null);undoRef.current=null;setCanUndo(false);setMode('pan');setTool('inspect');void saveCity(next);setMessage('新しい都市を作りました');}}}>新しい都市を始める</button></div></aside>
      </div>
    </section>
    {help&&<div className="modal-backdrop" role="presentation" onClick={()=>setHelp(false)}><div role="dialog" aria-modal="true" aria-label="操作ガイド" className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setHelp(false)}>✕</button><h2>街づくりガイド</h2><p>都市マップをクリックして、道路や地区、公共施設を配置できます。</p><ul><li>道路に面した土地だけ住宅・商業・工業の開発が可能です。</li><li>時間を再生すると建物と人口が増え、毎月の収支も反映されます。</li><li>道路・地区・撤去は「描く」モードでドラッグすると連続操作できます。</li><li>「交通・物流」では道路ごとの推定交通量を色分けして確認できます。</li><li>「移動」モードで地図をドラッグして移動できます。拡大・縮小・中央に戻すボタンも利用可能です。</li><li>Spaceキーで一時停止。Ctrl+Zまたは⌘Zで直前の建設を元に戻せます。</li><li>保存に問題があれば、自動的に前回のバックアップを確認します。</li><li>都市データはブラウザのIndexedDBに自動保存されます。端末を変える場合は書き出し機能を利用してください。</li></ul><button className="primary" onClick={()=>setHelp(false)}>街づくりを始める</button></div></div>}
  </main>;
}