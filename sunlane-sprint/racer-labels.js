import {Vector3} from 'three';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

/** Rival labels stay sharp at any DPR; the local player has no overhead label. */
export function createRacerLabels(container){
  const layer=document.createElement('div');layer.id='racer-nameplates';layer.className='racer-nameplates';
  layer.setAttribute('aria-label','Racer names');layer.hidden=true;
  container.append(layer);
  const entries=new Map(),point=new Vector3(),view=new Vector3(),cameraPosition=new Vector3();
  function entryFor(id){
    let entry=entries.get(id);if(entry)return entry;
    const el=document.createElement('div');el.className='racer-nameplate';el.dataset.racerId=id;el.style.visibility='hidden';
    const rank=document.createElement('span');rank.className='racer-nameplate-rank';rank.setAttribute('aria-hidden','true');
    const name=document.createElement('span');name.className='racer-nameplate-name';
    const kind=document.createElement('span');kind.className='racer-nameplate-kind';
    el.append(rank,name,kind);layer.append(el);
    entry={el,rank,name,kind,text:'',type:null};entries.set(id,entry);return entry;
  }
  function update({camera,racers,models,visible,width=innerWidth,height=innerHeight,occluders=[]}){
    layer.hidden=!visible;if(!visible)return;
    camera.updateMatrixWorld();camera.getWorldPosition(cameraPosition);
    const currentIds=new Set();
    racers.forEach((r,i)=>{
      if(r.player)return;
      const id=String(r.memberId??`racer-${r.id}`),entry=entryFor(id),model=models[i];currentIds.add(id);
      entry.el.style.visibility='hidden';
      if(!model?.visible||r.finished)return;
      const text=String(r.name||'Racer'),type=r.bot||r.aiControlled?'ai':'player';
      if(entry.text!==text||entry.type!==type){
        // Player names are text, never markup (including emoji and non-Latin names).
        entry.name.textContent=text;entry.kind.textContent=type==='ai'?'AI':'';
        entry.kind.hidden=type==='player';entry.el.dataset.kind=type;entry.text=text;entry.type=type;
      }
      entry.rank.textContent=String(r.rank||i+1);entry.el.setAttribute('aria-label',`${text}, position ${r.rank||i+1}${type==='ai'?', AI rival':''}`);
      model.getWorldPosition(point);point.y+=2.55;view.copy(point).applyMatrix4(camera.matrixWorldInverse);
      const distance=cameraPosition.distanceTo(point);
      if(view.z>=-.1||distance>105)return;
      point.project(camera);
      if(point.z< -1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1)return;
      // Keep the bottom center tied to one world-space point. Packing, edge
      // clamping and pixel rounding made names jump away from their own kart.
      const x=(point.x*.5+.5)*width,y=(-.5*point.y+.5)*height;
      // Secondary camera images share the canvas below this DOM layer. Do not
      // let a main-view nameplate appear to label a kart inside another camera.
      const halfWidth=entry.el.offsetWidth*.5,labelHeight=entry.el.offsetHeight;
      if(occluders.some(rect=>x+halfWidth>rect.left&&x-halfWidth<rect.right&&y-9>rect.top&&y-9-labelHeight<rect.bottom))return;
      entry.el.style.transform=`translate3d(${x}px,${y-9}px,0) translate(-50%,-100%)`;
      entry.el.style.opacity=String(clamp((105-distance)/25,.45,1));
      // If karts line up, nearer labels naturally cover farther labels without
      // moving either anchor. Clipping at screen edges also preserves alignment.
      entry.el.style.zIndex=String(Math.max(1,Math.round((105-distance)*10)));
      entry.el.style.visibility='visible';
    });
    for(const [id,entry]of entries)if(!currentIds.has(id)){entry.el.remove();entries.delete(id);}
  }
  return {update,dispose(){layer.remove();entries.clear();}};
}
