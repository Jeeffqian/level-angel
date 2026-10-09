import * as THREE from 'three';
import {createGrass} from './grass.js';
import {createPalmTrees} from './palm-trees.js';
import {createCoastProps} from './coast-props.js';
import {createCoastSurface} from './coast-surface.js';
import {createRocks} from './rocks.js';
import {createCoastIslands} from './coast-islands.js';
import { sampleTrack, trackLength, ROAD_WIDTH, nearestTrack } from './track.js';

const mat=(color,roughness=.85)=>new THREE.MeshStandardMaterial({color,roughness});
const dummy=new THREE.Object3D();

// Static props are merged by material, so hundreds of palm fronds and barrier
// segments remain a handful of draw calls instead of hundreds of scene meshes.
class Batch {
  constructor(){this.items=new Map();}
  add(geometry,material,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
    dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(rx,ry,rz);dummy.updateMatrix();
    const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.applyMatrix4(dummy.matrix);
    const list=this.items.get(material)||[];list.push(g);this.items.set(material,list);
  }
  finish(scene){
    for(const [material,list] of this.items){
      const geometry=new THREE.BufferGeometry();
      for(const key of ['position','normal','uv']){
        const data=new Float32Array(list.reduce((n,g)=>n+g.attributes[key].array.length,0));let offset=0;
        for(const g of list){data.set(g.attributes[key].array,offset);offset+=g.attributes[key].array.length;}
        geometry.setAttribute(key,new THREE.BufferAttribute(data,key==='uv'?2:3));
      }
      geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;scene.add(mesh);list.forEach(g=>g.dispose());
    }
  }
}

