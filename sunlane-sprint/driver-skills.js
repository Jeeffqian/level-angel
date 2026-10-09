// Shared, deterministic driver abilities. The server owns these values online.
export const INITIAL_SKILL_COOLDOWN=8;
export const DRIVER_SKILLS=Object.freeze([
  {id:'overdrive',name:'Overdrive',shortDescription:'Free burst of speed',description:'Boost for 2.2s without spending nitro. Save it for a clear exit; boosts do not stack.',cooldown:22,duration:2.2,color:'#ef5663',icon:'overdrive'},
  {id:'catwalk',name:'Catwalk',shortDescription:'Charge stronger drifts',description:'For 4s, drift charge builds 65% faster, steering improves 12%, and drifting loses less speed.',cooldown:20,duration:4,color:'#bb8cff',icon:'catwalk'},
  {id:'emp',name:'EMP Pulse',shortDescription:'Disrupt nearby rivals',description:'Clear enemy hazards within 14m and slow rivals within 12m for 1.5s. Shields block the pulse.',cooldown:26,duration:.8,color:'#b4ef50',icon:'emp'},
  {id:'guardian',name:'Guardian',shortDescription:'Cleanse and protect',description:'Clear a spin-out and protect against items and EMP for 3.5s. Walls and kart collisions still matter.',cooldown:26,duration:3.5,color:'#ffcf52',icon:'guardian'},
  {id:'magnet',name:'Magnet Run',shortDescription:'Reach more item boxes',description:'For 4s, collect item boxes within 6m and gain 12 nitro per pickup. You still need an empty item slot.',cooldown:24,duration:4,color:'#68dfff',icon:'magnet'},
].map(Object.freeze));
export const getDriverSkill=avatar=>DRIVER_SKILLS[Number.isInteger(avatar)?avatar:0]||DRIVER_SKILLS[0];
export const skillActive=(racer,id)=>!!racer&&racer.skillTime>0&&getDriverSkill(racer.avatar).id===id;
export function getDriverSkillState(racer,phase='racing'){
  const skill=getDriverSkill(racer?.avatar),cooldownRemaining=Math.max(0,racer?.skillCooldown||0),activeRemaining=Math.max(0,racer?.skillTime||0);
  const reason=phase!=='racing'||racer?.finished?'RACE ONLY':activeRemaining>0?'ACTIVE':cooldownRemaining>0?'CHARGING':racer?.hitTime>0&&skill.id!=='guardian'?'SPUN OUT':'';
  return {...skill,cooldownRemaining,activeRemaining,ready:!!racer&&!reason,reason};
}
export function resetDriverSkill(racer){Object.assign(racer,{skillCooldown:INITIAL_SKILL_COOLDOWN,skillTime:0,skillSlowTime:0,skillUses:0,skillOriginX:racer.x,skillOriginZ:racer.z});}
export function tickDriverSkills(race,dt){
  for(const racer of race.racers)for(const key of ['skillCooldown','skillTime','skillSlowTime'])racer[key]=Math.max(0,(racer[key]||0)-dt);
}
export function useDriverSkill(race,racer){
  if(!racer||!race.racers.includes(racer)||!getDriverSkillState(racer,race.phase).ready)return false;
  const skill=getDriverSkill(racer.avatar);
  racer.skillCooldown=skill.cooldown;racer.skillTime=skill.duration;racer.skillUses=(racer.skillUses||0)+1;racer.skillOriginX=racer.x;racer.skillOriginZ=racer.z;
  if(skill.id==='guardian'){racer.hitTime=0;racer.skillSlowTime=0;}
  if(skill.id==='emp'){
    race.hazards=race.hazards.filter(h=>h.ownerId===racer.id||Math.hypot(h.x-racer.x,h.z-racer.z)>14);
    for(const target of race.racers){
      if(target===racer||target.finished||Math.hypot(target.x-racer.x,target.z-racer.z)>12||target.itemImmunity>0)continue;
      if(skillActive(target,'guardian')||target.shieldTime>0){
        if(!skillActive(target,'guardian'))target.shieldTime=0;
        target.itemImmunity=Math.max(target.itemImmunity||0,.65);
        race.events.push({type:'skill-block',id:target.id,ownerId:racer.id,skill:'emp'});continue;
      }
      target.skillSlowTime=1.5;target.speed*=.78;target.vx*=.78;target.vz*=.78;target.itemImmunity=Math.max(target.itemImmunity||0,.65);
      race.events.push({type:'skill-hit',id:target.id,ownerId:racer.id,skill:'emp'});
    }
  }
  race.events.push({type:'skill-use',id:racer.id,skill:skill.id});return true;
}

/** Bots get intentions, not hidden bonuses: the same activation path checks them. */
export function aiUseDriverSkill(race,racer,controls){
  if(!getDriverSkillState(racer,race.phase).ready)return false;
  const skill=getDriverSkill(racer.avatar),threat=race.hazards.some(h=>h.ownerId!==racer.id&&Math.hypot(h.x-racer.x,h.z-racer.z)<(h.type==='missile'?24:7));
  if(skill.id==='guardian')return racer.hitTime>0||racer.skillSlowTime>0||threat;
  if(skill.id==='emp')return threat||race.racers.some(r=>r!==racer&&!r.finished&&Math.hypot(r.x-racer.x,r.z-racer.z)<11&&r.progress>=racer.progress-4);
  if(skill.id==='magnet')return racer.items.includes(null)&&race.itemBoxes.some(b=>b.readyAt<=race.time&&race.track.wrapDistance(b.s-racer.s)<Math.max(8,racer.speed*2));
  if(skill.id==='catwalk')return controls.drift&&racer.speed>12;
  return racer.speed>14&&!controls.brake&&Math.abs(controls.steer)<.18&&!racer.boosting&&racer.miniBoost<=0&&racer.itemBoostTime<=0;
}
