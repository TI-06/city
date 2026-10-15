import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {analyzeLand} from './core/land';
import {MAINTENANCE_LABELS,type MaintenancePlan} from './core/lifecycle';
import {BOND_AMOUNT,type FiscalMode} from './core/fiscal';
import {CAPITAL_LABELS,CAPITAL_NOTES,capitalLevel,capitalNextCost,type CapitalKind} from './core/capital';
import {applyStroke,advanceMonths,changePolicy,changeTax,changeMaintenancePlan,fundCapitalProject,changeFiscalMode,issueMunicipalBond,createCity,describeTile,getStats,getDevelopmentOutlook,type City,type Policy,type Tool,COSTS,toolNames,POLICY_LABELS,tileIndex} from './core/city';
import {mountMap,type MapController} from './game/map';
import {visualMood} from './game/visual-state';
import {citySkyline} from './game/building-style';
import {buildingStyleLabel,getCityMoment,type CityMoment} from './game/city-moments';
import {canDragPaint,type InteractionMode,type TilePoint} from './core/paint';
import {exportCity,importCity,loadCity,loadLatestCity,saveCity} from './persistence/storage';

type Menu='build'|'finance'|'traffic'|'residents'|'policy';
type BuildGroup='zones'|'roads'|'services'|'manage';
const buildGroups:readonly {id:BuildGroup;label:string;glyph:string}[]=[
  {id:'zones',label:'地区',glyph:'⌂'},
  {id:'roads',label:'道路',glyph:'═'},
  {id:'services',label:'公共施設',glyph:'♣'},
  {id:'manage',label:'調査・撤去',glyph:'⌖'},
];
const categoryOfTool=(tool:Tool):BuildGroup=>
  tool==='home'||tool==='shop'||tool==='industry'?'zones'
  :tool==='road'||tool==='arterial'?'roads'
  :tool==='park'||tool==='school'||tool==='clinic'?'services':'manage';
