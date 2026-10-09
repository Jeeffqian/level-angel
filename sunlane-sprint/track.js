// Immutable circuits shared by rendering, collision, checkpoints, AI and minimaps.
// Each Race owns its track so concurrent online rooms stay independent.
import {createCityCircuit} from './track-city.js';
export const ROAD_WIDTH = 18;
function circuit(id,name,subtitle,control,options={}) {
  const count = options.count||1300;
  const trackPoints = [];
  const cat = (a,b,c,d,t) => .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
  for (let i=0;i<=count;i++) {
    const q=(i/count)*control.length, j=Math.floor(q)%control.length, t=q-Math.floor(q);
    const p=[-1,0,1,2].map(k=>control[(j+k+control.length)%control.length]);
    const x=cat(p[0][0],p[1][0],p[2][0],p[3][0],t), z=cat(p[0][1],p[1][1],p[2][1],p[3][1],t);
    const prev=trackPoints.at(-1);
    trackPoints.push({x,z,s:prev?prev.s+Math.hypot(x-prev.x,z-prev.z):0});
  }
  const trackLength=trackPoints.at(-1).s;
  const wrapDistance=s=>((s%trackLength)+trackLength)%trackLength;
  function sampleTrack(distance,lateral=0) {
    const s=wrapDistance(distance);
    let lo=0,hi=count;
    while(lo+1<hi){const m=(lo+hi)>>1;if(trackPoints[m].s<=s)lo=m;else hi=m;}
    const a=trackPoints[lo],b=trackPoints[lo+1],len=b.s-a.s,t=(s-a.s)/len;
    const tx=(b.x-a.x)/len,tz=(b.z-a.z)/len;
    return {x:a.x+(b.x-a.x)*t+tz*lateral,z:a.z+(b.z-a.z)*t-tx*lateral,tx,tz,nx:tz,nz:-tx,s,heading:Math.atan2(tx,tz)};
  }
  function nearestTrack(x,z,hintS=null) {
    if(!Number.isFinite(x)||!Number.isFinite(z))throw new TypeError('Track coordinates must be finite');
    let best=Infinity,result=null;
    const hint=hintS===null?null:wrapDistance(hintS);
    // Search the complete small polyline. Prevents stale guesses after recovery.
    for(let i=0;i<count;i++) {
      const a=trackPoints[i],b=trackPoints[i+1];
      if(hint!==null){let ds=Math.abs(a.s-hint);ds=Math.min(ds,trackLength-ds);if(ds>65)continue;}
      const dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/len2));
      const px=a.x+dx*t,pz=a.z+dz*t,d2=(x-px)**2+(z-pz)**2;
      if(d2<best){best=d2;const len=Math.sqrt(len2);result={x:px,z:pz,tx:dx/len,tz:dz/len,nx:dz/len,nz:-dx/len,s:a.s+t*len,lateral:((x-px)*dz-(z-pz)*dx)/len,distance:Math.sqrt(d2)};}
    }
    return result||nearestTrack(x,z);
  }

  trackPoints.forEach(Object.freeze);Object.freeze(trackPoints);
  return Object.freeze({id,name,subtitle,ROAD_WIDTH,trackPoints,trackLength,wrapDistance,sampleTrack,nearestTrack});
}
const originalTracks=[
  circuit('palm-coast','Palm Coast','Sunshine, sea breeze & sweeping turns',[[0,-100],[64,-100],[112,-66],[105,-12],[132,38],[99,88],[45,86],[8,47],[-28,69],[-84,83],[-124,39],[-117,-27],[-73,-85]]),
  circuit('sakura-valley','Sakura Valley','Cherry blossoms, river bridges & mountain mist',[[-60,-112],[0,-125],[72,-108],[112,-62],[94,-8],[112,48],[68,108],[0,125],[-68,102],[-100,55],[-78,8],[-110,-42]]),
];
export const TRACKS=Object.freeze([...originalTracks,createCityCircuit(circuit,Math.max(...originalTracks.map(t=>t.trackLength))*2)]);
export const getTrack=id=>TRACKS.find(track=>track.id===id)||TRACKS[0];
// Original circuit aliases remain available to existing tools and Palm Coast art.
export const {trackPoints,trackLength,wrapDistance,sampleTrack,nearestTrack}=TRACKS[0];
