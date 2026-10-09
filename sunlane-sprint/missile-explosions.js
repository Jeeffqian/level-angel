import * as THREE from 'three';

const CAPACITY=12,LIFETIME=.9,DEDUP_LIMIT=128,TAU=Math.PI*2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function effectMaterial(mode) {
  return new THREE.ShaderMaterial({
    name:['missile-burst-glow','missile-burst-smoke','missile-burst-ring'][mode],
    transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
    blending:mode===1?THREE.NormalBlending:THREE.AdditiveBlending,
    uniforms:{effectMode:{value:mode}},
    vertexShader:`attribute float effectAlpha;
      varying vec3 vTint;varying float vAlpha;varying vec3 vNormal;varying vec3 vEye;
      void main(){
        vec4 eye=modelViewMatrix*instanceMatrix*vec4(position,1.0);
        vEye=-eye.xyz;vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);
        vTint=instanceColor;vAlpha=effectAlpha;
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader:`uniform float effectMode;
      varying vec3 vTint;varying float vAlpha;varying vec3 vNormal;varying vec3 vEye;
      void main(){
        float facing=abs(dot(normalize(vNormal),normalize(vEye)));
        float edge=effectMode>1.5?1.0:smoothstep(0.0,0.62,facing);
        float shade=effectMode>0.5&&effectMode<1.5?0.78+0.22*max(0.0,normalize(vNormal).y):1.0;
        gl_FragColor=vec4(vTint*shade,vAlpha*edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

/** Three bounded batches, authored entirely in code; simulation owns the hits. */
export function createMissileExplosions(scene) {
  const root=new THREE.Group();root.name='missile-explosions';root.visible=false;scene.add(root);
  const dummy=new THREE.Object3D(),direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),tint=new THREE.Color();
  const cream=new THREE.Color('#fff3bb'),yellow=new THREE.Color('#ffd352'),orange=new THREE.Color('#ff7c24'),smokeColor=new THREE.Color('#8f8984');
  function batch(name,geometry,mode,capacity,order) {
    const material=effectMaterial(mode),mesh=new THREE.InstancedMesh(geometry,material,capacity);
    mesh.name=name;mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=order;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    const alpha=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('effectAlpha',alpha);
    root.add(mesh);return {mesh,alpha,matrixRange:{start:0,count:0},colorRange:{start:0,count:0},alphaRange:{start:0,count:0},triangles:(geometry.index?.count??geometry.attributes.position.count)/3};
  }
  const glowGeometry=new THREE.IcosahedronGeometry(1,0),positions=glowGeometry.attributes.position,normals=glowGeometry.attributes.normal;
  // Smooth radial normals make the edge fade rounded without spending more
  // triangles on each tiny spark or showing flat translucent polygon faces.
  for(let i=0;i<positions.count;i++){direction.fromBufferAttribute(positions,i).normalize();normals.setXYZ(i,direction.x,direction.y,direction.z);}
  const glow=batch('missile-fire-and-sparks',glowGeometry,0,CAPACITY*26,4);
  const smoke=batch('missile-dissipating-smoke',new THREE.IcosahedronGeometry(1,1),1,CAPACITY*8,3);
  const rings=batch('missile-shock-rings',new THREE.TorusGeometry(1,.032,4,36),2,CAPACITY,4);
  const batches=[glow,smoke,rings],bursts=Array.from({length:CAPACITY},()=>({active:false,x:0,z:0,start:0,phase:0})),seen=new Map();
  const seeds=Array.from({length:24},(_,i)=>({angle:i*2.399963229728653,height:.25+(i*13%17)/17*.8,speed:2.5+(i*7%11)/11*2.4,stretch:.12+(i*5%9)/9*.16}));
  const diagnostics={capacity:CAPACITY,lifetime:LIFETIME,quality:'high',active:0,accepted:0,duplicatesIgnored:0,rejected:0,recycled:0,dedupKeys:0,
    glowParticles:0,smokeParticles:0,rings:0,drawCalls:0,triangles:0,time:0,visible:false,disposed:false,textures:0,materials:3};
  let identity=null,disposed=false;
  function clear() {
    for(let i=0;i<CAPACITY;i++)bursts[i].active=false;
    seen.clear();identity=null;root.visible=false;
    for(let i=0;i<batches.length;i++)batches[i].mesh.count=0;
    diagnostics.active=diagnostics.dedupKeys=diagnostics.glowParticles=diagnostics.smokeParticles=diagnostics.rings=diagnostics.drawCalls=diagnostics.triangles=0;
    diagnostics.visible=false;
  }
  function event(hit,race) {
    if(disposed)return false;
    if(hit?.type!=='item-hit'||hit.item!=='missile'||!Number.isFinite(race?.time)){diagnostics.rejected++;return false;}
    const victim=race.racers?.find(r=>r.id===hit.id);
    const x=Number.isFinite(hit.x)?hit.x:victim?.x,z=Number.isFinite(hit.z)?hit.z:victim?.z;
    if(!Number.isFinite(x)||!Number.isFinite(z)){diagnostics.rejected++;return false;}
    const nextIdentity=race.raceId??race;if(identity!==nextIdentity){clear();identity=nextIdentity;}
    const key=hit.hazardId??`${hit.ownerId}:${hit.id}:${race.time}:${x}:${z}`;
    if(seen.has(key)){diagnostics.duplicatesIgnored++;return false;}
    seen.set(key,true);if(seen.size>DEDUP_LIMIT)seen.delete(seen.keys().next().value);diagnostics.dedupKeys=seen.size;
    let selected=null;
    for(let i=0;i<CAPACITY;i++){const burst=bursts[i];if(!burst.active||race.time-burst.start>=LIFETIME){selected=burst;break;}if(!selected||burst.start<selected.start)selected=burst;}
    if(selected.active&&race.time-selected.start<LIFETIME)diagnostics.recycled++;
    let hash=2166136261;for(const char of String(key))hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
    selected.active=true;selected.x=x;selected.z=z;selected.start=race.time;selected.phase=hash/4294967296*TAU;
    diagnostics.accepted++;return true;
  }
  function write(target,x,y,z,sx,sy,sz,color,alpha,rx=0,ry=0,rz=0,velocity=null) {
    const index=target.mesh.count++;dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);
    if(velocity)dummy.quaternion.setFromUnitVectors(up,velocity);else dummy.rotation.set(rx,ry,rz);
    dummy.updateMatrix();target.mesh.setMatrixAt(index,dummy.matrix);target.mesh.setColorAt(index,color);target.alpha.setX(index,alpha);
  }
  function upload(target) {
    const {mesh,alpha}=target,count=mesh.count;
    if(!count)return;
    target.matrixRange.count=count*16;target.colorRange.count=count*3;target.alphaRange.count=count;
    mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.updateRanges.push(target.matrixRange);mesh.instanceMatrix.needsUpdate=true;
    mesh.instanceColor.clearUpdateRanges();mesh.instanceColor.updateRanges.push(target.colorRange);mesh.instanceColor.needsUpdate=true;
    alpha.clearUpdateRanges();alpha.updateRanges.push(target.alphaRange);alpha.needsUpdate=true;
  }
  function update({time,visible=true,quality='high'}={}) {
    if(disposed)return;
    const clock=Number.isFinite(time)?time:diagnostics.time,high=quality!=='low';
    diagnostics.time=clock;diagnostics.quality=high?'high':'low';diagnostics.active=0;
    for(let i=0;i<batches.length;i++)batches[i].mesh.count=0;
    for(let i=0;i<CAPACITY;i++) {
      const burst=bursts[i];if(!burst.active)continue;
      const age=clock-burst.start;if(age>=LIFETIME||age<0){burst.active=false;continue;}diagnostics.active++;
      if(!visible)continue;
      const t=age/LIFETIME;
      // A tight hot flash opens instantly, then yields to directional sparks.
      if(age<.29) {
        const pulse=Math.sin(Math.min(1,age/.29)*Math.PI*.85),radius=.4+pulse*.8,fade=1-age/.29;
        write(glow,burst.x,1.08,burst.z,radius,radius*.87,radius,orange,fade*.78);
        write(glow,burst.x,1.14,burst.z,radius*.64,radius*.59,radius*.64,cream,fade);
      }
      const sparkCount=high?24:8,sparkFade=(1-t)*(1-t);
      for(let j=0;j<sparkCount;j++) {
        const seed=seeds[high?j:j*3],angle=seed.angle+burst.phase,vx=Math.cos(angle)*seed.speed,vz=Math.sin(angle)*seed.speed,vy=seed.height*3;
        const travel=age*(1-age*.32),y=Math.max(.12,1.1+vy*age-3.7*age*age);
        direction.set(vx,vy-7.4*age,vz).normalize();tint.copy(j%3?yellow:orange);
        const width=(high?.048:.067)*(1-t*.65),length=seed.stretch*(.6+sparkFade);
        write(glow,burst.x+vx*travel,y,burst.z+vz*travel,width,length,width,tint,sparkFade*.9,0,0,0,direction);
      }
      // Small separate puffs dissolve; they never form a screen-filling cloud.
      const smokeCount=high?8:3,smokeFade=Math.sin(Math.PI*clamp((age-.06)/.84,0,1))*.28;
      if(smokeFade>.002)for(let j=0;j<smokeCount;j++) {
        const angle=burst.phase+j*TAU/smokeCount,radius=.25+t*1.15,size=.22+t*.49+(j%3)*.07;
        tint.copy(smokeColor).multiplyScalar(.83+(j%3)*.1);
        write(smoke,burst.x+Math.cos(angle)*radius,1.05+t*(.8+(j%3)*.3),burst.z+Math.sin(angle)*radius,size,size*(.8+j%2*.25),size,tint,smokeFade,age*.3,angle,age*.2);
      }
      if(age<.58) {const radius=.5+age*4.8;write(rings,burst.x,.13,burst.z,radius,radius,radius,orange,(1-age/.58)*.63,Math.PI/2);}
    }
    root.visible=!!visible&&diagnostics.active>0;diagnostics.visible=root.visible;
    diagnostics.glowParticles=glow.mesh.count;diagnostics.smokeParticles=smoke.mesh.count;diagnostics.rings=rings.mesh.count;diagnostics.drawCalls=diagnostics.triangles=0;
    for(let i=0;i<batches.length;i++){const target=batches[i];upload(target);if(target.mesh.count){diagnostics.drawCalls++;diagnostics.triangles+=target.mesh.count*target.triangles;}}
  }
  return {root,event,update,clear,diagnostics,
    dispose(){if(disposed)return;clear();disposed=true;root.removeFromParent();for(let i=0;i<batches.length;i++){const {mesh}=batches[i];mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();}diagnostics.disposed=true;}
  };
}
