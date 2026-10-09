export const KARTS = [
  { id:'comet',name:'Comet',tag:'THE ALL-ROUNDER',role:'All-rounder',color:'#ef293b',accent:'#f3f7ff',
    description:'Predictable steering. A little of everything.',strength:'Balanced pace, grip and boost.',tradeoff:'Specialists have a stronger signature move.',drivingTip:'Keep a clean line and boost out of corners.',
    speed:37.5,acceleration:16.5,handling:1.90,grip:10.5,steerResponse:12,braking:27,
    drift:{grip:2.9,turnMultiplier:1.38,chargeRate:.68,speedLoss:1.9,miniBoostDuration:1},
    nitro:{speedMultiplier:1.40,accelerationMultiplier:1.8,drain:30}},
  { id:'vesper',name:'Vesper',tag:'THE DRIFT SPECIALIST',role:'Drift specialist',color:'#9460df',accent:'#f5edff',
    description:'Link your slides. Turn every bend into a boost.',strength:'Fastest drift charge and longest drift-release boost.',tradeoff:'Lower straight-line speed and a loose chassis.',drivingTip:'Hold a controlled drift, then release as the road opens.',
    speed:36.5,acceleration:15.8,handling:2.03,grip:9.2,steerResponse:13.5,braking:27,
    drift:{grip:3.25,turnMultiplier:1.50,chargeRate:.88,speedLoss:1.2,miniBoostDuration:1.18},
    nitro:{speedMultiplier:1.40,accelerationMultiplier:1.8,drain:29}},
  { id:'circuit',name:'Circuit',tag:'THE QUICK STARTER',role:'Launch specialist',color:'#91cd29',accent:'#f3ffe6',
    description:'First off the grid. First back up to speed.',strength:'Fastest acceleration and crisp steering response.',tradeoff:'Low top speed and short nitro bursts.',drivingTip:'Recover quickly from hits and attack corner exits.',
    speed:35.5,acceleration:20,handling:1.98,grip:11.8,steerResponse:15,braking:28,
    drift:{grip:3.25,turnMultiplier:1.32,chargeRate:.61,speedLoss:2.4,miniBoostDuration:.90},
    nitro:{speedMultiplier:1.36,accelerationMultiplier:1.95,drain:33}},
  { id:'bumble',name:'Bumble',tag:'THE CORNER KING',role:'Corner specialist',color:'#ffc843',accent:'#fff5d6',
    description:'Hug the inside. Make the tight line yours.',strength:'Sharpest turns, strongest road grip and braking.',tradeoff:'Limited straight-line pace and slower drift rewards.',drivingTip:'Turn in tightly; save nitro for the exit.',
    speed:35.8,acceleration:17.2,handling:2.24,grip:13.5,steerResponse:14,braking:32,
    drift:{grip:3.8,turnMultiplier:1.25,chargeRate:.60,speedLoss:2.5,miniBoostDuration:.88},
    nitro:{speedMultiplier:1.38,accelerationMultiplier:1.7,drain:31}},
  { id:'manta',name:'Manta',tag:'THE SPEED MACHINE',role:'Speed specialist',color:'#26aee8',accent:'#e5fcff',
    description:'Build momentum. Own the open straight.',strength:'Highest top speed and longest full-tank nitro.',tradeoff:'Slow launch, wide turns and weaker grip.',drivingTip:'Brake early and straighten up before boosting.',
    speed:41,acceleration:13.7,handling:1.62,grip:8.6,steerResponse:9.5,braking:24,
    drift:{grip:2.45,turnMultiplier:1.32,chargeRate:.57,speedLoss:2.8,miniBoostDuration:.82},
    nitro:{speedMultiplier:1.43,accelerationMultiplier:1.7,drain:26}},
];

export const PASSIVE_NITRO_REGEN=1.6;
// Garage comparisons come from the same tuning used by solo, bots and the server.
// A higher rating always means more capability; 1–5 spans this five-kart lineup.
const STAT_AXES=[
  {id:'speed',label:'Top speed',shortLabel:'SPD',score:k=>k.speed,value:k=>`${Math.round(k.speed*3.6)} km/h`,description:'Unboosted speed on a clear straight.'},
  {id:'acceleration',label:'Acceleration',shortLabel:'ACC',score:k=>k.acceleration,value:k=>`${(100/3.6/k.acceleration).toFixed(2)} s`,description:'0–100 km/h from rest, without boost or contact.'},
  {id:'handling',label:'Handling',shortLabel:'HND',score:k=>k.handling,value:(_k,rating)=>`${rating.toFixed(1)} / 5`,description:'Steering authority compared with this lineup. Road grip and response also affect feel.'},
  {id:'drift',label:'Drift charge',shortLabel:'DRIFT',score:k=>k.drift.chargeRate,value:k=>`${(1/k.drift.chargeRate).toFixed(2)} s`,description:'Time to fully charge a sustained drift; a higher rating means faster charge.'},
  {id:'nitro',label:'Nitro duration',shortLabel:'NITRO',score:k=>1/(k.nitro.drain-PASSIVE_NITRO_REGEN),value:k=>`${(99/(k.nitro.drain-PASSIVE_NITRO_REGEN)).toFixed(2)} s`,description:'Approximate full-tank duration on a straight, without drifting or pickups.'},
];
export function getKartStats(kart){
  return STAT_AXES.map(({score,value,...axis})=>{
    const values=KARTS.map(score),min=Math.min(...values),max=Math.max(...values);
    const rating=1+4*Math.max(0,Math.min(1,(score(kart)-min)/(max-min||1)));
    return {...axis,rating,value:value(kart,rating)};
  });
}
export const AVATARS = [
  { id: 'ace', name: 'Ace', color: '#ef293b', tag: 'BORN TO RACE', description: 'A fearless racer with a sunny streak.' },
  { id: 'luna', name: 'Luna', color: '#9460df', tag: 'CAT-LIKE REFLEXES', description: 'Always curious. Always one corner ahead.' },
  { id: 'bolt', name: 'Bolt', color: '#91cd29', tag: 'FULLY CHARGED', description: 'A friendly robot with racing in its circuits.' },
  { id: 'bao', name: 'Bao', color: '#ffc843', tag: 'PANDA POWER', description: 'A cheerful panda with a competitive side.' },
  { id: 'skye', name: 'Skye', color: '#26aee8', tag: 'CHASE THE HORIZON', description: 'Cool confidence, from start to finish.' },
];
export const TOTAL_LAPS = 3;
export const AI_DIFFICULTIES = [
  {id:'easy',name:'Easy',description:'Relaxed rivals with more room to learn the track.'},
  {id:'normal',name:'Normal',description:'Quick rivals that drift, boost and look for a clean pass.'},
  {id:'hard',name:'Hard',description:'Full-pace rivals using the same kart limits as you.'},
];
export const RIVAL_NAMES = ['Mochi', 'Pip', 'Nova', 'Ziggy', 'Coco'];
