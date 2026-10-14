import { SIZE } from '../core/grid';

/** Inclusive grid bounds, in tile coordinates. Pure camera math: no Pixi dependency. */
export type TileWindow=Readonly<{minX:number;maxX:number;minY:number;maxY:number}>;
export type StructureDetail='overview'|'detail';

const HW=26,HH=13;
const clamp=(value:number)=>Math.max(0,Math.min(SIZE-1,value));

/**
 * Inverse-isometric transform of all four screen corners.
 * Map sprites extend beyond tile origins, so callers keep extra tile padding.
 */
export function visibleTileWindow(
  width:number,height:number,panX:number,panY:number,zoom:number,
):TileWindow|null{
  if(width<=0||height<=0||!Number.isFinite(zoom)||zoom<=0)return null;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const sx of [0,width])for(const sy of [0,height]){
    const wx=(sx-panX)/zoom,wy=(sy-panY)/zoom;
    const x=(wx/HW+wy/HH)/2,y=(wy/HH-wx/HW)/2;
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  // No part of the grid lies within the generous projected axis bounds.
  if(maxX<0||minX>SIZE-1||maxY<0||minY>SIZE-1)return null;
  return {minX:clamp(Math.floor(minX)),maxX:clamp(Math.ceil(maxX)),
          minY:clamp(Math.floor(minY)),maxY:clamp(Math.ceil(maxY))};
}

/** Overscan prevents continuous rebuilding during small drags and tall roofs clipping. */
export function paddedTileWindow(window:TileWindow|null,margin=8):TileWindow|null{
  if(!window)return null;
  return {
    minX:clamp(window.minX-margin),maxX:clamp(window.maxX+margin),
    minY:clamp(window.minY-margin),maxY:clamp(window.maxY+margin),
  };
}

/**
 * Only rebuild the combined geometry when camera nears the edge of the cached
 * tile window. Correct even when the camera moves completely off-world.
 */
export function needsTileWindowRefresh(
  cached:TileWindow|null,visible:TileWindow|null,
  guard=2,
):boolean{
  if(!cached)return visible!==null;
  if(!visible)return true;
  return (cached.minX>0&&visible.minX<cached.minX+guard)
    ||(cached.maxX<SIZE-1&&visible.maxX>cached.maxX-guard)
    ||(cached.minY>0&&visible.minY<cached.minY+guard)
    ||(cached.maxY<SIZE-1&&visible.maxY>cached.maxY-guard);
}

export function structureDetailAtZoom(zoom:number):StructureDetail{
  return zoom<0.72?'overview':'detail';
}

export function tileCount(window:TileWindow|null):number{
  return window?(window.maxX-window.minX+1)*(window.maxY-window.minY+1):0;
}

/**
 * Tight screen-space cull after the tile-window prefilter.
 * Extra pixels protect clipped building roofs and camera drags between rebuilds.
 */
export function tileNearViewport(
  x:number,y:number,width:number,height:number,
  panX:number,panY:number,zoom:number,
  overscanPx=Math.max(40,zoom*210),
):boolean{
  const sx=(x-y)*HW*zoom+panX,sy=(x+y)*HH*zoom+panY;
  return sx>=-overscanPx&&sx<=width+overscanPx
    &&sy>=-overscanPx&&sy<=height+overscanPx;
}