const palettes: {tool:Tool; icon:string; hint:string}[] = [
  {tool:'inspect',icon:'⌖',hint:'土地を調べる'},
  {tool:'road',icon:'═',hint:'道路を建設'},
  {tool:'arterial',icon:'≡',hint:'一般道路を幹線道路へ改良（容量85→220、維持費増）'},
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
  const [mobileBuildGroup,setMobileBuildGroup]=useState<BuildGroup>('zones');
  const [mobileToolsOpen,setMobileToolsOpen]=useState(()=>!window.matchMedia('(max-width:700px)').matches);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [mapQuickOpen,setMapQuickOpen]=useState(false);
  const [operationsOpen,setOperationsOpen]=useState(false);
  const [operationsTab,setOperationsTab]=useState<'policy'|'tax'|'invest'|'budget'|'roads'>('policy');
  const [mapQuickGroup,setMapQuickGroup]=useState<BuildGroup>('zones');
  const [selected,setSelected]=useState<{x:number;y:number}|null>(null);
  const selectedRef=useRef<{x:number;y:number}|null>(null);selectedRef.current=selected;
  const [message,setMessage]=useState('道路を敷いたり、住宅地区を指定して街を育てましょう。');
  const [saveLabel,setSaveLabel]=useState('ローカル保存');
  const [ready,setReady]=useState(false);
  const [motion,setMotion]=useState(()=>!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [help,setHelp]=useState(false);
  const [cityMoment,setCityMoment]=useState<CityMoment|null>(null);
  const mapHost=useRef<HTMLDivElement>(null);const mapRef=useRef<MapController|null>(null);
  const importRef=useRef<HTMLInputElement>(null);
  const stats=getStats(city);
  const visualStatus=visualMood(city);
  const visualLabel=visualStatus==='crisis'?'財政危機':visualStatus==='repairs'?'修繕の遅れ':visualStatus==='developing'?'都市発展中':'安定した街';
  const land=useMemo(()=>analyzeLand(city),[city]);
  const skyline=citySkyline(city);
  const development=getDevelopmentOutlook(city,stats);
  const waiting=development.pending.home+development.pending.shop+development.pending.industry;
  const activeSites=city.construction??[];
  const nextCompletion=activeSites.length?Math.min(...activeSites.map(s=>s.startMonth+s.duration-city.month)):null;
  const focusSite=activeSites.length?
    [...activeSites].sort((a,b)=>(a.startMonth+a.duration)-(b.startMonth+b.duration)||a.id-b.id)[0]:null;
  const viewConstruction=()=>{if(!focusSite)return;setMapQuickOpen(false);mapRef.current?.focusTile(focusSite.x,focusSite.y);
    setMessage(`工事現場に移動しました（完成まであと${Math.max(0,focusSite.startMonth+focusSite.duration-city.month)}か月）`);
  };
  const readyToBuild=development.ready.home+development.ready.shop+development.ready.industry;
  const developmentHint=development.pausedByHappiness?'住民満足度が40未満のため、民間開発が止まっています。税率や公共サービスを見直しましょう。'
    :waiting===0?(activeSites.length>0?`工事中の建物が${activeSites.length}件あります。あと${nextCompletion}か月で次の建物が完成します。`:development.disconnected>0?'道路から切り離された開発地区があります。道路をつなぎ直してください。':'開発待ちの地区がありません。道路沿いの空き地に住宅・商業・工業地区を指定しましょう。')
    :readyToBuild===0?[
      development.pending.home>0&&development.ready.home===0?'住宅：空室が多いため新築を見合わせています。先に入居と雇用を増やしましょう。':null,
      development.pending.shop+development.pending.industry>0&&development.ready.shop+development.ready.industry===0?'商業・工業：求人の空きが多く、新規建築を見合わせています。住宅や人口を増やしましょう。':null,
    ].filter(Boolean).join(' ')
    :city.paused?'開発可能な地区があります。下の「翌月へ進める」で建物の建設を確認できます。'
    :'開発可能な地区があります。毎月、需要と立地評価に応じて建物が建ちます。';
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
  useEffect(()=>{mapRef.current?.setMotion(motion);},[motion,ready]);
  useEffect(()=>{mapRef.current?.setTrafficView(active==='traffic');mapRef.current?.setLandView(active==='residents');},[active,ready]);
  useEffect(()=>{let cancelled=false;void loadLatestCity().then(result=>{if(result&&!cancelled&&!editedRef.current){const fresh={...result.city,paused:true};cityRef.current=fresh;setCity(fresh);undoRef.current=null;setCanUndo(false);setMessage(result.recoveredFromBackup?'保存内容に問題があったため、バックアップから都市を復元しました':'前回の都市を復元しました');}}).catch(e=>{if(!cancelled){setSaveLabel('復元できません');setMessage(e instanceof Error?e.message:'保存データを復元できませんでした');}});return()=>{cancelled=true;};},[]);
  const progressMonth=useCallback((manual=false)=>{
    const previous=cityRef.current;
    const next=advanceMonths(previous,1);
    const oldBuildings=new Set(previous.buildings.map(b=>b.id));
    const previousSites=new Set((previous.construction??[]).map(site=>`${site.id}:${site.startMonth}`));
    const started=(next.construction??[]).filter(site=>!previousSites.has(`${site.id}:${site.startMonth}`));
    const completed=(previous.construction??[]).filter(site=>!(next.construction??[]).some(work=>work.id===site.id));
    const erected=next.buildings.filter(b=>!oldBuildings.has(b.id));
    const counts={
      home:erected.filter(b=>b.kind===1).length,
      shop:erected.filter(b=>b.kind===2).length,
      industry:erected.filter(b=>b.kind===3).length,
    };
    const populationDelta=getStats(next).population-getStats(previous).population;
    setCityMoment(getCityMoment(previous,next));
    const detail=[started.length&&`着工 ${started.length}件`,completed.length&&`完成 ${completed.length}件`,erected.length&&`新築 ${erected.length}棟`].filter(Boolean).join(' ／ ')||'新たな着工なし（需要を確認してください）';
    setMessage(`${monthText(next.month)}：${detail} ／ 人口 ${populationDelta>0?'+':''}${populationDelta}人`);
    editedRef.current=true;
    undoRef.current=null;setCanUndo(false);
    cityRef.current=next;setCity(next);
    if(manual||next.month%2===0)void saveCity(next).then(()=>setSaveLabel('自動保存済み')).catch(()=>setSaveLabel('保存エラー'));
  },[]);
  useEffect(()=>{
    if(city.paused)return;
    const timer=window.setInterval(()=>progressMonth(),20000/city.speed);
    return()=>window.clearInterval(timer);
  },[city.paused,city.speed,progressMonth]);
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','BUTTON'].includes((e.target as HTMLElement).tagName)){e.preventDefault();setCity(c=>({...c,paused:!c.paused}));}if(e.code==='Escape'){setTool('inspect');setMode('pan');}if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'&&!['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)){e.preventDefault();undo();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[undo]);
  const toggle=()=>setCity(c=>({...c,paused:!c.paused}));
  const setSpeed=(speed:1|2|4)=>setCity(c=>({...c,speed,paused:false}));
  const applyPolicy=(p:Policy)=>{editedRef.current=true;const next=changePolicy(city,p);cityRef.current=next;setCity(next);void saveCity(next);setMessage(`${POLICY_LABELS[p]}の方針へ変更しました`);};
  const applyTax=(t:number)=>{editedRef.current=true;const next=changeTax(city,t);cityRef.current=next;setCity(next);void saveCity(next);};
  const applyMaintenance=(plan:MaintenancePlan)=>{editedRef.current=true;const next=changeMaintenancePlan(cityRef.current,plan);cityRef.current=next;setCity(next);void saveCity(next).catch(()=>setSaveLabel('保存エラー'));setMessage(`${MAINTENANCE_LABELS[plan]}に変更しました`);};
  const invest=(kind:CapitalKind)=>{
    const current=cityRef.current;
    const price=capitalNextCost(current,kind);
    if(price===undefined||current.funds<price)return;
    if(!window.confirm(`${CAPITAL_LABELS[kind]}に${format(price)} Cを投資しますか？ 月々の運営費も増加します。`))return;
    const result=fundCapitalProject(current,kind);
    setMessage(result.message);
    if(result.changed){
      editedRef.current=true;undoRef.current=null;setCanUndo(false);
      cityRef.current=result.city;setCity(result.city);
      void saveCity(result.city).catch(()=>setSaveLabel('保存エラー'));
    }
  };
  const setFiscalMode=(mode:FiscalMode)=>{
    const next=changeFiscalMode(cityRef.current,mode);
    if(next===cityRef.current)return;
    editedRef.current=true;cityRef.current=next;setCity(next);
    void saveCity(next).catch(()=>setSaveLabel('保存エラー'));
    setMessage(mode==='austerity'?'行政の支出を抑えました。住民満足度に影響します':'行政サービスを通常水準に戻しました');
  };
  const borrow=()=>{
    const current=cityRef.current;
    if(!window.confirm('市債で25,000 Cを調達しますか？ 毎月の元金返済と利息が発生します。'))return;
    const result=issueMunicipalBond(current);
    setMessage(result.message);
    if(result.changed){
      editedRef.current=true;cityRef.current=result.city;setCity(result.city);
      undoRef.current=null;setCanUndo(false);
      void saveCity(result.city).catch(()=>setSaveLabel('保存エラー'));
    }
  };
  const setCurrentTool=(t:Tool,source:'dock'|'map'='dock')=>{
    setMapQuickGroup(categoryOfTool(t));setMobileBuildGroup(categoryOfTool(t));
    if(source==='map'){
      // Selecting a map tool returns immediately to the city; on phones the
      // legacy dock stays collapsed to avoid covering half the viewport.
      if(window.matchMedia('(max-width:700px)').matches){
        setMobileToolsOpen(false);setMapQuickOpen(false);
      }
    }else{setMobileToolsOpen(true);}
    setTool(t);setMode(canDragPaint(t)?'paint':'pan');setActive('build');
    setMessage(t==='inspect'?'調べたい建物や道路をクリックしてください':`${toolNames[t]}：地図をタップ・ドラッグして配置してください`);
  };
  const restoreBackup=async()=>{try{const saved=await loadCity('backup');if(!saved){setMessage('復元できるバックアップがありません');return;}if(!window.confirm('前回の自動保存から復元しますか？ 現在の未保存の変更は失われます。'))return;const next={...saved,paused:true};editedRef.current=true;cityRef.current=next;setCity(next);undoRef.current=null;setCanUndo(false);await saveCity(next);setMessage('バックアップから復元しました');}catch(e){setMessage(e instanceof Error?e.message:'バックアップを読み込めませんでした');}};
  const manualSave=()=>{void saveCity(cityRef.current,'manual').then(()=>{setSaveLabel('手動保存完了');setMessage('都市を保存しました');}).catch(()=>setMessage('保存に失敗しました'));};
  const doImport=async(f:File|undefined)=>{if(!f)return;try{const next=await importCity(f);next.paused=true;editedRef.current=true;cityRef.current=next;setCity(next);undoRef.current=null;setCanUndo(false);await saveCity(next);setMessage('都市のデータを読み込みました');}catch(e){setMessage(e instanceof Error?e.message:'読込エラー');}};
  const startNewCity=()=>{
    if(!window.confirm('新しい都市を始めますか？ 現在の自動保存は上書きされます。先に都市データを書き出すことをおすすめします。'))return;
    const next=createCity();editedRef.current=true;setCity(next);cityRef.current=next;
    setSelected(null);undoRef.current=null;setCanUndo(false);setMode('pan');setTool('inspect');
    setMobileBuildGroup('zones');setMobileMenuOpen(false);
    void saveCity(next);setMessage('新しい都市を作りました');
  };
  const switchMenu=(menu:Menu)=>{
    setMobileMenuOpen(false);setMapQuickOpen(false);setOperationsOpen(false);setActive(menu);
    if(menu==='build'){setMode(canDragPaint(tool)?'paint':'pan');}
    else setMode('pan');
  };
  const openMapQuick=()=>{
    if(!mapQuickOpen){setOperationsOpen(false);if(window.matchMedia('(max-width:700px)').matches)setMobileToolsOpen(false);}
    setMapQuickOpen(prev=>!prev);
  };
  const selectedStyle=selected?buildingStyleLabel(city,selected.x,selected.y):null;
  const selectedDescription=selected?`${selectedStyle?`${selectedStyle} ／ `:''}${describeTile(city,selected.x,selected.y)}`:'マップをクリックして土地を選択';
  const selectedLandScore=selected?land.values[tileIndex(selected.x,selected.y)]:undefined;
  return <main className="app-shell" data-active-menu={active} data-tools-open={mobileToolsOpen?'yes':'no'} data-map-quick-open={mapQuickOpen?'yes':'no'} data-operations-open={operationsOpen?'yes':'no'}>
    <aside className="sidebar">
      <div className="brand"><div className="brandmark">C<span>•</span></div><div><strong>CITYSCAPE</strong><small>街づくりと都市経営</small></div></div>
      <div className="sidebar-section-label">CITY MANAGER</div>
      <nav aria-label="メインメニュー" className="menu">
        <button className={`menu-link ${active==='build'?'active':''}`} onClick={()=>switchMenu('build')} aria-current={active==='build'?'page':undefined}><span className="menu-icon">▦</span>街を運営</button>
        <button className={`menu-link ${active!=='build'?'active':''}`} aria-label="都市データ" onClick={()=>switchMenu('finance')} aria-current={active!=='build'?'page':undefined}><span className="menu-icon">▤</span>都市データ</button>
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-label">あなたの都市</div><div className="city-identity"><div className="avatar">緑</div><div><b>{city.name}</b><small>市長として運営中</small></div></div><div className="side-footer">PHASE 4 · CITY GROWTH 0.8</div></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div className="breadcrumb">CITY OVERVIEW <span>/</span> <strong>{active==='build'?'都市建設':active==='finance'?'財政と経済':active==='traffic'?'交通・物流':active==='residents'?'住民と人口':'政策と行政'}</strong></div><div className="top-actions"><span className="autosave"><span className="save-dot"/>{saveLabel}</span><button className="top-button" onClick={manualSave}>保存</button><button className="top-button" onClick={()=>setHelp(true)} aria-label="ヘルプ">？</button><button className="top-button mobile-menu-button" aria-label="都市データ管理" aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(value=>!value)}>☰</button></div></header>
      {mobileMenuOpen&&<div className="mobile-utilities" role="dialog" aria-label="都市データ管理">
        <div className="mobile-utilities-head"><strong>都市データ管理</strong><button onClick={()=>setMobileMenuOpen(false)} aria-label="閉じる">✕</button></div>
        <button onClick={()=>{exportCity(city);setMobileMenuOpen(false);}}>都市データを書き出す</button>
        <button onClick={()=>{importRef.current?.click();setMobileMenuOpen(false);}}>都市データを読み込む</button>
        <button onClick={()=>{void restoreBackup();setMobileMenuOpen(false);}}>バックアップから復元</button>
        <button onClick={startNewCity}>新しい都市を始める</button>
      </div>}
      {active!=='build'&&<nav className="data-subnav" aria-label="都市データの切替">
        {([{id:'finance',icon:'▥',name:'財政と経済'},{id:'traffic',icon:'⇄',name:'交通・物流'},{id:'residents',icon:'♙',name:'住民と人口'},{id:'policy',icon:'⚑',name:'政策と行政'}] as const).map(item=>
          <button key={item.id} className={active===item.id?'selected':''} aria-current={active===item.id?'page':undefined}
            onClick={()=>switchMenu(item.id)}><span>{item.icon}</span>{item.name}</button>)}
      </nav>}
      <div className="city-bar"><div><div className="eyebrow">MY CITY · JAPAN</div><div className="city-heading"><h1>{city.name}</h1><span className="level-tag">発展中の街</span></div><p>あなたの選択が、街の未来をつくる。</p></div><div className="time-control"><div className="date-label">▣ {monthText(city.month)}</div><div className="time-buttons"><button aria-label={city.paused?'再生':'一時停止'} onClick={toggle} className="play-button">{city.paused?'▶':'Ⅱ'}</button>{([1,2,4] as const).map(n=><button key={n} className={!city.paused&&city.speed===n?'chosen':''} onClick={()=>setSpeed(n)}>×{n}</button>)}<button type="button" className="next-month-button" aria-label="翌月へ進める" onClick={()=>progressMonth(true)}>翌月へ ▶|</button></div></div></div>
      <div className="stat-strip"><div className="stat"><span>総人口</span><strong>{format(stats.population)} <small>人</small></strong><em>⌁ 街の住民</em></div><div className="stat"><span>市の資金</span><strong>{format(city.funds)} <small>C</small></strong><em>◈ 現在の予算</em></div><div className="stat"><span>月間収支</span><strong className={stats.balance>=0?'positive':'negative'}>{stats.balance>=0?'+':''}{format(stats.balance)} <small>C</small></strong><em>前月規模の見込み</em></div><div className="stat"><span>住民満足度</span><strong>{stats.happiness}<small> / 100</small></strong><div className="mini-progress"><i style={{width:`${stats.happiness}%`}}/></div></div></div>
      <div className="content-area">
        <div className="main-panel"><div className="map-heading"><div><strong>都市マップ</strong><span>建設・道路・地区を編集</span></div><div className="map-heading-right"><span className="map-status"><b/> {ready?'マップ稼働中':'読み込み中'}</span><span className={`map-civic-indicator mood-${visualStatus}`} aria-label={`街の状態：${visualLabel}`} role="status">{visualStatus==='crisis'?'⚠':visualStatus==='repairs'?'◆':'✦'} {visualLabel}</span><span className="map-size">64 × 64</span></div></div><div className="map-host" ref={mapHost}>
          <div className="map-floating-toolbar" aria-label="マップ操作">
            <div className="view-modes" role="group" aria-label="操作モード">
              <button aria-pressed={mode==='pan'} className={mode==='pan'?'is-active':''} onClick={()=>setMode('pan')}>✥ 移動</button>
              <button aria-pressed={mode==='paint'} disabled={!canDragPaint(tool)} className={mode==='paint'?'is-active':''} onClick={()=>setMode('paint')}>✎ 描く</button>
            </div>
            <div className="zoom-controls" role="group" aria-label="拡大縮小">
              <button aria-label="拡大" onClick={()=>mapRef.current?.zoomBy(1.2)}>＋</button>
              <button aria-label="縮小" onClick={()=>mapRef.current?.zoomBy(1/1.2)}>－</button>
              <button aria-label="マップを中央に戻す" onClick={()=>mapRef.current?.resetView()}>⌂</button>
              <button className="motion-toggle" aria-pressed={motion} aria-label={motion?'演出を停止':'演出を再開'} title="街のアニメーション" onClick={()=>setMotion(value=>!value)}>{motion?'✦':'◌'}</button>
            </div>
          </div>
          {active==='build'&&<div className={`map-quick-menu ${mapQuickOpen?'is-open':''}`} aria-label="地図上の建設メニュー">
            <button type="button" className="map-quick-trigger" aria-label={mapQuickOpen?'地図の建設メニューを閉じる':'地図の建設メニューを開く'} aria-expanded={mapQuickOpen} onClick={openMapQuick}>
              <span>▦</span><strong>{mapQuickOpen?'建設を選択':tool==='inspect'?'建設':toolNames[tool]}</strong><b>{mapQuickOpen?'⌄':'⌃'}</b>
            </button>
            {mapQuickOpen&&<div className="map-quick-body">
              <div className="map-quick-categories" role="group" aria-label="地図建設カテゴリ">
                {buildGroups.map(group=><button key={group.id} type="button" aria-pressed={mapQuickGroup===group.id} className={mapQuickGroup===group.id?'selected':''}
                  onClick={()=>setMapQuickGroup(group.id)}><span>{group.glyph}</span>{group.label}</button>)}
              </div>
              <div className="map-quick-tools" role="group" aria-label="地図建設コマンド">
                {palettes.filter(p=>categoryOfTool(p.tool)===mapQuickGroup).map(p=>
                  <button key={p.tool} type="button" aria-label={`地図で${toolNames[p.tool]}を選択`} title={p.hint} aria-pressed={tool===p.tool} className={tool===p.tool?'chosen':''}
                    onClick={()=>setCurrentTool(p.tool,'map')}><span>{p.icon}</span><strong>{toolNames[p.tool]}</strong></button>)}
              </div>
              <div className="map-quick-footer"><span>{toolNames[tool]} · {mode==='paint'?'指で描く':'地図を移動'}</span>
                <button type="button" onClick={()=>setMode(mode==='paint'?'pan':'paint')} disabled={!canDragPaint(tool)}>{mode==='paint'?'✥ 移動':'✎ 描く'}</button><button type="button" className="map-quick-undo" onClick={undo} disabled={!canUndo} aria-label="直前の建設を元に戻す">↶ 戻す</button>
                <button type="button" className="map-quick-step" onClick={()=>progressMonth(true)}>翌月へ ›</button>
              </div>
            </div>}
          </div>}
          {active==='build'&&<div className={`map-operations ${operationsOpen?'is-open':''}`}>
            <button type="button" className="map-operations-launcher" aria-label={operationsOpen?'都市運営メニューを閉じる':'都市運営メニューを開く'}
              aria-expanded={operationsOpen} onClick={()=>{setMapQuickOpen(false);setOperationsOpen(v=>!v);}}><span>⚑</span><span className="operations-full-label">都市運営</span><span className="operations-short-label">市政</span><b>{operationsOpen?'⌄':'⌃'}</b></button>
            {operationsOpen&&<div className="map-operations-body">
              <div className="map-operations-summary"><b>市の収支 {shortMoney(stats.balance)}/月</b><span>満足度 {stats.happiness} / 100</span></div>
              <div className="map-operations-tabs" role="group" aria-label="都市運営コマンド">
                {([{id:'policy',label:'市政'},{id:'tax',label:'税率'},{id:'invest',label:'投資'},{id:'budget',label:'予算'},{id:'roads',label:'交通'}] as const).map(item=><button key={item.id}
                  className={operationsTab===item.id?'selected':''} aria-pressed={operationsTab===item.id} onClick={()=>setOperationsTab(item.id)}>{item.label}</button>)}
              </div>
              {operationsTab==='policy'&&<div className="map-policy-options" role="group" aria-label="地図上の市政方針">
                {(['balanced','growth','eco','mobility'] as const).map(p=><button key={p} className={city.policy===p?'selected':''}
                  aria-pressed={city.policy===p} onClick={()=>applyPolicy(p)}>{POLICY_LABELS[p]}</button>)}
              </div>}
              {operationsTab==='tax'&&<div className="map-operations-tax"><label htmlFor="quick-tax">住民税率 <strong>{city.tax}%</strong></label>
                <input id="quick-tax" type="range" min="3" max="18" value={city.tax} onChange={e=>applyTax(Number(e.target.value))}/>
                <span>減税は住民満足度を改善しますが、税収も減少します。</span></div>}
              {operationsTab==='invest'&&<div className="map-invest-options">
                {(['transit','housing','culture'] as const).map(kind=><button type="button" key={kind}
                  disabled={capitalNextCost(city,kind)===undefined||city.funds<(capitalNextCost(city,kind)??Infinity)}
                  onClick={()=>invest(kind)}><b>{CAPITAL_LABELS[kind]} Lv.{capitalLevel(city,kind)}</b>
                  <span>{capitalNextCost(city,kind)===undefined?'整備完了':`${format(capitalNextCost(city,kind)!)} Cで強化`}</span></button>)}
              </div>}
              {operationsTab==='budget'&&<div className="map-budget-controls">
                <div className="map-budget-condition"><span>施設の健全度 <strong>{stats.infrastructureCondition}/100</strong></span>
                  <span>修繕積み残し <strong>{format(stats.maintenanceBacklog)} C</strong></span></div>
                <div role="group" aria-label="地図上の保全計画" className="map-budget-options">
                  {(['minimum','standard','preventive'] as const).map(plan=>
                    <button key={plan} aria-pressed={stats.maintenancePlan===plan}
                      className={stats.maintenancePlan===plan?'selected':''}
                      onClick={()=>applyMaintenance(plan)}>{MAINTENANCE_LABELS[plan]}</button>)}
                </div>
                <div className="map-budget-condition"><span>市債残高 <strong>{format(stats.outstandingDebt)} C</strong></span>
                  <span>毎月返済 <strong>{format(stats.debtService)} C</strong></span></div>
                <div role="group" aria-label="地図上の財政運営" className="map-budget-options">
                  <button aria-pressed={stats.fiscalMode==='normal'} className={stats.fiscalMode==='normal'?'selected':''}
                    onClick={()=>setFiscalMode('normal')}>通常運営</button>
                  <button aria-pressed={stats.fiscalMode==='austerity'} className={stats.fiscalMode==='austerity'?'selected':''}
                    onClick={()=>setFiscalMode('austerity')}>支出抑制</button>
                </div>
                <button className="map-budget-borrow" type="button" disabled={stats.debtHeadroom<BOND_AMOUNT}
                  onClick={borrow}>市債で {format(BOND_AMOUNT)} C を調達</button>
              </div>}
              {operationsTab==='roads'&&<div className="map-traffic-quick" role="group" aria-label="簡易交通分析">
                <span>推定混雑度 <b>{stats.congestion}%</b></span><span>混雑道路 <b>{stats.congestedRoads}区画</b></span>
                <span>交通生産効率 <b>{Math.round(stats.trafficProductivity*100)}%</b></span>
                <button type="button" onClick={()=>switchMenu('traffic')}>詳しいデータ ↗</button>
              </div>}
              <button type="button" className="map-operations-dismiss" onClick={()=>setOperationsOpen(false)}>地図に戻る ✓</button>
            </div>}
          </div>}
          {active==='build'&&<div className="map-time-rail" role="group" aria-label="地図上の時間進行">
            <button type="button" className="map-time-toggle" onClick={toggle}
              aria-label={city.paused?'地図で再生':'地図で一時停止'} aria-pressed={!city.paused}>{city.paused?'▶':'Ⅱ'}</button>
            <button type="button" className="map-time-next" onClick={()=>progressMonth(true)}
              aria-label="地図で翌月へ進める">翌月 <span>›</span></button>
          </div>}
          {active==='build'&&focusSite&&<button type="button" className="map-construction-focus"
            onClick={viewConstruction} aria-label="工事現場へ移動する">
            <span className="construction-pulse-dot"/> 🏗 工事中 {activeSites.length}件 <strong>現場を見る ↗</strong>
          </button>}
          {cityMoment&&<div key={cityMoment.key} className={`city-growth-moment moment-${cityMoment.kind}`} role="status">
            <span className="city-growth-spark">✦</span><div><strong>{cityMoment.title}</strong><p>{cityMoment.detail}</p>
              {cityMoment.point&&<button type="button" className="growth-jump"
                onClick={()=>{mapRef.current?.focusTile(cityMoment.point!.x,cityMoment.point!.y);setMapQuickOpen(false);}}>
                発展した場所を見る ↗
              </button>}
            </div>
            <button type="button" onClick={()=>setCityMoment(null)} aria-label="成長のお知らせを閉じる">✕</button>
          </div>}
          {active==='build'&&<div className="mobile-progress-chip" role="status"><span>🏗 工事中 {activeSites.length}件</span><span>開発可能 {readyToBuild}区画 · 建築待ち {waiting}区画</span></div>}
          {selected&&tool==='inspect'&&<div className="mobile-tile-info" role="note"><div><strong>区画 {selected.x}, {selected.y}</strong><button aria-label="区画情報を閉じる" onClick={()=>setSelected(null)}>✕</button></div><p>{selectedDescription}</p></div>}
          {active==='residents'&&<div className="land-legend" aria-label="土地評価の凡例"><strong>土地評価</strong><span><i className="land-low"/>低い</span><span><i className="land-mid"/>普通</span><span><i className="land-high"/>高い</span></div>}
          {active==='traffic'&&<div className="traffic-legend" aria-label="推定交通量の凡例"><strong>交通負荷</strong><span><i className="traffic-low"/>余裕</span><span><i className="traffic-medium"/>注意</span><span><i className="traffic-high"/>混雑</span></div>}
           <div className="map-hint">{mode==='paint'&&canDragPaint(tool)?`${toolNames[tool]}：ドラッグでまとめて配置 ／ 移動は「移動」ボタン`:'ドラッグで移動 ／ クリックして選択 ／ ホイールで拡大縮小'}</div>
        </div><div className="notice"><span>ⓘ</span><span role="status">{message}</span></div>
        {active==='build'&&<section className="development-panel" aria-label="都市開発の進捗">
          <div className="development-header"><strong>🏗 開発の進捗</strong><span>{city.paused?'⏸ 時間は停止中':'▶ 時間進行中'}</span></div>
          <div className="development-counts">
            <div><small>住宅の建築待ち</small><strong>{development.pending.home}<em>区画</em></strong><span>建築可能 {development.ready.home}</span></div>
            <div><small>商業の建築待ち</small><strong>{development.pending.shop}<em>区画</em></strong><span>建築可能 {development.ready.shop}</span></div>
            <div><small>工業の建築待ち</small><strong>{development.pending.industry}<em>区画</em></strong><span>建築可能 {development.ready.industry}</span></div>
          </div>
          <p className="development-guidance" role="status">{developmentHint}</p>
          <div className="construction-summary" aria-label="工事の進捗"><strong>工事中：{activeSites.length}件</strong><span>{nextCompletion===null?'進行中の工事はありません':`次の完成まで あと${nextCompletion}か月`}</span></div>
          {development.disconnected>0&&<p className="development-disconnected">道路に接していない開発待ち地区：{development.disconnected}区画</p>}
          <div className="development-actions"><span>地区を指定すると需要に応じて自動着工。建物の完成までゲーム内で1〜6か月かかります。</span><button type="button" onClick={()=>progressMonth(true)}>翌月へ進めて発展を確認 →</button></div>
        </section>}
        {active==='build'&&<div className={`build-panel ${mobileToolsOpen?'':'dock-collapsed'}`} data-mobile-category={mobileBuildGroup}><div className="panel-title"><strong>建設・都市開発</strong><span>設置する施設を選択</span><button className="undo-button" onClick={undo} disabled={!canUndo} title="Ctrl+Z / ⌘Z">↶ 元に戻す</button><button className="mobile-dock-toggle" aria-label={mobileToolsOpen?'建設メニューを閉じる':'建設メニューを開く'} aria-expanded={mobileToolsOpen} onClick={()=>setMobileToolsOpen(v=>!v)}>{mobileToolsOpen?'⌄ 閉じる':'⌃ 建設を開く'}</button></div><div className="mobile-build-categories" role="group" aria-label="建設カテゴリ">{buildGroups.map(group=><button key={group.id} aria-pressed={mobileBuildGroup===group.id} className={mobileBuildGroup===group.id?'selected':''} onClick={()=>setMobileBuildGroup(group.id)}><span>{group.glyph}</span> {group.label}</button>)}</div><div className="tool-grid">{palettes.map(p=><button key={p.tool} data-category={categoryOfTool(p.tool)} title={p.hint} aria-pressed={tool===p.tool} onClick={()=>setCurrentTool(p.tool)} className={`tool-tile ${tool===p.tool?'active':''}`}><span className="tool-glyph">{p.icon}</span><strong>{toolNames[p.tool]}</strong><small>{COSTS[p.tool]===0?'選択':`${format(COSTS[p.tool])} C`}</small></button>)}</div><p className="mobile-build-advice">{developmentHint}</p></div>}
        {active==='traffic'&&<div className="data-panel traffic-panel">
          <div className="panel-title"><strong>交通分析</strong><span>道路の接続・通勤・物流の推定値</span></div>
          <div className="metric-grid">
            <div><small>推定混雑度</small><b>{stats.congestion}%</b></div>
            <div><small>混雑している道路</small><b>{format(stats.congestedRoads)} マス</b></div>
            <div><small>平均通勤距離</small><b>{stats.averageCommute.toFixed(1)} 区画</b></div>
            <div><small>交通による企業生産効率</small><b>{Math.round(stats.trafficProductivity*100)}%</b></div><div><small>交通改善事業</small><b>Lv.{capitalLevel(city,'transit')}</b></div>
            <div><small>道路ネットワーク</small><b>{format(stats.roadComponents)} 系統</b></div>
            <div><small>幹線道路に改良済み</small><b>{format(stats.arterialRoads)} マス</b></div>
            <div><small>通勤先がない・道路未接続の住民</small><b>{format(stats.disconnectedResidents)} 人</b></div>
          </div>
          <div className="traffic-meter-label"><span>都市の交通混雑</span><b>{stats.congestion}%</b></div>
          <div className="traffic-progress" role="meter" aria-label="推定混雑度" aria-valuenow={stats.congestion} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${stats.congestion}%`}}/></div>
          <div className="traffic-advice">{stats.employed===0?'就業者がいません。住宅と職場を道路でつなぎ、雇用を増やしましょう。':stats.congestion>45?'交通が集中しています。職場と住宅を分散させ、別の道路ネットワークで混雑を軽減しましょう。':stats.congestion>20?'交通に負荷がかかっています。マップ上の橙・赤色の道路を確認しましょう。':'通勤路の混雑は小さい状態です。新しい開発地区と職場の接続を確認しましょう。'}</div>
          <p className="traffic-note">一般道路の容量は85、幹線道路は220。幹線道路は1マス420 Cの改良費と追加維持費がかかります。交差点制御や迂回行動は未導入です。</p>
        </div>}
        {active==='finance'&&<div className="data-panel finance-panel"><div className="panel-title"><strong>財政と経済</strong><span>都市の収入・支出・更新計画</span></div><div className="metric-grid">
            <div><small>税収・企業収入</small><b className="positive">+{format(stats.income)} C / 月</b></div>
            <div><small>月間支出合計</small><b className="negative">−{format(stats.expenses)} C / 月</b></div>
            <div><small>インフラ更新予算</small><b>{format(stats.renewalSpending)} C / 月</b></div>
            <div><small>現在必要な更新費</small><b>{format(stats.renewalDue)} C / 月</b></div>
            <div><small>更新の積み残し</small><b>{format(stats.maintenanceBacklog)} C</b></div>
            <div><small>施設の健全度</small><b>{stats.infrastructureCondition} / 100</b></div>
            <div><small>成熟都市の追加行政費</small><b>{format(stats.matureCityServices)} C / 月</b></div>
            <div><small>公共投資の運営費</small><b>{format(stats.capitalOperating)} C / 月</b></div><div><small>市債の残高</small><b>{format(stats.outstandingDebt)} C</b></div><div><small>毎月の返済（元金＋利息）</small><b>{format(stats.debtService)} C</b></div>
            <div><small>就業者数</small><b>{format(stats.employed)} 人</b></div>
          </div>
          <div className="maintenance-panel">
            <div className="section-title"><strong>道路・公共施設の保全計画</strong><span>毎月の予算に反映</span></div>
            <div className="maintenance-options" role="group" aria-label="インフラ保全計画">
              {([{id:'minimum',note:'支出は少ないが、修繕の積み残しが増える'},
                 {id:'standard',note:'必要な更新費を負担して状態を維持'},
                 {id:'preventive',note:'費用を増やして積み残しを解消'}] as {id:MaintenancePlan;note:string}[])
                .map(p=><button key={p.id} type="button" className={`maintenance-option ${stats.maintenancePlan===p.id?'current':''}`} aria-pressed={stats.maintenancePlan===p.id} onClick={()=>applyMaintenance(p.id)}><b>{MAINTENANCE_LABELS[p.id]}</b><small>{p.note}</small></button>)}
            </div>
            <div className="maintenance-forecast"><span>次月の修繕積み残し見込み</span><strong>{format(stats.projectedMaintenanceBacklog)} C</strong></div>
            <div className="maintenance-condition" role="meter" aria-label="施設健全度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.infrastructureCondition}><i style={{width:`${stats.infrastructureCondition}%`}}/></div>
            <p className="finance-explainer">更新費は都市の経過年数と道路・公園・学校・診療所の規模から算出します。積み残しが増えると住民満足度が低下します。これは市全体の簡易モデルで、施設ごとの築年数はまだ追跡していません。</p>
          </div>
          <div className="capital-panel">
            <div className="section-title"><strong>都市の大型投資</strong><span>事業は最大Lv.3／投資後は毎月の運営費も増加</span></div>
            <div className="capital-grid">
              {(['transit','housing','culture'] as const).map(kind=>{
                const level=capitalLevel(city,kind);
                const cost=capitalNextCost(city,kind);
                return <section key={kind} className="capital-card">
                  <div className="capital-card-header"><strong>{CAPITAL_LABELS[kind]}</strong><span>Lv.{level} / 3</span></div>
                  <p>{CAPITAL_NOTES[kind]}</p>
                  <div className="capital-card-foot">
                    <span>{cost===undefined?'整備完了':`次の投資 ${format(cost)} C`}</span>
                    <button type="button" className="capital-invest" disabled={cost===undefined||city.funds<cost} onClick={()=>invest(kind)} aria-label={`${CAPITAL_LABELS[kind]}へ投資`}>{cost===undefined?'最大レベル':'投資する'}</button>
                  </div>
                </section>;
              })}
            </div>
            <p className="finance-explainer">交通改善は通勤負荷を軽減、住宅支援は住民が支払う家賃を軽減、文化投資は満足度を底上げします。現段階では市全体に効く制度・投資であり、交通路線や個別施設の建設はまだありません。</p>
          </div>
          <div className="fiscal-panel">
            <div className="section-title"><strong>財政再建・市債</strong><span>資金繰りと行政サービスのバランス</span></div>
            <div className="fiscal-status">
              <strong>{stats.balance>=0&&city.funds>=0?'月次収支は黒字':stats.balance<0?'月次赤字に注意':'資金残高がマイナスです'}</strong>
              <span>営業収支 {format(stats.operatingBalance)} C ／ 元金返済 {format(stats.debtPrincipal)} C ／ 現金増減 {format(stats.balance)} C</span>
            </div>
            <div className="fiscal-actions" role="group" aria-label="財政再建方針">
              {([{id:'normal',name:'通常運営',hint:'行政サービスを維持'},
                {id:'austerity',name:'支出抑制',hint:'維持費を削減するが住民満足度−7'}] as {id:FiscalMode;name:string;hint:string}[]).map(p=>
                <button key={p.id} type="button" className={`fiscal-choice ${stats.fiscalMode===p.id?'current':''}`} aria-pressed={stats.fiscalMode===p.id} onClick={()=>setFiscalMode(p.id)}><b>{p.name}</b><small>{p.hint}</small></button>)}
            </div>
            <div className="fiscal-debt-row"><div><small>現在の借入</small><strong>{format(stats.outstandingDebt)} / {format(stats.debtLimit)} C</strong><small>今月の支出削減 {format(stats.publicSavings)} C</small></div><button type="button" className="fiscal-borrow" onClick={borrow} disabled={stats.debtHeadroom<BOND_AMOUNT} aria-label="市債を発行する">市債で25,000 C調達</button></div>
            <p className="finance-explainer">借入は一時的な資金調達です。元金は約60回分の定額返済、未返済額には月0.3%の利息がかかります。返済を含めた現金増減は上の月間収支に反映済みです。赤字が続けば資金はマイナスになり、建設・投資ができなくなります。</p>
          </div>
          <div className="control-row"><label htmlFor="tax">住民税率 <strong>{city.tax}%</strong></label><input id="tax" type="range" min="3" max="18" value={city.tax} onChange={e=>applyTax(Number(e.target.value))}/></div>
        </div>}
        {active==='residents'&&<div className="data-panel"><div className="panel-title"><strong>住民と都市の成長</strong><span>人口の推移と雇用</span></div><Sparkline numbers={city.history.map(x=>x.population)}/><div className="metric-grid"><div><small>住宅建物</small><b>{stats.homes} 棟</b></div><div><small>戸建て・連棟住宅</small><b>{skyline.cottages} 棟</b></div><div><small>中低層マンション</small><b>{skyline.apartments} 棟</b></div><div><small>高層マンション</small><b>{skyline.towers} 棟</b></div><div><small>雇用枠</small><b>{format(stats.jobs)} 人</b></div><div><small>就業者</small><b>{format(stats.employed)} 人</b></div><div><small>空き求人</small><b>{format(stats.vacancies)} 件</b></div><div><small>住宅地の平均土地評価</small><b>{land.averageResidential}/100</b></div><div><small>高評価の土地</small><b>{format(land.desirableTiles)} マス</b></div><div><small>住宅の収容人数</small><b>{format(stats.housingCapacity)} 人</b></div><div><small>住宅の空き</small><b>{format(stats.housingVacancies)} 人分</b></div><div><small>推定家賃</small><b>{stats.estimatedRent.toFixed(1)} C / 人・月</b></div><div><small>支援後の家賃負担</small><b>{stats.netRent.toFixed(1)} C / 人・月</b></div><div><small>家賃負担率</small><b>{stats.rentBurden}%</b></div><div><small>住居負担のしやすさ</small><b>{stats.affordability} / 100</b></div><div><small>来月の推定人口移動</small><b className={stats.expectedMigration>=0?'positive':'negative'}>{stats.expectedMigration>0?'+':''}{format(stats.expectedMigration)} 人</b></div></div><div className="housing-advice" role="note">{stats.housingVacancies===0?'住宅が満室です。新たな住宅地区を指定すると入居できる場所が増えます。':stats.employed===0?'住宅の空きはありますが仕事が不足しています。商業・工業地区と道路を整備しましょう。':stats.rentBurden>65?'家賃負担が重い状態です。住宅を増やしたり、雇用・交通条件を改善しましょう。':'住宅の入居は空室、仕事、家賃負担、住民満足度で月ごとに変化します。'}</div></div>}
        {active==='policy'&&<div className="data-panel"><div className="panel-title"><strong>市政方針</strong><span>都市の経営方針を選択</span></div><div className="policy-grid">{([{id:'balanced',desc:'住民と経済をバランスよく成長'},{id:'growth',desc:'税収増を狙うが環境に負荷'},{id:'eco',desc:'住環境を優先し産業利益は減少'},{id:'mobility',desc:'公共交通・時差通勤を補助し、混雑を軽減するが運営費が増加'}] as {id:Policy;desc:string}[]).map(p=><button key={p.id} className={`policy-option ${city.policy===p.id?'current':''}`} onClick={()=>applyPolicy(p.id)}><b>{POLICY_LABELS[p.id]}</b><small>{p.desc}</small></button>)}</div></div>}
        </div>
        <aside className="inspector"><div className="inspector-header"><span className="inspector-label">CITY INSIGHTS</span><strong>都市の状況</strong></div><div className="inspector-body"><div className="info-highlight"><span className="tiny-label">選択中のエリア</span><strong>{selected?`区画 ${selected.x}, ${selected.y}`:'区画を選択'}</strong><p>{selectedDescription}</p>{selectedLandScore!==undefined&&selectedLandScore>0&&<p className="selected-land-value">土地評価：<strong>{selectedLandScore}/100</strong></p>}</div><div className="inspector-section"><div className="section-title"><strong>都市の指標</strong><span>月次更新</span></div><div className="inspector-kpi"><span>住宅</span><b>{stats.homes}棟</b></div><div className="inspector-kpi"><span>商業</span><b>{stats.commerce}棟</b></div><div className="inspector-kpi"><span>工業</span><b>{stats.industry}棟</b></div><div className="inspector-kpi"><span>道路</span><b>{stats.roads}マス</b></div><div className="inspector-kpi"><span>推定混雑度</span><b>{stats.congestion}%</b></div><div className="inspector-kpi"><span>公園</span><b>{stats.green}か所</b></div></div><div className="inspector-section"><div className="section-title"><strong>都市の成長</strong><span>直近120か月</span></div><Sparkline numbers={city.history.map(x=>x.population)}/></div><div className="tips"><span>💡 市長へのヒント</span><p>道路の隣に住宅・商業・工業地区を指定すると、時間の経過で建物が建設されます。</p></div></div>
        <div className="inspector-foot"><button onClick={()=>exportCity(city)}>都市データを書き出す ↗</button><button onClick={()=>importRef.current?.click()}>データを読み込む ↥</button><button onClick={()=>{void restoreBackup();}}>前回のバックアップを復元 ↶</button><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e=>{void doImport(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/><button className="new-game" onClick={startNewCity}>新しい都市を始める</button></div></aside>
      </div>
    </section>
    {help&&<div className="modal-backdrop" role="presentation" onClick={()=>setHelp(false)}><div role="dialog" aria-modal="true" aria-label="操作ガイド" className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setHelp(false)}>✕</button><h2>街づくりガイド</h2><p>都市マップをクリックして、道路や地区、公共施設を配置できます。</p><ul><li>道路に面した土地だけ住宅・商業・工業の開発が可能です。</li><li>時間を再生すると建物と人口が増え、毎月の収支も反映されます。</li><li>道路・地区・撤去・幹線道路への改良は「描く」モードでドラッグできます。</li><li>「交通・物流」では道路ごとの推定交通量を色分けして確認できます。</li><li>「住民と人口」では、学校・公園・産業施設などによる土地評価を地図で確認できます。</li><li>「財政と経済」でインフラ保全計画を選べます。維持費を削ると修繕の積み残しが増えます。</li><li>赤字対策には行政支出抑制か市債による資金調達がありますが、満足度低下や返済負担に注意してください。</li><li>新しい住宅は空室として建設され、雇用・家賃・空室に応じて入居します。失業や生活費が高い場合は転出も起こります。</li><li>「移動」モードで地図をドラッグして移動できます。拡大・縮小・中央に戻すボタンも利用可能です。</li><li>✦ボタンで車や煙、水面などの軽量アニメーションを停止・再開できます。端末の『動きを減らす』設定にも対応します。</li><li>新築・増築時は建物の周囲に一時的な演出が表示されます。財政危機や修繕の遅れもマップ上の状態表示と公共施設の注意マーカーで確認できます。</li><li>Spaceキーで一時停止。Ctrl+Zまたは⌘Zで直前の建設を元に戻せます。</li><li>保存に問題があれば、自動的に前回のバックアップを確認します。</li><li>都市データはブラウザのIndexedDBに自動保存されます。端末を変える場合は書き出し機能を利用してください。</li></ul><button className="primary" onClick={()=>setHelp(false)}>街づくりを始める</button></div></div>}
  </main>;
}