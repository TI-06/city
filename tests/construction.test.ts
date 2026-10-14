import {describe,expect,it} from 'vitest';
import {advanceMonths,applyTool,applyStroke,createCity,describeTile,getDevelopmentOutlook,getStats,validateCity} from '../src/core/city';
import {constructionDuration,constructionPhase,constructionProgress,finishConstruction} from '../src/core/construction';

describe('monthly staged property development',()=>{
  it('starts construction instead of immediately creating homes or workplaces',()=>{
    const city=createCity('着工チェック',12937);
    const before=JSON.stringify(city);
    const completed=city.buildings.length;
    const next=advanceMonths(city,1);
    expect(next.month).toBe(1);
    expect(next.construction?.length).toBeGreaterThan(0);
    expect(next.buildings.length).toBe(completed);
    expect(next.construction?.every(site=>site.startMonth===1)).toBe(true);
    expect(JSON.stringify(city)).toBe(before);
    expect(validateCity(structuredClone(next))).toEqual(next);
  });
  it('builds houses in 1 month and companies in 2/3 months, with no premature jobs',()=>{
    expect(constructionDuration(1,1)).toBe(1);
    expect(constructionDuration(2,1)).toBe(2);
    expect(constructionDuration(3,1)).toBe(3);
    expect(constructionDuration(1,2,true)).toBe(3);
    expect(constructionDuration(1,3,true)).toBe(6);
    const city=createCity('竣工検証',12937);
    const site={id:city.nextId++,x:18,y:22,kind:2 as const,level:1,startMonth:0,duration:2};
    city.construction=[site];
    const originalJobs=getStats(city).jobs;
    const halfway=advanceMonths({...city,month:0},1);
    expect(halfway.buildings.some(b=>b.id===site.id)).toBe(false);
    expect(getStats(halfway).jobs).toBe(originalJobs);
    const finished=advanceMonths(halfway,1);
    expect(finished.buildings.some(b=>b.id===site.id)).toBe(true);
    expect(getStats(finished).jobs).toBeGreaterThan(originalJobs);
  });
  it('keeps existing housing operational during an upgrade, then commits level',()=>{
    const city=createCity('マンション建替え',379);
    const home=city.buildings.find(b=>b.kind===1)!;
    city.month=12;
    city.construction=[{id:home.id,x:home.x,y:home.y,kind:home.kind,
      level:2,upgradeFrom:1,startMonth:12,duration:3}];
    const baseResidents=home.residents;
    const during=advanceMonths(city,2);
    expect(during.buildings.find(b=>b.id===home.id)?.level).toBe(1);
    expect(during.buildings.find(b=>b.id===home.id)?.residents).toBeLessThanOrEqual(baseResidents);
    const after=advanceMonths(during,1);
    expect(after.buildings.find(b=>b.id===home.id)?.level).toBe(2);
    expect(after.construction?.some(site=>site.id===home.id)).toBe(false);
  });
  it('displays building site status, blocks overlapping work and cancels construction on demolition',()=>{
    const city=createCity('工事現場',399);
    const existing=new Set(city.buildings.map(b=>`${b.x},${b.y}`));
    const site=advanceMonths(city,1).construction?.find(s=>!existing.has(`${s.x},${s.y}`));
    expect(site).toBeDefined();
    const started=advanceMonths(city,1);
    expect(describeTile(started,site!.x,site!.y)).toContain('残り');
    expect(getDevelopmentOutlook(started).inProgress).toBeGreaterThan(0);
    const applied=applyTool(started,'bulldoze',site!.x,site!.y);
    expect(applied.changed).toBe(true);
    expect(applied.city.construction?.some(s=>s.id===site!.id)).toBe(false);
    const denied=applyTool(started,'road',site!.x,site!.y);
    expect(denied.changed).toBe(false);
    const stroke=applyStroke(started,'bulldoze',[{x:site!.x,y:site!.y}]);
    expect(stroke.city.construction?.some(s=>s.id===site!.id)).toBe(false);
  });
  it('supports old schema 1, rejects forged sites and keeps construction progress deterministic after reload',()=>{
    const city=createCity('セーブ継続',197);
    delete city.construction;
    expect(validateCity(structuredClone(city))).toEqual(city);
    const active=advanceMonths(city,1);
    const original=JSON.stringify(active);
    const restored=validateCity(JSON.parse(original));
    expect(advanceMonths(restored,48)).toEqual(advanceMonths(active,48));
    expect(JSON.stringify(active)).toBe(original);
    if(active.construction?.length){
      const altered=structuredClone(active);
      altered.construction![0]={...altered.construction![0]!,duration:-1};
      expect(()=>validateCity(altered)).toThrow('工事');
    }
  });
  it('interpolates persistent site stages from months only',()=>{
    const site={id:7,x:2,y:3,kind:1 as const,level:3,startMonth:10,duration:6,upgradeFrom:2};
    expect(constructionProgress(site,10)).toBe(0);
    expect(constructionPhase(site,10)).toBe('foundation');
    expect(constructionPhase(site,12)).toBe('frame');
    expect(constructionPhase(site,15)).toBe('finishing');
    expect(constructionProgress(site,16)).toBe(1);
    const city=createCity('基礎状態',89);
    city.construction=[site];
    expect(finishConstruction({...city,month:11})).toBe(0);
  });
});
