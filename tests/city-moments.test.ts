import {describe,expect,it} from 'vitest';
import {createCity} from '../src/core/city';
import {buildingStyleLabel,getCityMoment} from '../src/game/city-moments';
import {getBuildingStyle} from '../src/game/building-style';
describe('observable city story',()=>{
  it('explains a visibly changed building archetype when redevelopment occurs',()=>{
    const before=createCity('成長イベント',94);
    const next=structuredClone(before);
    const old=next.buildings.find(b=>b.kind===1)!;
    const existing=getBuildingStyle(old,next.seed);
    old.level=3;next.month=12;
    const story=getCityMoment(before,next);
    expect(story?.kind).toBe('redevelopment');
    expect(story?.title).toContain(getBuildingStyle(old,next.seed).label);
    expect(story?.detail).toContain('Lv.');
    expect(story?.point).toEqual({x:old.x,y:old.y});
    expect(buildingStyleLabel(next,old.x,old.y)).toBe(getBuildingStyle(old,next.seed).label);
    expect(existing.height).toBeLessThan(getBuildingStyle(old,next.seed).height);
  });
  it('reports actual new buildings but never synthetic events when only money changes',()=>{
    const before=createCity('新築イベント',72);
    const after=structuredClone(before);
    after.month=1;
    after.buildings.push({id:after.nextId++,x:2,y:2,kind:1,level:1,residents:0,jobs:0});
    expect(getCityMoment(before,after)?.kind).toBe('construction');
    expect(getCityMoment(before,after)?.point).toEqual({x:2,y:2});
    expect(getCityMoment(before,{...before,month:1,funds:before.funds+100})).toBeNull();
    expect(getCityMoment(before,before)).toBeNull();
  });
  it('honors a threshold crossing and prevents save-related event replay',()=>{
    const base=createCity('到達イベント',55);
    const before=structuredClone(base);
    const next=structuredClone(base);
    next.month=1;
    before.buildings=before.buildings.map(b=>b.kind===1?{...b,residents:0}:b);
    next.buildings=next.buildings.map(b=>b.kind===1?{...b,residents:60}:b);
    const got=getCityMoment(before,next);
    expect(got?.kind).toBe('milestone');
    expect(getCityMoment(next,before)).toBeNull();
    expect(JSON.stringify(next)).not.toContain('CityMoment');
  });
});