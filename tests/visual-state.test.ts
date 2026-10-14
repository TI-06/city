import {describe,expect,it} from 'vitest';
import {advanceMonths,createCity,type City} from '../src/core/city';
import {appendGrowthPulses,detectGrowthEvents,visualMood} from '../src/game/visual-state';

describe('visual city development and municipal warnings',()=>{
  it('classifies insolvent and maintenance-backlog cities with priority',()=>{
    const base=createCity('都市の状態',17);
    expect(visualMood(base)).toBe('stable');
    expect(visualMood({...base,funds:-1})).toBe('crisis');
    expect(visualMood({...base,maintenanceBacklog:150_000})).toBe('repairs');
    expect(visualMood({...base,funds:-10,maintenanceBacklog:150_000})).toBe('crisis');
    expect(visualMood({...base,month:120,buildings:Array.from({length:145},(_,i)=>({...base.buildings[0]!,id:1000+i}))})).toBe('developing');
  });
  it('detects new buildings, upgraded floors and placed public facilities without mutating cities',()=>{
    const before=createCity('街の発展',31);
    const original=JSON.stringify(before);
    const after=structuredClone(before);
    const prior=before.buildings[0]!;
    after.buildings[0]={...prior,level:prior.level+1};
    after.buildings.push({id:after.nextId++,x:1,y:1,kind:1,level:1,residents:0,jobs:0});
    after.services.push({id:after.nextId++,x:2,y:2,kind:'park'});
    after.month++;
    const events=detectGrowthEvents(before,after);
    expect(events.map(e=>e.kind)).toEqual(['upgrade','new','service']);
    expect(JSON.stringify(before)).toBe(original);
    expect(detectGrowthEvents(after,before)).toEqual([]);
    expect(detectGrowthEvents({...before,name:'old'},after)).toEqual([]);
  });
  it('bounds many simultaneous build effects and removes them after three seconds',()=>{
    const base=createCity('建築更新',53);
    const newer:City=structuredClone(base);
    newer.month++;
    for(let i=0;i<30;i++)newer.buildings.push({id:4000+i,x:i,y:1,kind:2,level:1,residents:0,jobs:13});
    const events=detectGrowthEvents(base,newer);
    expect(events).toHaveLength(10);
    const first=appendGrowthPulses([],events,4);
    expect(first).toHaveLength(10);
    const second=appendGrowthPulses(first,events,5);
    expect(second).toHaveLength(10);
    expect(appendGrowthPulses(second,[],8.5)).toHaveLength(0);
  });
  it('does not persist frame effects into city saves after 10 years of play',()=>{
    const state=advanceMonths(createCity('長期の街',101),120);
    const frozen=JSON.stringify(state);
    const events=detectGrowthEvents(createCity('長期の街',101),state);
    appendGrowthPulses([],events,0);
    expect(JSON.stringify(state)).toBe(frozen);
    expect(frozen).not.toContain('GrowthPulse');
    expect(frozen).not.toContain('cityEffects');
  });
});
