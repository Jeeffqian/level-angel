// Shared by the browser and authoritative server. No rendering or wall clock.
import {skillActive} from './driver-skills.js';
export const ITEM_TYPES=Object.freeze(['banana','missile','shield','turbo']);
export const ITEM_SLOTS=3;
export const MAX_HAZARDS=64;
export const MISSILE_TARGET_RANGE=100;
export const MISSILE_SPEED=72;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const forward=(track,a,b)=>track.wrapDistance(b-a);
function random(race){race.itemRandomState=(Math.imul(race.itemRandomState,1664525)+1013904223)>>>0;return race.itemRandomState/4294967296;}
export function createItemBoxes(track){
  return (track.itemFractions||[.065,.30,.55,.80]).flatMap((fraction,row)=>[-.28,0,.28].map((lane,column)=>{
    const s=track.trackLength*fraction,p=track.sampleTrack(s,track.ROAD_WIDTH*lane);
    return {id:`box-${row}-${column}`,x:p.x,z:p.z,s,readyAt:0};
  }));
}
export function resetItems(race,seed=0x51a7){
  race.itemRandomState=Number(seed)>>>0;race.nextHazardId=1;
  race.itemBoxes=createItemBoxes(race.track);race.hazards=[];
}
export function validMissileTarget(shooter,target){
  return !!shooter&&!!target&&target.id!==shooter.id&&!target.finished&&
    Number.isFinite(target.x)&&Number.isFinite(target.z)&&
    Math.hypot(target.x-shooter.x,target.z-shooter.z)<=MISSILE_TARGET_RANGE&&
    // Acquisition follows the kart's nose, including when driving wrong-way.
    (target.x-shooter.x)*Math.sin(shooter.heading)+(target.z-shooter.z)*Math.cos(shooter.heading)>1e-6;
}
export function selectMissileTarget(race,shooter){
  let best=null,distance=Infinity;
  for(const target of race?.racers??[]){
    if(!validMissileTarget(shooter,target))continue;
    const d=Math.hypot(target.x-shooter.x,target.z-shooter.z);
    if(d<distance){best=target;distance=d;}
  }
  return best;
}
export function aiItemSlot(race,v){
  if(v.hitTime>0)return null;
  for(let slot=0;slot<ITEM_SLOTS;slot++){
    const item=v.items[slot],held=race.time-v.itemAcquiredAt[slot];
    if(!item||held<({easy:2.2,normal:1.4,hard:.8}[v.aiDifficulty]||1.4))continue;
    if(item==='missile'&&selectMissileTarget(race,v))return slot;
    if(item==='banana'&&(race.racers.some(r=>r.id!==v.id&&!r.finished&&forward(race.track,r.s,v.s)<30)||held>3))return slot;
    if(item==='shield'&&!v.shieldTime)return slot;
    if(item==='turbo'&&v.speed>12&&!v.itemBoostTime)return slot;
  }
  return null;
}
export function useRaceItem(race,v,slot=0,targetId=undefined){
  if(race.phase!=='racing'||!v||v.finished||v.hitTime>0||!Number.isInteger(slot)||slot<0||slot>=ITEM_SLOTS||!ITEM_TYPES.includes(v.items[slot]))return false;
  const type=v.items[slot];
  if(targetId!==undefined&&(type!=='missile'||!Number.isInteger(targetId)))return false;
  const target=type==='missile'?(targetId===undefined?selectMissileTarget(race,v):race.racers.find(r=>r.id===targetId)):null;
  if(type==='missile'&&!validMissileTarget(v,target))return false;
  v.items[slot]=null;v.itemAcquiredAt[slot]=0;
  if(type==='shield')v.shieldTime=6;
  else if(type==='turbo')v.itemBoostTime=2.4;
  else {
    if(race.hazards.length>=MAX_HAZARDS)race.hazards.shift();
    const behind=type==='banana';
    const nearest=race.track.nearestRoad||race.track.nearestTrack;
    const p=behind?nearest(v.x-Math.sin(v.heading)*3.8,v.z-Math.cos(v.heading)*3.8,v.s):nearest(v.x,v.z,v.s);
    const width=p.roadWidth||race.track.ROAD_WIDTH,s=race.track.wrapDistance(p.s),lateral=clamp(p.lateral,-width*.43,width*.43);
    const position=behind?(race.track.sampleRoad||race.track.sampleTrack)(s,lateral,p.routeId):{x:v.x,z:v.z,heading:Math.atan2(target.x-v.x,target.z-v.z)};
    race.hazards.push({id:race.nextHazardId++,type,ownerId:v.id,x:position.x,z:position.z,heading:position.heading,
      s,lateral,targetId:behind?null:target.id,age:0,life:behind?22:4.5});
  }
  race.events.push({type:'item-use',id:v.id,item:type,slot});return true;
}
function hit(race,v,hazard){
  if(v.itemImmunity>0)return;
  const event={id:v.id,ownerId:hazard.ownerId,item:hazard.type,hazardId:hazard.id,x:v.x,z:v.z,heading:v.heading};
  if(skillActive(v,'guardian')||v.shieldTime>0){if(!skillActive(v,'guardian'))v.shieldTime=0;v.itemImmunity=.65;race.events.push({type:'item-block',...event});return;}
  v.hitTime=.85;v.itemImmunity=2;v.itemBoostTime=0;v.miniBoost=0;v.boosting=false;v.drifting=false;v.driftCharge=0;
  v.skillTime=0;
  v.speed*=.32;v.vx*=.32;v.vz*=.32;
  race.events.push({type:'item-hit',...event});
}
function segmentDistance(x,z,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az,t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1),0,1);
  return Math.hypot(x-ax-t*dx,z-az-t*dz);
}
export function tickRaceItems(race,dt){
  for(const v of race.racers){
    for(const key of ['shieldTime','itemBoostTime','hitTime','itemImmunity'])v[key]=Math.max(0,(v[key]||0)-dt);
    const slot=v.items.indexOf(null);
    if(v.finished||slot<0)continue;
    // One shared cooldown per physical box: simultaneous contacts cannot duplicate a pickup.
    for(const box of race.itemBoxes){
      if(box.readyAt>race.time||Math.hypot(box.x-v.x,box.z-v.z)>(skillActive(v,'magnet')?6:1.85))continue;
      box.readyAt=race.time+5;v.items[slot]=ITEM_TYPES[Math.floor(random(race)*ITEM_TYPES.length)];v.itemAcquiredAt[slot]=race.time;
      if(skillActive(v,'magnet'))v.nitro=clamp(v.nitro+12,0,100);
      race.events.push({type:'item-pickup',id:v.id,item:v.items[slot],slot,boxId:box.id});break;
    }
  }
  for(const h of race.hazards){
    const ax=h.x,az=h.z;h.age+=dt;h.life-=dt;if(h.life<=0)continue;
    if(h.type==='missile'){
      const target=race.racers.find(v=>v.id===h.targetId&&!v.finished);
      if(target){
        const distance=Math.hypot(target.x-h.x,target.z-h.z),lead=distance<8?0:Math.min(.22,distance/MISSILE_SPEED*.3);
        const desired=Math.atan2(target.x+(target.vx||0)*lead-h.x,target.z+(target.vz||0)*lead-h.z);
        const turn=Math.atan2(Math.sin(desired-h.heading),Math.cos(desired-h.heading));
        h.heading+=clamp(turn,-6*dt,6*dt);
      }
      h.x+=Math.sin(h.heading)*MISSILE_SPEED*dt;h.z+=Math.cos(h.heading)*MISSILE_SPEED*dt;
      // Track coordinates are diagnostics only; they never constrain the flight.
      const p=(race.track.nearestRoad||race.track.nearestTrack)(h.x,h.z,h.s);h.s=p.s;h.lateral=p.lateral;
    }
    for(const v of race.racers){
      if(v.finished||(v.id===h.ownerId&&(h.type==='missile'||h.age<1.2)))continue;
      if(segmentDistance(v.x,v.z,ax,az,h.x,h.z)>(h.type==='missile'?1.75:1.5))continue;
      hit(race,v,h);h.life=0;break;
    }
  }
  race.hazards=race.hazards.filter(h=>h.life>0);
}
