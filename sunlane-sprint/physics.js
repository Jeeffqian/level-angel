import {KARTS, TOTAL_LAPS, RIVAL_NAMES, PASSIVE_NITRO_REGEN} from './config.js';
import {getTrack} from './track.js';
import {aiDifficulty,rivalInput} from './ai.js';
import {normalizeRivalSlots} from './single-player.js';
import {ITEM_SLOTS,resetItems,aiItemSlot,useRaceItem,tickRaceItems} from './item-rules.js';
import {resetDriverSkill,tickDriverSkills,useDriverSkill,aiUseDriverSkill,skillActive} from './driver-skills.js';

export const FIXED_DT=1/120;
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const neutral=()=>({throttle:false,brake:false,steer:0,drift:false,boost:false});

export class Race {
  constructor(selected=0,options={}){this.options=options;this.reset(selected);}
  reset(selected=0){
    this.track=getTrack(this.options.trackId);this.trackId=this.track.id;
    this.difficulty=aiDifficulty(this.options.difficulty);
    const roster=this.options.roster;this.multiplayer=Array.isArray(roster);
    const rivals=normalizeRivalSlots(this.options.rivalSlots,this.difficulty).map((slot,index)=>({...slot,index})).filter(slot=>slot.enabled);
    const count=this.multiplayer?6:1+rivals.length,playerGrid=Math.min(4,count-1);
    this.selected=selected;this.phase='countdown';this.countdown=3.5;this.time=0;this.finishCounter=0;this.events=[];
    this.racers=Array.from({length:count},(_,i)=>{
      const slot=i===0?playerGrid:(i<=playerGrid?i-1:i),s=-8-Math.floor(slot/2)*6,lateral=slot%2?2.6:-2.6;
      const rival=this.multiplayer?null:rivals[i-1],rivalSlot=rival?.index??i-1;
      const member=roster?.[i],p=this.track.sampleTrack(s,lateral),kart=member?member.kart:(i===0?selected:rivalSlot%KARTS.length);
      return {id:i,name:member?member.name:(this.multiplayer?RIVAL_NAMES[i%RIVAL_NAMES.length]:(i===0?'You':RIVAL_NAMES[rivalSlot])),player:this.multiplayer?!!member:i===0,
        rivalSlot:i===0||this.multiplayer?null:rivalSlot,aiDifficulty:rival?.difficulty??this.difficulty,
        memberId:member?.id??null,bot:this.multiplayer?!member:i!==0,avatar:member?.avatar??kart,kart,color:KARTS[kart].color,
        x:p.x,z:p.z,heading:p.heading,vx:0,vz:0,speed:0,s:this.track.wrapDistance(s),progress:s,
        gate:0,lap:1,lapTimes:[],lapStart:0,finished:false,finishTime:null,finishPlace:null,
        nitro:35,drifting:false,driftCharge:0,boosting:false,miniBoost:0,
        steer:0,collisionTimer:0,wallHits:0,kartHits:0,driftSeconds:0,boostSeconds:0,
        lane:(i%3-1)*2.7,stuck:0,wrongWay:false,rank:slot+1,
        items:Array(ITEM_SLOTS).fill(null),itemAcquiredAt:Array(ITEM_SLOTS).fill(0),shieldTime:0,itemBoostTime:0,hitTime:0,itemImmunity:0};
    });
    this.player=this.racers[0];
    if(!this.multiplayer&&Number.isInteger(this.options.avatar)&&this.options.avatar>=0&&this.options.avatar<5)this.player.avatar=this.options.avatar;
    this.racers.forEach(resetDriverSkill);
    if(this.track.shortcuts)for(const v of this.racers)Object.assign(v,{routeId:'main',progressRoute:'main',progressX:v.x,progressZ:v.z});
    resetItems(this,this.options.seed);
  }
  aiInput(v){
    const controls=rivalInput(this,v);return {...controls,itemSlot:aiItemSlot(this,v),skill:aiUseDriverSkill(this,v,controls)};
  }
  useItem(v=this.player,slot=0,targetId=undefined){return useRaceItem(this,v,slot,targetId);}
  useSkill(v=this.player){return useDriverSkill(this,v);}
  tick(dt,input=neutral()){
    this.events.length=0;
    if(this.phase==='countdown'){
      const old=Math.ceil(this.countdown);this.countdown-=dt;
      if(Math.ceil(this.countdown)!==old)this.events.push({type:'countdown',value:Math.ceil(this.countdown)});
      if(this.countdown<=0){this.phase='racing';this.events.push({type:'go'});}
      return;
    }
    if(this.phase!=='racing')return;
    this.time+=dt;
    tickDriverSkills(this,dt);
    for(const v of this.racers){
      if(v.finished)continue;
      const controls=typeof input==='function'?(input(v)??this.aiInput(v)):(v.player?input:this.aiInput(v));
      if(Number.isInteger(controls.itemSlot))this.useItem(v,controls.itemSlot);
      if(controls.skill===true)this.useSkill(v);
      this.drive(v,controls,dt);
    }
    for(let i=0;i<this.racers.length;i++)for(let j=i+1;j<this.racers.length;j++){
      const a=this.racers[i],b=this.racers[j];if(!a.finished&&!b.finished)this.collideKarts(a,b);
    }
    for(const v of this.racers){if(!v.finished){this.constrain(v);this.updateProgress(v);}}
    tickRaceItems(this,dt);
    const order=[...this.racers].sort((a,b)=>{
      if(a.finished&&b.finished)return a.finishPlace-b.finishPlace;
      if(a.finished)return -1;if(b.finished)return 1;return b.progress-a.progress;
    });
    order.forEach((v,i)=>v.rank=i+1);
    if(!this.multiplayer&&this.player.finished){this.phase='finished';this.events.push({type:'finish'});}
  }
  drive(v,input,dt){
    if(v.hitTime>0)input={throttle:false,brake:false,steer:0,drift:false,boost:false};
    const spec=KARTS[v.kart],speed=Math.max(0,v.speed),catwalk=skillActive(v,'catwalk'),overdrive=skillActive(v,'overdrive');
    v.collisionTimer=Math.max(0,v.collisionTimer-dt);v.miniBoost=Math.max(0,v.miniBoost-dt);
    v.steer+=(clamp(Number(input.steer)||0,-1,1)-v.steer)*(1-Math.exp(-spec.steerResponse*dt));
    const drift=!!input.drift&&Math.abs(v.steer)>.12&&speed>10;
    if(v.drifting&&!drift){
      if(v.driftCharge>.25){v.nitro=clamp(v.nitro+v.driftCharge*24,0,100);v.miniBoost=(.35+v.driftCharge*.65)*spec.drift.miniBoostDuration;this.events.push({type:'drift-release',id:v.id});}
      v.driftCharge=0;
    }
    v.drifting=drift;
    if(drift){v.driftSeconds+=dt;v.driftCharge=clamp(v.driftCharge+dt*spec.drift.chargeRate*(catwalk?1.65:1),0,1);v.nitro=clamp(v.nitro+dt*9,0,100);}
    else if(speed>5)v.nitro=clamp(v.nitro+dt*PASSIVE_NITRO_REGEN,0,100);
    const wasBoost=v.boosting;
    v.boosting=!!input.boost&&v.nitro>1&&speed>2&&!input.brake;
    if(v.boosting){if(!overdrive)v.nitro=Math.max(0,v.nitro-dt*spec.nitro.drain);v.boostSeconds+=dt;if(!wasBoost)this.events.push({type:'boost',id:v.id});}
    const powered=v.boosting||v.miniBoost>0||v.itemBoostTime>0||overdrive;
    const maxSpeed=spec.speed*(powered?spec.nitro.speedMultiplier:1)*(v.skillSlowTime>0?.78:1), acceleration=spec.acceleration*(powered?spec.nitro.accelerationMultiplier:1);
    if(v.speed>maxSpeed)v.speed-=Math.min(v.speed-maxSpeed,dt*13);
    // Braking wins even during a drift reward or item turbo; its timer still runs.
    else if((input.throttle||powered)&&!input.brake)v.speed=Math.min(maxSpeed,v.speed+acceleration*dt);
    else v.speed-=Math.sign(v.speed)*Math.min(Math.abs(v.speed),dt*(3+speed*.05));
    if(input.brake)v.speed-=dt*(v.speed>0?spec.braking:5);
    if(drift)v.speed-=dt*spec.drift.speedLoss*(catwalk?.45:1);
    v.speed=clamp(v.speed,-7,spec.speed*spec.nitro.speedMultiplier*(v.skillSlowTime>0?.78:1));
    // Right input turns clockwise from behind; handling diminishes at high speed.
    const turnRate=spec.handling*(catwalk?1.12:1)*(.3+.7*clamp(speed/18,0,1))/(1+speed*.013)*(drift?spec.drift.turnMultiplier:1);
    v.heading-=v.steer*turnRate*dt*clamp(Math.abs(v.speed)/5,0,1)*Math.sign(v.speed||1);
    const grip=drift?spec.drift.grip:spec.grip;
    const blend=1-Math.exp(-grip*dt);
    v.vx+=(Math.sin(v.heading)*v.speed-v.vx)*blend;
    v.vz+=(Math.cos(v.heading)*v.speed-v.vz)*blend;
    v.x+=v.vx*dt;v.z+=v.vz*dt;
    this.constrain(v);
    if(!v.player||v.aiControlled){v.stuck=v.speed<3?v.stuck+dt:0;if(v.stuck>3)this.recover(v);}
  }
  constrain(v){
    const p=(this.track.nearestRoad||this.track.nearestTrack)(v.x,v.z,v.s),limit=(p.roadWidth||this.track.ROAD_WIDTH)/2-.35;
    if(this.track.shortcuts)v.routeId=p.routeId;
    if(Math.abs(p.lateral)>limit){
      const side=Math.sign(p.lateral),outward=(v.vx*p.nx+v.vz*p.nz)*side;
      v.x=p.x+p.nx*limit*side;v.z=p.z+p.nz*limit*side;
      if(outward>0){v.vx-=p.nx*side*outward*1.15;v.vz-=p.nz*side*outward*1.15;v.speed*=clamp(1-outward*.018,.5,1);}
      if(outward>3&&v.collisionTimer===0){v.wallHits++;v.collisionTimer=.45;this.events.push({type:'hit',id:v.id});}
      // Gentle tangential deflection helps a glancing impact keep moving.
      const tangentHeading=Math.atan2(p.tx,p.tz),facing=Math.cos(angleDiff(v.heading,tangentHeading));
      const wallHeading=facing>=0?tangentHeading:tangentHeading+Math.PI;
      v.heading+=angleDiff(wallHeading,v.heading)*.035;
    }
  }
  collideKarts(a,b){
    // Capsule footprints fit a kart's long body without overly wide side contacts.
    if(Math.hypot(a.x-b.x,a.z-b.z)>3.7)return;
    const half=.55,ax=Math.sin(a.heading)*half,az=Math.cos(a.heading)*half,bx=Math.sin(b.heading)*half,bz=Math.cos(b.heading)*half;
    const aa={x:a.x-ax,z:a.z-az},ab={x:a.x+ax,z:a.z+az},ba={x:b.x-bx,z:b.z-bz},bb={x:b.x+bx,z:b.z+bz};
    const project=(p,q,r)=>{const x=r.x-q.x,z=r.z-q.z,t=clamp(((p.x-q.x)*x+(p.z-q.z)*z)/(x*x+z*z),0,1);return {x:q.x+t*x,z:q.z+t*z};};
    const pairs=[[aa,project(aa,ba,bb)],[ab,project(ab,ba,bb)],[project(ba,aa,ab),ba],[project(bb,aa,ab),bb]];
    let dx=0,dz=0,d=Infinity;for(const [p,q]of pairs){const x=q.x-p.x,z=q.z-p.z,dist=Math.hypot(x,z);if(dist<d){d=dist;dx=x;dz=z;}}
    const cross=(x,z,u,v)=>x*v-z*u,den=cross(ab.x-aa.x,ab.z-aa.z,bb.x-ba.x,bb.z-ba.z);
    if(Math.abs(den)>.0001){const t=cross(ba.x-aa.x,ba.z-aa.z,bb.x-ba.x,bb.z-ba.z)/den,u=cross(ba.x-aa.x,ba.z-aa.z,ab.x-aa.x,ab.z-aa.z)/den;if(t>=0&&t<=1&&u>=0&&u<=1)d=0;}
    const min=2.5;if(d>=min)return;
    let nx,nz;if(d<.0001){const centers=Math.hypot(b.x-a.x,b.z-a.z);nx=centers>.0001?(b.x-a.x)/centers:1;nz=centers>.0001?(b.z-a.z)/centers:0;}else{nx=dx/d;nz=dz/d;}
    const push=(min-d)*.5;
    a.x-=nx*push;a.z-=nz*push;b.x+=nx*push;b.z+=nz*push;
    const closing=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
    if(closing>0){const impulse=closing*.65;a.vx-=nx*impulse;a.vz-=nz*impulse;b.vx+=nx*impulse;b.vz+=nz*impulse;
      a.speed*=clamp(1-closing*.009,.78,1);b.speed*=clamp(1-closing*.005,.88,1);
      for(const v of [a,b])if(v.collisionTimer===0&&closing>2){v.kartHits++;v.collisionTimer=.5;this.events.push({type:'hit',id:v.id});}
    }
  }
  updateProgress(v){
    const {trackLength}=this.track,nearestTrack=this.track.nearestRoad||this.track.nearestTrack;
    const p=nearestTrack(v.x,v.z,v.s);let delta=p.s-v.s;
    if(delta>trackLength/2)delta-=trackLength;if(delta<-trackLength/2)delta+=trackLength;
    // Reject jumps. A shared-road fork can change centerline projection while
    // physical movement stays small; only the validated junction allows that.
    if(Math.abs(delta)<4||this.track.validJunctionTransition?.(v,p,delta)){
      const before=v.progress;v.progress+=delta;
      const next=v.gate*(trackLength/4);
      if(before<=next&&v.progress>=next&&delta>0){
        v.gate++;
        if(v.gate>1&&(v.gate-1)%4===0){
          v.lapTimes.push(this.time-v.lapStart);v.lapStart=this.time;
          if(v.lapTimes.length===TOTAL_LAPS){v.finished=true;v.finishTime=this.time;v.finishPlace=++this.finishCounter;v.speed=0;v.vx=0;v.vz=0;}
          else {v.lap=v.lapTimes.length+1;this.events.push({type:'lap',id:v.id,lap:v.lap});}
        }
      }
    }
    v.s=p.s;
    if(this.track.shortcuts)Object.assign(v,{progressRoute:p.routeId,progressX:v.x,progressZ:v.z});
    v.wrongWay=v.speed>4&&Math.cos(angleDiff(v.heading,Math.atan2(p.tx,p.tz)))<-.35;
  }
  recover(v=this.player){
    const width=this.track.shortcuts?.find(s=>s.id===v.routeId)?.width||this.track.ROAD_WIDTH;
    const p=(this.track.sampleRoad||this.track.sampleTrack)(v.s,v.player?0:clamp(v.lane,-width/2+1.4,width/2-1.4),v.routeId);
    v.x=p.x;v.z=p.z;v.heading=p.heading;v.speed=0;v.vx=0;v.vz=0;v.drifting=false;v.driftCharge=0;v.boosting=false;v.stuck=0;
    if(this.track.shortcuts)Object.assign(v,{progressRoute:v.routeId,progressX:v.x,progressZ:v.z});
    v.nitro=Math.max(0,v.nitro-10);this.events.push({type:'recover',id:v.id});
  }
  get results(){return [...this.racers].sort((a,b)=>a.rank-b.rank).map(v=>({name:v.name,time:v.finishTime,kart:KARTS[v.kart].name,player:v.player}));}
}
