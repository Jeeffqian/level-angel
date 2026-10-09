import {Vector3} from 'three';
import {selectMissileTarget} from './item-rules.js';

/** Input sources must match on release; cancellation never consumes an item. */
export function createMissileAim({getRace,available,fire,onNoTarget,element,label}){
  let held=null;
  const point=new Vector3(),view=new Vector3();
  // Cosmetic search motion uses repeatable random waypoints, separate from item RNG.
  const random=(index,seed)=>{let n=Math.imul(index+1,0x45d9f3b)^seed;n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;};
  function cancel(slot,source){
    if(held&&(slot===undefined||(held.slot===slot&&held.source===source)))held=null;
    if(!held)element.hidden=true;
  }
  function refresh(){
    if(!held)return null;
    const race=getRace(),p=race.player;
    if(!available()||p.finished||p.hitTime>0||p.items?.[held.slot]!=='missile'){cancel();return null;}
    const target=selectMissileTarget(race,p);
    held.targetId=target?.id??null;held.targetName=target?String(target.name||'Rival'):'';
    return target;
  }
  return {
    get state(){return held?{slot:held.slot,targetId:held.targetId,targetName:held.targetName}:null;},
    press(slot,source){
      if(!available()||!Number.isInteger(slot)||slot<0||slot>2)return;
      const item=getRace().player.items?.[slot];if(!item)return;
      if(item!=='missile'){fire(slot);return;}
      if(held)return;
      const race=getRace();held={slot,source,targetId:null,targetName:'',searchStarted:null,seed:(Math.round(race.time*120)^Math.imul(race.player.id+1,8191)^slot)>>>0};refresh();
    },
    release(slot,source){
      if(!held||held.slot!==slot||held.source!==source)return;
      const target=refresh();if(!held)return;
      cancel();if(target)fire(slot,target.id);else onNoTarget();
    },
    cancel,
    update(camera,width=innerWidth,height=innerHeight,now=performance.now()){
      const target=refresh();element.hidden=!held;if(!held)return;
      element.dataset.locked=String(!!target);
      if(!target){
        held.searchStarted??=now;
        const time=Math.max(0,now-held.searchStarted)/850,index=Math.floor(time),t=time-index,ease=t*t*(3-2*t);
        const fromX=index?random((index-1)*2,held.seed):.5,fromY=index?random((index-1)*2+1,held.seed):.5;
        const rx=fromX+(random(index*2,held.seed)-fromX)*ease,ry=fromY+(random(index*2+1,held.seed)-fromY)*ease;
        const rangeX=Math.min(width*.24,320),rangeY=Math.min(height*.17,120);
        element.style.left=(width*.52+(rx-.5)*rangeX)+'px';element.style.top=(height*.44+(ry-.5)*rangeY)+'px';
        element.dataset.edge='false';delete element.dataset.targetId;label.textContent='SEARCHING · NO LOCK';return;
      }
      held.searchStarted=null;
      camera.updateMatrixWorld();point.set(target.x,1.55,target.z);view.copy(point).applyMatrix4(camera.matrixWorldInverse);point.project(camera);
      const behind=view.z>=-.1;
      let x=(point.x*.5+.5)*width,y=(-point.y*.5+.5)*height;
      if(behind){x=view.x<0?0:width;y=height*.48;}
      const edge=behind||x<58||x>width-58||y<180||y>height-180;
      x=Math.max(58,Math.min(width-58,x));y=Math.max(Math.min(180,height*.35),Math.min(height-150,y));
      element.style.left=x+'px';element.style.top=y+'px';element.dataset.edge=String(edge);
      element.dataset.targetId=String(target.id);label.textContent=held.targetName;
    }
  };
}
