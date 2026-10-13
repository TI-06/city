import { describe, it, expect } from 'vitest';
import { appendLine, canDragPaint } from '../src/core/paint';
import { createCity, applyStroke, tileIndex, canPlaceAt } from '../src/core/city';

describe('paint gestures', () => {
  it('interpolates a continuous orthogonal line', () => {
    const points = appendLine([{x:1,y:1}], {x:4,y:3});
    expect(points[0]).toEqual({x:1,y:1});
    expect(points.at(-1)).toEqual({x:4,y:3});
    for(let i=1;i<points.length;i++) expect(Math.abs(points[i]!.x-points[i-1]!.x)+Math.abs(points[i]!.y-points[i-1]!.y)).toBe(1);
  });
  it('deduplicates stroke cells and caps work', () => {
    const line=appendLine([{x:1,y:1},{x:2,y:1}],{x:1,y:1});
    expect(line).toEqual([{x:1,y:1},{x:2,y:1}]);
    expect(appendLine([{x:1,y:1}],{x:63,y:63},20)).toHaveLength(20);
  });
  it('allows dragging only on road/zoning/demolition', () => {
    expect(canDragPaint('road')).toBe(true);
    expect(canDragPaint('home')).toBe(true);
    expect(canDragPaint('clinic')).toBe(false);
    expect(canDragPaint('inspect')).toBe(false);
  });
  it('builds many road tiles in one operation and leaves input intact', () => {
    const before=createCity();
    const path=[{x:12,y:12},{x:12,y:13},{x:12,y:14}];
    const result=applyStroke(before,'road',path);
    expect(result.ok).toBe(true);
    expect(result.city.funds).toBe(before.funds-3*65);
    expect(before.roads[tileIndex(12,12)]).toBe(0);
    for (const p of path) expect(result.city.roads[tileIndex(p.x,p.y)]).toBe(1);
  });
  it('skips invalid cells, bills only successes, and rejects impossible actions', () => {
    const city=createCity();
    const stroke=applyStroke(city,'road',[{x:15,y:20},{x:15,y:20},{x:8,y:51}]);
    expect(stroke.ok).toBe(true);
    expect(stroke.city.funds).toBe(city.funds-65);
    expect(stroke.message).toContain('スキップ');
    const blocked=applyStroke(city,'road',[{x:8,y:51}]);
    expect(blocked.city).toBe(city);
    expect(blocked.changed).toBe(false);
  });
  it('does not overspend when funds run out mid-stroke',()=>{
    const city={...createCity(),funds:130};
    const points=[{x:12,y:12},{x:12,y:13},{x:12,y:14}];
    const result=applyStroke(city,'road',points);
    expect(result.city.funds).toBe(0);
    expect(points.filter(p=>result.city.roads[tileIndex(p.x,p.y)]===1)).toHaveLength(2);
    expect(city.funds).toBe(130);
  });
  it('hover validity matches placement rules', () => {
    const city=createCity();
    expect(canPlaceAt(city,'road',15,20)).toBe(true);
    expect(canPlaceAt(city,'road',8,51)).toBe(false);
    expect(canPlaceAt(city,'park',0,0)).toBe(false);
  });
});