function canvasTexture(width,height,draw){
  const c=document.createElement('canvas');c.width=width;c.height=height;draw(c.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
function textTexture(text,bg='#254854',fg='#fff1ce'){
  return canvasTexture(1024,192,(c,w,h)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle=fg;c.font='900 94px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2+4);});
}
function roadStrip(scene,left,right,y,material){
  const positions=[],uv=[],indices=[],alternating=[[],[]],n=650;
  for(let i=0;i<=n;i++){
    const s=i/n*trackLength;
    for(const lateral of [left,right]){const p=sampleTrack(s,lateral);positions.push(p.x,y,p.z);uv.push((lateral-left)/5,s/5);}
    if(i<n){const a=i*2,target=Array.isArray(material)?alternating[Math.floor(s/3)%2]:indices;target.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(Array.isArray(material)){
    geometry.setIndex([...alternating[0],...alternating[1]]);
    geometry.addGroup(0,alternating[0].length,0);geometry.addGroup(alternating[0].length,alternating[1].length,1);
  }else geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // sampleTrack's right normal defines the winding for a top-facing road.
  const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;scene.add(mesh);return mesh;
}

function leafGeometry(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.7,-.04,1.5,0,.16,1.4,.7,-.04,1.5,0,-.5,3.8],3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute([.5,0,0,.5,.5,.5,1,.5,.5,1],2));g.setIndex([0,2,1,0,3,2,1,2,4,2,3,4]);g.computeVertexNormals();return g;
}

export function buildWorld(parent,{quality='high'}={}){
  const scene=new THREE.Group();scene.name='palm-coast-world';parent.add(scene);
  const palette={sand:mat('#f5df9d'),grass:mat('#84c875'),cream:mat('#fff1ce'),coral:mat('#f46e55'),teal:mat('#269f9d'),navy:mat('#254854'),wood:mat('#b78155'),trunk:mat('#bd9063'),leaf:mat('#428e66'),leafLight:mat('#66b779'),rock:mat('#adbcad'),white:mat('#fffdf0'),yellow:mat('#ffd566')};
  const box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,16),sphere=new THREE.SphereGeometry(1,12,8);

  const batch=new Batch(),surfaceBatch=new Batch(),palmBatch=new Batch(),architectureBatch=new Batch(),rockBatch=new Batch(),islandBatch=new Batch();
  const simpleSurface=new THREE.Group(),simplePalms=new THREE.Group(),simpleArchitecture=new THREE.Group(),simpleRocks=new THREE.Group(),simpleIslands=new THREE.Group();
  simpleSurface.name='coast-simple-surfaces';simplePalms.name='coast-simple-palms';simpleArchitecture.name='coast-simple-buildings';simpleRocks.name='coast-simple-rocks';
  simpleIslands.name='coast-simple-islands';
  scene.add(simpleSurface,simplePalms,simpleArchitecture,simpleRocks,simpleIslands);const palmPlacements=[],rockPlacements=[],islandPlacements=[];
  // Flat playable island, stepped sand shoreline and a broad turquoise ocean.
  const waterTexture=canvasTexture(256,256,(c,w,h)=>{
    c.fillStyle='#49bdd0';c.fillRect(0,0,w,h);c.strokeStyle='#75d5d9';c.lineWidth=1.5;
    for(let y=0;y<h;y+=20){c.beginPath();for(let x=0;x<=w;x+=4){const yy=y+Math.sin(x*.047+y)*2;x?c.lineTo(x,yy):c.moveTo(x,yy);}c.stroke();}
  });waterTexture.wrapS=waterTexture.wrapT=THREE.RepeatWrapping;waterTexture.repeat.set(70,70);
  const ocean=new THREE.Mesh(new THREE.PlaneGeometry(2800,2800),new THREE.MeshStandardMaterial({map:waterTexture,roughness:.45,metalness:.04}));ocean.rotation.x=-Math.PI/2;ocean.position.y=-.66;simpleSurface.add(ocean);
  const islandGeo=new THREE.CylinderGeometry(1,1,1,96);
  surfaceBatch.add(islandGeo,palette.sand,0,-.37,0,174,.55,141);
  surfaceBatch.add(islandGeo,palette.grass,0,-.18,0,160,.34,127);
  const shore=new THREE.Mesh(new THREE.RingGeometry(.988,1,128),new THREE.MeshBasicMaterial({color:'#d1f4de',side:THREE.DoubleSide}));shore.rotation.x=-Math.PI/2;shore.scale.set(179,146,1);shore.position.y=-.62;simpleSurface.add(shore);

  const asphalt=canvasTexture(128,128,(c,w,h)=>{
    c.fillStyle='#556775';c.fillRect(0,0,w,h);let seed=43;
    for(let i=0;i<5000;i++){seed=(seed*16807)%2147483647;const x=seed%w;seed=(seed*16807)%2147483647;const y=seed%h;c.fillStyle=i%2?'rgba(255,255,255,.035)':'rgba(0,0,0,.04)';c.fillRect(x,y,1,1);}
  });asphalt.wrapS=asphalt.wrapT=THREE.RepeatWrapping;
  roadStrip(scene,-ROAD_WIDTH/2-.8,ROAD_WIDTH/2+.8,.016,palette.navy);
  roadStrip(scene,-ROAD_WIDTH/2,ROAD_WIDTH/2,.03,new THREE.MeshStandardMaterial({map:asphalt,roughness:.95}));
  for(const side of [-1,1]){
    roadStrip(scene,side*8.6-.08,side*8.6+.08,.045,palette.cream);
    // Physical boundaries match the track collider: rail face at about +/-10m.
    // Contiguous ribbon triangles share their edges: differently colored curb
    // sections never overlap and remain two material draws per roadside.
    roadStrip(scene,side*9.5-.4,side*9.5+.4,.10,[palette.coral,palette.cream]);
    for(let s=0;s<trackLength;s+=4){
      const p=sampleTrack(s,side*10.5);
      batch.add(box,Math.floor(s/20)%2?palette.cream:palette.teal,p.x,.57,p.z,.65,1.05,4.12,0,p.heading);
      batch.add(box,palette.cream,p.x,1.12,p.z,.72,.13,4.12,0,p.heading);
    }
  }
  for(let s=13;s<trackLength;s+=15){const p=sampleTrack(s);batch.add(box,palette.cream,p.x,.046,p.z,.19,.012,3.5,0,p.heading);}

  // A checked start line and an overhead gantry make the race direction obvious.
  const start=sampleTrack(0),startGroup=new THREE.Group();startGroup.position.set(start.x,0,start.z);startGroup.rotation.y=start.heading;scene.add(startGroup);
  const local=(g,m,x,y,z,sx=1,sy=1,sz=1)=>{const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);startGroup.add(mesh);return mesh;};
  const checker=canvasTexture(256,64,(c,w,h)=>{for(let y=0;y<2;y++)for(let x=0;x<16;x++){c.fillStyle=(x+y)%2?'#fff6dc':'#27434b';c.fillRect(x*w/16,y*h/2,w/16,h/2);}});
  const line=local(new THREE.PlaneGeometry(18,2.6),new THREE.MeshBasicMaterial({map:checker}),0,.055,0);line.rotation.x=-Math.PI/2;
  for(const x of [-11.2,11.2]){
    local(box,palette.coral,x,4.6,0,.85,9.2,1.0);
    local(box,palette.cream,x,1.2,0,1.55,2.4,1.5);
  }
  local(box,palette.teal,0,8.8,0,24,1.65,1.2);
  const bannerMat=new THREE.MeshBasicMaterial({map:textTexture('SUNLANE  •  SPRINT'),side:THREE.DoubleSide});
  local(new THREE.PlaneGeometry(18,1.40),bannerMat,0,8.81,-.615).rotation.y=Math.PI;
  local(new THREE.PlaneGeometry(18,1.40),bannerMat,0,8.81,.615);
  for(let i=0;i<5;i++)local(sphere,palette.yellow,-2+i,7.37,0,.21,.21,.21);
  // Starting-grid boxes double as speed-readable surface detail.
  for(let row=0;row<3;row++)for(const lane of [-3,3]){
    const p=sampleTrack(-9-row*6,lane);
    batch.add(box,palette.cream,p.x,.047,p.z,2.6,.014,.10,0,p.heading);
  }

  // Repeated tropical prop kit, with deterministic variation.
  const leaf=leafGeometry();palette.leaf.side=palette.leafLight.side=THREE.DoubleSide;
  function palm(x,z,size=1,spin=0){
    palmPlacements.push({x,z,size,spin});const height=7*size;
    for(let i=0;i<5;i++)palmBatch.add(cylinder,palette.trunk,x+i*.11*size,height*(i+.5)/5,z, .27*size*(1-i*.08),height/5+.04,.27*size*(1-i*.08),0,0,-.07);
    for(let i=0;i<7;i++)palmBatch.add(leaf,i%2?palette.leaf:palette.leafLight,x+.5*size,height,z,size,size,size,0,spin+i*Math.PI*2/7);
    for(let i=0;i<3;i++)palmBatch.add(sphere,palette.wood,x+.5*size+Math.cos(i*2)*.25*size,height-.3*size,z+Math.sin(i*2)*.25*size,.22*size,.25*size,.22*size);
  }
  for(let s=22,i=0;s<trackLength;s+=26,i++){
    const side=i%3===0?-1:1,p=sampleTrack(s,side*(18+(i%4)*2));
    // An oval keeps the furthest palms on land, and exact distance avoids corners.
    if((p.x/168)**2+(p.z/135)**2<.98&&nearestTrack(p.x,p.z).distance>13)palm(p.x,p.z,.83+(i%4)*.14,i);
  }
  palm(-11,-14,1.22);palm(-18,-19,.9,1);palm(20,-21,1.35,2);palm(33,-36,.9,3);
  // Soft faceted rocks sit in garden beds and outside the collision corridor.
  const rock=new THREE.IcosahedronGeometry(1,0);
  for(let i=0;i<44;i++){
    const s=i/44*trackLength,p=sampleTrack(s,(i%2?1:-1)*(15.5+i%5));
    if(nearestTrack(p.x,p.z).distance<13)continue;
    const k=1+i%3*.35;rockBatch.add(rock,palette.rock,p.x,.5*k,p.z,1.1*k,.85*k,1.4*k,.1,i,0);
    rockPlacements.push({position:[p.x,.5*k,p.z],scale:[1.1*k,.85*k,1.4*k],rotation:[.1,i,0],seed:9127+i*7919});
  }

  // Readable turn boards. Two chevrons, on the outer shoulder of each main bend.
  const arrowTexture=canvasTexture(256,128,c=>{
    c.fillStyle='#fff1ce';c.fillRect(0,0,256,128);c.fillStyle='#269f9d';
    for(const x of [34,140]){c.beginPath();c.moveTo(x,18);c.lineTo(x+43,18);c.lineTo(x+81,64);c.lineTo(x+43,110);c.lineTo(x,110);c.lineTo(x+39,64);c.fill();}
  });
  const arrowMat=new THREE.MeshBasicMaterial({map:arrowTexture,side:THREE.DoubleSide});
  for(const fraction of [.11,.20,.28,.38,.47,.59,.70,.81,.89]){
    const s=trackLength*fraction,a=sampleTrack(s-10),b=sampleTrack(s+10);
    const turn=Math.atan2(a.tz*b.tx-a.tx*b.tz,a.tx*b.tx+a.tz*b.tz);const outer=turn>0?-1:1;
    const p=sampleTrack(s,outer*13);
    batch.add(box,palette.wood,p.x,1.45,p.z,.18,2.9,.18);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(4.2,2.1),arrowMat);sign.position.set(p.x,3,p.z);sign.rotation.y=p.heading+Math.PI;sign.scale.x=turn<0?1:-1;scene.add(sign);
  }

  // Landmark lighthouse, with contrasting bands, balcony, lantern and roof.
  const lx=138,lz=65;
  architectureBatch.add(islandGeo,palette.cream,lx,.3,lz,7,.6,7);
  for(let i=0;i<6;i++)architectureBatch.add(new THREE.CylinderGeometry(2.3-i*.12,2.42-i*.12,2.4,24),i%2?palette.coral:palette.cream,lx,1.8+i*2.4,lz);
  architectureBatch.add(cylinder,palette.navy,lx,15.4,lz,3.1,.34,3.1);
  architectureBatch.add(cylinder,palette.yellow,lx,16.5,lz,1.8,2,1.8);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;architectureBatch.add(cylinder,palette.navy,lx+Math.cos(a)*1.85,16.5,lz+Math.sin(a)*1.85,.09,2.2,.09);}
  architectureBatch.add(new THREE.ConeGeometry(3.1,2.2,24),palette.coral,lx,18.5,lz);
  architectureBatch.add(sphere,palette.yellow,lx,19.7,lz,.24,.45,.24);
  for(let i=0;i<3;i++)architectureBatch.add(box,palette.navy,lx,3.1+i*4.4,lz+2.43-i*.22,.7,1.1,.12);

  function hut(x,z,color,angle=0){
    const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=angle;group.updateMatrixWorld();
    const piece=(g,m,px,py,pz,sx,sy,sz,rx=0)=>{const p=new THREE.Vector3(px,py,pz).applyMatrix4(group.matrixWorld);architectureBatch.add(g,m,p.x,p.y,p.z,sx,sy,sz,rx,angle);};
    piece(box,color,0,2.2,0,6,4.4,5);piece(box,palette.cream,0,.3,0,7,.6,6.2);
    piece(box,palette.cream,0,4.3,0,6.8,.24,5.8);
    for(const side of [-1,1])piece(box,palette.coral,0,5.18,side*1.47,7,.22,3.5,side*-.48);
    piece(box,palette.navy,-1.5,2.2,2.52,1.45,1.35,.06);piece(box,palette.navy,1.25,1.7,2.54,1.4,2.8,.08);
    piece(box,palette.cream,-1.5,2.2,2.58,.08,1.45,.07);piece(box,palette.cream,-1.5,2.2,2.58,1.5,.08,.07);
    for(const side of [-1,1])piece(box,palette.cream,side*2.8,1.9,3.8,.14,3.8,.14);
    piece(box,palette.yellow,0,3.75,3.6,6.5,.15,2.4,.1);
  }
  hut(-46,-26,palette.teal,-.2);hut(-58,-29,palette.coral,.1);hut(-70,-28,palette.yellow,.25);
  // A second cluster gives the far straight its own identity.
  hut(66,57,palette.teal,Math.PI);hut(77,58,palette.yellow,Math.PI);

  // Central garage turntable: unobstructed at the parent camera's menu position.
  batch.add(islandGeo,palette.teal,0,.03,0,6.4,.06,6.4);
  batch.add(islandGeo,palette.cream,0,.10,0,5.8,.08,5.8);
  const ring=new THREE.Mesh(new THREE.RingGeometry(4.8,4.87,64),new THREE.MeshBasicMaterial({color:'#e1c98c'}));ring.rotation.x=-Math.PI/2;ring.position.y=.145;scene.add(ring);

  // Long-range silhouette layers: offshore islets and broad, soft cloud banks.
  for(let i=0;i<7;i++){
    const a=i*.89,r=370+(i%3)*80,x=Math.cos(a)*r,z=Math.sin(a)*r;
    islandBatch.add(sphere,palette.teal,x,-7,z,40+i%3*12,20,30+i%2*12);
    islandBatch.add(sphere,palette.grass,x,0,z,27+i%3*9,14,22+i%2*8);
    islandPlacements.push({x,z,rx:40+i%3*12,rz:30+i%2*12,height:24+i%3*7,seed:14731+i*7919});
  }
  const clouds=new THREE.InstancedMesh(sphere,palette.white,42);
  for(let i=0;i<42;i++){
    const cluster=Math.floor(i/3),a=cluster/14*Math.PI*2,r=190+(cluster%3)*100;
    dummy.position.set(Math.cos(a)*r+(i%3-1)*13,50+(cluster%4)*13,Math.sin(a)*r);dummy.rotation.set(0,0,0);dummy.scale.set(13+(i%3)*3,5+(i%3)*2,7);dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);
  }clouds.instanceMatrix.needsUpdate=true;scene.add(clouds);

  const balloons=[];
  for(let i=0;i<3;i++){
    const group=new THREE.Group();group.position.set([-54,97,-120][i],[36,43,52][i],[-133,15,93][i]);scene.add(group);balloons.push(group);
    const envelope=new THREE.Mesh(sphere,[palette.coral,palette.yellow,palette.teal][i]);envelope.scale.set(3.3,4.3,3.3);group.add(envelope);
    const belt=new THREE.Mesh(new THREE.TorusGeometry(3.2,.17,6,24),palette.cream);belt.rotation.x=Math.PI/2;group.add(belt);
    const basket=new THREE.Mesh(box,palette.wood);basket.position.y=-5.4;basket.scale.set(1.4,.9,1.2);group.add(basket);
    for(const x of [-.6,.6]){const rope=new THREE.Mesh(cylinder,palette.cream);rope.position.set(x,-4.4,0);rope.scale.set(.03,1.9,.03);group.add(rope);}
  }
  batch.finish(scene);surfaceBatch.finish(simpleSurface);palmBatch.finish(simplePalms);architectureBatch.finish(simpleArchitecture);rockBatch.finish(simpleRocks);islandBatch.finish(simpleIslands);rock.dispose();
  // The large terrain island stays; the four paper-thin lawn overlays are gone.
  const geometries=new Set(),materials=new Set(Object.values(palette)),textures=new Set();
  scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
  for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
  const placements=[];let seed=6259;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<270&&placements.length<115;i++) {
    const point=sampleTrack(random()*trackLength,(i%2?1:-1)*(17+random()*18));
    if((point.x/160)**2+(point.z/127)**2>.9||Math.hypot(point.x,point.z)<13||nearestTrack(point.x,point.z).distance<14)continue;
    if([[-46,-26],[-58,-29],[-70,-28],[66,57],[77,58],[138,65]].some(([x,z])=>Math.hypot(point.x-x,point.z-z)<10))continue;
    placements.push({x:point.x,z:point.z,radius:1.7+random()*.8,seed:seed});
  }
  // Create after inventory: the helper owns its cached quality resources.
  const grass=createGrass(scene,placements,{quality,groundHeight:()=>-.01,style:'coast'});
  let high=null,activeQuality;
  const coastDiagnostics={quality,highAllocated:false,surfaces:null,palms:null,props:null,islands:null};
  const rockDiagnostics={quality,count:rockPlacements.length,detailedAllocated:false,detailedVisible:false,simpleVisible:true};
  function setQuality(value){
    activeQuality=value==='high'?'high':'low';const detailed=activeQuality==='high';
    if(detailed&&!high){
      high={surfaces:createCoastSurface(scene),palms:createPalmTrees(scene,palmPlacements),props:createCoastProps(scene),rocks:createRocks(scene,rockPlacements,{style:'coast'}),islands:createCoastIslands(scene,islandPlacements)};
      coastDiagnostics.highAllocated=true;
      for(const key of Object.keys(high))coastDiagnostics[key]=high[key].diagnostics;
    }
    simpleSurface.visible=simplePalms.visible=simpleArchitecture.visible=simpleRocks.visible=simpleIslands.visible=clouds.visible=!detailed;
    if(high)for(const kit of Object.values(high))kit.root.visible=detailed;
    if(high&&!detailed)Object.assign(high.islands.diagnostics,{visibleTriangles:0,visibleDrawCalls:0,nearIslands:0,farIslands:0});
    high?.surfaces.setQuality(activeQuality);
    Object.assign(rockDiagnostics,high?.rocks.diagnostics,{quality:activeQuality,detailedAllocated:!!high,detailedVisible:detailed,simpleVisible:!detailed});
    if(!detailed)Object.assign(rockDiagnostics,{visibleRocks:0,nearRocks:0,midRocks:0,farRocks:0,visibleTriangles:0,visibleDrawCalls:0});
    coastDiagnostics.quality=activeQuality;grass.setQuality(activeQuality);
  }
  setQuality(quality);let disposed=false;
  return {showroomPosition:new THREE.Vector3(0,.15,0),grassDiagnostics:grass.diagnostics,coastDiagnostics,rockDiagnostics,
    setQuality,
    beforeRender(renderer,renderScene,camera,options={}){grass.beforeRender(camera);if(activeQuality==='high'){high.palms.beforeRender(camera);high.surfaces.beforeRender(renderer,camera,options);high.rocks.beforeRender(camera);high.islands.beforeRender(camera);Object.assign(rockDiagnostics,high.rocks.diagnostics);}},
    update(time){grass.update(time);if(activeQuality==='high')for(const kit of Object.values(high))kit.update(time);else{waterTexture.offset.x=time*.00045;waterTexture.offset.y=time*.00022;}balloons.forEach((b,i)=>{b.position.y=[36,43,52][i]+Math.sin(time*.45+i)*.8;b.rotation.z=Math.sin(time*.3+i)*.025;});},
    dispose(){if(disposed)return;disposed=true;grass.dispose();if(high)for(const kit of Object.values(high))kit.dispose();clouds.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());scene.removeFromParent();}
  };
}
