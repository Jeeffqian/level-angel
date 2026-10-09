// Pure route geometry shared by the browser and authoritative game server.
// Branch distance maps continuously onto the replaced main-road distance.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const control=[[0,-178],[130,-178],[214,-164],[239,-114],[288,-78],[320,-32],[320,38],[285,85],[239,116],[210,164],[115,180],[0,184],[-120,180],[-220,160],[-254,102],[-254,20],[-255,-85],[-220,-149],[-130,-178]];
function openRoad(knots,entryS,exitS,width){
  const points=[],count=320;
  const cat=(a,b,c,d,t)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
  for(let i=0;i<=count;i++){
    const q=i/count*(knots.length-1),j=Math.min(knots.length-2,Math.floor(q)),t=q-j;
    const p=[-1,0,1,2].map(k=>knots[clamp(j+k,0,knots.length-1)]);
    const x=cat(p[0][0],p[1][0],p[2][0],p[3][0],t),z=cat(p[0][1],p[1][1],p[2][1],p[3][1],t),prev=points.at(-1);
    points.push({x,z,d:prev?prev.d+Math.hypot(x-prev.x,z-prev.z):0});
  }
  const length=points.at(-1).d,mainLength=exitS-entryS,savedDistance=mainLength-length;
  const progress=d=>{const t=clamp(d/length,0,1);return entryS+d+savedDistance*t*t*(3-2*t);};
  const physical=s=>{let a=0,b=length;for(let n=0;n<24;n++){const mid=(a+b)/2;if(progress(mid)<s)a=mid;else b=mid;}return (a+b)/2;};
  for(const p of points)p.s=progress(p.d);
  function sample(distance,lateral=0){
    const d=clamp(distance,0,length);let lo=0,hi=count;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].d<=d)lo=mid;else hi=mid;}
    const a=points[lo],b=points[lo+1],len=b.d-a.d,t=(d-a.d)/len,tx=(b.x-a.x)/len,tz=(b.z-a.z)/len;
    return {x:a.x+(b.x-a.x)*t+tz*lateral,z:a.z+(b.z-a.z)*t-tx*lateral,tx,tz,nx:tz,nz:-tx,heading:Math.atan2(tx,tz),s:progress(d),d,routeId:'wall-arch',roadWidth:width};
  }
  function nearest(x,z,hintS=null){
    let result=null,best=Infinity;
    for(let i=0;i<count;i++){
      const a=points[i],b=points[i+1];if(hintS!==null&&Math.abs(a.s-hintS)>70)continue;
      const dx=b.x-a.x,dz=b.z-a.z,len=b.d-a.d,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(len*len),0,1),px=a.x+t*dx,pz=a.z+t*dz,d2=(x-px)**2+(z-pz)**2;
      if(d2<best){best=d2;const d=a.d+t*len;result={x:px,z:pz,tx:dx/len,tz:dz/len,nx:dz/len,nz:-dx/len,s:progress(d),d,lateral:((x-px)*dz-(z-pz)*dx)/len,distance:Math.sqrt(d2),routeId:'wall-arch',roadWidth:width};}
    }
    return result;
  }
  points.forEach(Object.freeze);
  return Object.freeze({id:'wall-arch',name:'East Gate Arch',width,points:Object.freeze(points),entryS,exitS,length,mainLength,savedDistance,sample,nearest,physical});
}

export function createCityCircuit(circuit,targetLength){
  const raw=circuit('','','',control,{count:2600}),scale=targetLength/raw.trackLength;
  const main=circuit('changan-city',"Chang'an Citadel",'Ancient city walls, lantern streets & a gate-arch shortcut',control.map(([x,z])=>[x*scale,z*scale]),{count:2600});
  const entry=main.nearestTrack(239*scale,-114*scale),exit=main.nearestTrack(239*scale,116*scale);
  const branch=openRoad([[entry.x,entry.z],[253*scale,-87*scale],[239*scale,-45*scale],[239*scale,45*scale],[253*scale,89*scale],[exit.x,exit.z]],entry.s,exit.s,10);
  const shortcuts=Object.freeze([branch]);
  function nearestRoad(x,z,hintS=null){
    const base=main.nearestTrack(x,z,hintS),candidate=branch.nearest(x,z,hintS===null?null:main.wrapDistance(hintS));
    base.routeId='main';base.roadWidth=main.ROAD_WIDTH;
    if(!candidate)return base;
    // The driveable area is the union of both corridors at the fork/merge.
    const baseOutside=Math.max(0,base.distance-main.ROAD_WIDTH/2+.35),branchOutside=Math.max(0,candidate.distance-branch.width/2+.35);
    return branchOutside<baseOutside-1e-6||(Math.abs(branchOutside-baseOutside)<1e-6&&candidate.distance<base.distance)?candidate:base;
  }
  function sampleRoad(s,lateral=0,routeId='main'){
    const wrapped=main.wrapDistance(s);
    return routeId===branch.id&&wrapped>=entry.s&&wrapped<=exit.s?branch.sample(branch.physical(wrapped),lateral):main.sampleTrack(s,lateral);
  }
  function sampleAhead(s,distance,lateral=0,routeId='main'){
    const wrapped=main.wrapDistance(s);
    if(routeId!==branch.id)return main.sampleTrack(s+distance,lateral);
    const d=wrapped<entry.s?wrapped-entry.s:wrapped<=exit.s?branch.physical(wrapped):branch.length+wrapped-exit.s;
    const next=d+distance;
    if(next<0)return main.sampleTrack(entry.s+next,lateral);
    if(next>branch.length)return main.sampleTrack(exit.s+next-branch.length,lateral);
    return branch.sample(next,lateral);
  }
  function validJunctionTransition(v,next,delta){
    if(v.progressRoute===next.routeId||!Number.isFinite(v.progressX)||Math.abs(delta)>12||Math.hypot(v.x-v.progressX,v.z-v.progressZ)>=4)return false;
    if(Math.min(Math.abs(next.s-entry.s),Math.abs(next.s-exit.s))>60)return false;
    const a=main.nearestTrack(v.x,v.z,v.s),b=branch.nearest(v.x,v.z,v.s);
    if(!b||a.distance>main.ROAD_WIDTH/2+.5||b.distance>branch.width/2+.5)return false;
    // At an overlapping fork two centerline projections may differ by a few
    // metres. Validate real motion on the destination road before accepting it.
    const previous=next.routeId===branch.id?branch.nearest(v.progressX,v.progressZ,v.s):main.nearestTrack(v.progressX,v.progressZ,v.s);
    return !!previous&&Math.abs(next.s-previous.s)<4;
  }
  const arch=branch.nearest(239*scale,0);
  const cityLayout=Object.freeze({scale,wallBounds:Object.freeze({minX:-210*scale,maxX:205*scale,minZ:-145*scale,maxZ:145*scale}),wallHeight:14,wallThickness:8,
    arch:Object.freeze({x:arch.x,z:0,heading:0,width:12.4,height:9,depth:8,s:arch.s}),
    spur:Object.freeze({fromX:205*scale,toX:299*scale,z:0}),showroom:Object.freeze({x:0,y:.15,z:-105*scale})});
  const itemFractions=Object.freeze([.045,.15,.28,.41,.54,.67,.80,.92]);
  return Object.freeze({...main,shortcuts,nearestRoad,sampleRoad,sampleAhead,validJunctionTransition,cityLayout,itemFractions});
}
