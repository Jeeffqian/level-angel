import {createRaceInset} from './rear-view-mirror.js';

/** A short live cutaway to the rival hit by one of the local player's items. */
export function createHitCamera({renderer,scene,element,viewport,title,label}){
  let victimId=null,expires=0,lastRace=null;
  const inset=createRaceInset({renderer,scene,element,viewport,mirrored:false,hidePlayer:false,showThreats:false,name:'Item hit camera',
    configureCamera(camera,race){
      const victim=race.racers.find(r=>r.id===victimId),fx=Math.sin(victim.heading),fz=Math.cos(victim.heading);
      camera.position.set(victim.x+fx*6+fz*4.4,3.7,victim.z+fz*6-fx*4.4);
      camera.lookAt(victim.x,1.05,victim.z);
    }});
  function clear(){victimId=null;expires=0;lastRace=null;element.hidden=true;document.body.dataset.hitCamera='false';}
  return {
    diagnostics:inset.diagnostics,
    event(event,race,now=performance.now()){
      if(event.type!=='item-hit'||event.ownerId!==race.player.id||event.id===race.player.id||!['missile','banana'].includes(event.item))return false;
      const victim=race.racers.find(r=>r.id===event.id);if(!victim||victim.finished)return false;
      victimId=victim.id;expires=now+2400;lastRace=race.raceId??race;
      title.textContent=event.item==='missile'?'MISSILE HIT!':'BANANA HIT!';label.textContent=String(victim.name||'Rival');
      element.dataset.item=event.item;return true;
    },
    render(options){
      const {race,visible,now=performance.now()}=options;
      if(!visible||now>=expires||lastRace!==(race.raceId??race)||!race.racers.some(r=>r.id===victimId&&!r.finished))clear();
      const show=!!visible&&victimId!==null;document.body.dataset.hitCamera=String(show);
      inset.render({...options,visible:show});
    },
    clear,
    dispose(){clear();inset.dispose();}
  };
}
