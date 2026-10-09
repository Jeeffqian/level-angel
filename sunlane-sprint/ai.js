import {KARTS} from './config.js';
import {skillActive} from './driver-skills.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const settings={easy:{pace:.82,bend:.38,boost:38},normal:{pace:.98,bend:.24,boost:22},hard:{pace:1,bend:.16,boost:16}};
export const aiDifficulty=value=>Object.hasOwn(settings,value)?value:'normal';

/** Driving intentions only: the same engine, grip, collisions and nitro apply. */
export function rivalInput(race,v){
  const {trackLength}=race.track;
  const branch=race.track.shortcuts?.[0],level=aiDifficulty(v.aiDifficulty??race.difficulty);
  if(branch){
    if(v.s>branch.exitS+8||v.s<branch.entryS-90)v.aiRoute=null;
    const wantsArch=level==='hard'||level==='normal'&&(v.id+v.lap)%2===0;
    if(v.routeId===branch.id||(wantsArch&&v.s>=branch.entryS-65&&v.s<branch.entryS))v.aiRoute=branch.id;
  }
  const route=branch&&(v.routeId===branch.id||v.aiRoute===branch.id)?branch.id:'main';
  const sampleTrack=route==='main'?race.track.sampleTrack:(s,lateral=0)=>race.track.sampleAhead(v.s,s-v.s,lateral,route);
  const difficulty=settings[aiDifficulty(v.aiDifficulty??race.difficulty)],spec=KARTS[v.kart],speed=Math.max(0,v.speed);
  const here=sampleTrack(v.s),ahead=sampleTrack(v.s+22),far=sampleTrack(v.s+44);
  const signedBend=angle(ahead.heading,here.heading),bend=Math.abs(signedBend);
  const futureBend=Math.abs(angle(far.heading,ahead.heading));
  let lane=v.lane+clamp(signedBend*2.2,-1.2,1.2);
  // Pass on a deliberate lane, rather than nudging steering into the rival.
  for(const other of race.racers){
    if(other===v||other.finished)continue;
    const gap=((other.s-v.s)%trackLength+trackLength)%trackLength;
    if(gap<=0||gap>15||other.speed>speed+2)continue;
    const lateral=(other.x-here.x)*here.nx+(other.z-here.z)*here.nz;
    if(Math.abs(lateral-lane)<2.8){
      const side=v.lane===0?(v.id%2?1:-1):Math.sign(v.lane);
      lane=clamp(lateral+side*3.4,-4.8,4.8);break;
    }
  }
  if(route!=='main')lane=clamp(lane,-branch.width/2+1.8,branch.width/2-1.8);
  // Slew the passing line so a close rival cannot flip the target each frame.
  const last=v.aiLane??v.lane;
  v.aiLane=last+clamp(lane-last,-.012,.012);
  const aim=sampleTrack(v.s+10+speed*.6,v.aiLane);
  const error=angle(Math.atan2(aim.x-v.x,aim.z-v.z),v.heading);
  const steer=clamp(-error*2.05,-1,1);
  const drift=bend>.30&&bend<(spec.handling<1.8?.48:.88)&&Math.abs(steer)>.35&&speed>19;
  const safeStraight=bend<.16&&futureBend<.32&&Math.abs(error)<.13;
  const boost=safeStraight&&v.nitro>(v.boosting?2:difficulty.boost)&&speed>20;
  const powered=boost||v.miniBoost>0||v.itemBoostTime>0||skillActive(v,'overdrive');
  const brakingBend=Math.max(bend,futureBend*.8);
  const cornerCaution=1.9/spec.handling;
  const target=spec.speed*difficulty.pace*clamp(1-brakingBend*difficulty.bend*cornerCaution,.64,1)*(powered&&brakingBend<.7?spec.nitro.speedMultiplier:1);
  // Mini boosts and item turbos accelerate through drive(); don't fight them with
  // the ordinary cruising-speed brake. Brake only if the corner needs it.
  const emergency=brakingBend>.7||Math.abs(error)>.75;
  const brake=!boost&&speed>target+2&&(!powered||emergency);
  return {throttle:!brake&&speed<target,brake,steer,drift,boost};
}
