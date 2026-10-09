import * as THREE from 'three';

const CAPACITY=128, TAU=Math.PI*2, EMPTY=[];
function merged(parts) {
  const vertices=[];
  for(const {geometry,position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]} of parts) {
    const copy=geometry.index?geometry.toNonIndexed():geometry.clone(),m=new THREE.Matrix4(),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    m.compose(new THREE.Vector3(...position),q,new THREE.Vector3(...scale));copy.applyMatrix4(m);
    vertices.push(...copy.attributes.position.array);copy.dispose();
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
}
function bananaGeometry(inner=false) {
  const vertices=[],radii=[0,.23,.54,.83,1],heights=[.58,.31,.1,.08,.23],widths=[.05,.22,.24,.16,.006];
  for(let arm=0;arm<3;arm++) {
    const angle=arm*TAU/3,dx=Math.sin(angle),dz=Math.cos(angle),sx=Math.cos(angle),sz=-Math.sin(angle);
    const points=[];
    for(let row=0;row<radii.length;row++)for(const side of [-1,1]) {
      const width=widths[row]*(inner?.54:1);
      points.push([dx*radii[row]+sx*side*width,heights[row]+(inner?.018:0),dz*radii[row]+sz*side*width]);
    }
    for(let row=0;row<radii.length-1;row++) {
      const a=row*2;for(const i of [a,a+2,a+1,a+1,a+2,a+3])vertices.push(...points[i]);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
}
function questionTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
  c.textAlign='center';c.textBaseline='middle';c.font='900 214px Arial, sans-serif';c.lineJoin='round';
  c.strokeStyle='#314c80';c.lineWidth=13;c.strokeText('?',128,134);c.fillStyle='#fff3c8';c.fillText('?',128,134);
  const texture=new THREE.CanvasTexture(canvas);texture.name='Original item question mark';texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

/** Bounded, shared visual batches. Gameplay remains entirely in the Race. */
export function createItemVisuals(scene) {
  const root=new THREE.Group();root.name='sunlane-item-visuals';scene.add(root);
  const geometries=new Set(),materials=new Set(),batches=[];
  const shape=g=>{geometries.add(g);return g;},material=m=>{materials.add(m);return m;};
  const dummy=new THREE.Object3D(),tint=new THREE.Color();
  const box=shape(new THREE.BoxGeometry(1,1,1)),ring=shape(new THREE.TorusGeometry(1,.045,4,28));
  const question=questionTexture();
  const glass=material(new THREE.MeshStandardMaterial({color:'#7cdcff',emissive:'#285184',emissiveIntensity:.2,roughness:.2,metalness:.05,transparent:true,opacity:.38,depthWrite:false}));
  const glyph=material(new THREE.MeshBasicMaterial({map:question,transparent:true,alphaTest:.12,depthWrite:false}));
  const glow=material(new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false}));
  const faint=material(new THREE.MeshBasicMaterial({color:'#657890',transparent:true,opacity:.42,depthWrite:false}));
  const yellow=material(new THREE.MeshStandardMaterial({color:'#ffc637',roughness:.66,side:THREE.DoubleSide}));
  const cream=material(new THREE.MeshStandardMaterial({color:'#fff0b6',roughness:.82,side:THREE.DoubleSide}));
  const brown=material(new THREE.MeshStandardMaterial({color:'#745544',roughness:1}));
  const red=material(new THREE.MeshStandardMaterial({color:'#eb665b',roughness:.42,metalness:.1}));
  const dark=material(new THREE.MeshStandardMaterial({color:'#384456',roughness:.65}));
  const flame=material(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.76,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
  function batch(name,geometry,mat,capacity=CAPACITY,order=0) {
    const mesh=new THREE.InstancedMesh(geometry,mat,capacity);mesh.name=name;mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=order;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);
    const entry={mesh,capacity,range:{start:0,count:0},colored:false};batches.push(entry);return entry;
  }
  function put(entry,x,y,z,heading,sx=1,sy=sx,sz=sx,color=null,rx=0,rz=0) {
    const i=entry.mesh.count;if(i>=entry.capacity)return;
    dummy.position.set(x,y,z);dummy.rotation.set(rx,heading,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();entry.mesh.setMatrixAt(i,dummy.matrix);
    if(color!==null){tint.set(color);entry.mesh.setColorAt(i,tint);entry.colored=true;}entry.mesh.count++;
  }
  const frameParts=[];
  for(let axis=0;axis<3;axis++)for(const a of [-.5,.5])for(const b of [-.5,.5]) {
    const position=[0,0,0],scale=[.035,.035,.035];position[(axis+1)%3]=a;position[(axis+2)%3]=b;scale[axis]=1.035;
    frameParts.push({geometry:box,position,scale});
  }
  const frameGeometry=shape(merged(frameParts));
  const shells=batch('item-box-glass',box,glass,CAPACITY,2),faces=batch('item-box-question-marks',box,glyph,CAPACITY,3);
  const frames=batch('item-box-frames',frameGeometry,glow),bases=batch('item-box-ready-rings',ring,glow),cooldowns=batch('item-box-cooldown-rings',ring,faint);
  const peel=batch('item-banana-peels',shape(bananaGeometry()),yellow),insides=batch('item-banana-insides',shape(bananaGeometry(true)),cream);
  const stemGeometry=shape(new THREE.CylinderGeometry(.065,.09,.27,6)),tips=batch('item-banana-tips',stemGeometry,brown);
  const cylinder=shape(new THREE.CylinderGeometry(.245,.245,1.12,12)),nose=shape(new THREE.ConeGeometry(.247,.48,12));
  const bodyGeometry=shape(merged([{geometry:cylinder,rotation:[Math.PI/2,0,0]},{geometry:nose,position:[0,0,.8],rotation:[Math.PI/2,0,0]}]));
  const body=batch('item-missile-bodies',bodyGeometry,red);
  const bandGeometry=shape(new THREE.CylinderGeometry(.25,.25,.18,12));bandGeometry.rotateX(Math.PI/2);bandGeometry.translate(0,0,.36);
  const bands=batch('item-missile-bands',bandGeometry,cream);
  const finGeometry=new THREE.BufferGeometry();finGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-.58,.52,0,-.69,.08,0,-.19],3));finGeometry.computeVertexNormals();
  const finParts=[];for(let i=0;i<4;i++)finParts.push({geometry:finGeometry,rotation:[0,0,i*Math.PI/2]});
  const fins=batch('item-missile-fins',shape(merged(finParts)),red);finGeometry.dispose();
  // Fins are double-sided thin surfaces, independently of the opaque body.
  const finMaterial=material(red.clone());finMaterial.side=THREE.DoubleSide;fins.mesh.material=finMaterial;
  const nozzleGeometry=shape(new THREE.CylinderGeometry(.19,.23,.14,10));nozzleGeometry.rotateX(Math.PI/2);nozzleGeometry.translate(0,0,-.62);
  const nozzles=batch('item-missile-nozzles',nozzleGeometry,dark);
  const exhaust=batch('item-missile-trails',shape(new THREE.IcosahedronGeometry(1,0)),flame,CAPACITY*6,4);

  const shieldTime={value:0},shieldStrength={value:1};
  const shieldMaterial=material(new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.FrontSide,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{effectTime:shieldTime,strength:shieldStrength}]),fog:true,
    vertexShader:`varying vec3 vNormal;varying vec3 vEye;varying float vHeight;
      #include <common>
      #include <fog_pars_vertex>
      void main(){vec4 p=instanceMatrix*vec4(position,1.0);vec4 world=modelMatrix*p;
      mat3 im=mat3(instanceMatrix);vec3 scaleSquared=vec3(dot(im[0],im[0]),dot(im[1],im[1]),dot(im[2],im[2]));
      vNormal=normalize(mat3(modelMatrix)*im*(normal/scaleSquared));vEye=cameraPosition-world.xyz;vHeight=position.y;
      vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`uniform float effectTime;uniform float strength;varying vec3 vNormal;varying vec3 vEye;varying float vHeight;
      #include <common>
      #include <fog_pars_fragment>
      void main(){float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(vEye))),2.5);
      float pulse=.9+.1*sin(effectTime*3.0);gl_FragColor=vec4(mix(vec3(.13,.47,.8),vec3(.6,.94,1.0),rim),(.035+rim*.42)*strength*pulse);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`}));
  shieldMaterial.uniforms.effectTime=shieldTime;shieldMaterial.uniforms.strength=shieldStrength;
  const shields=batch('item-shield-bubbles',shape(new THREE.SphereGeometry(1,18,10)),shieldMaterial,CAPACITY,5);
  const shieldRings=batch('item-shield-ground-rings',ring,glow);
  const diagnostics={capacity:CAPACITY,entities:0,boxes:0,cooldownBoxes:0,bananas:0,missiles:0,shields:0,trailInstances:0,
    dropped:0,drawCalls:0,triangles:0,quality:'high',visible:true,time:0,disposed:false};
  let disposed=false;
  function clear(){
    for(const entry of batches){entry.mesh.count=0;entry.colored=false;}
    diagnostics.entities=0;diagnostics.boxes=0;diagnostics.cooldownBoxes=0;diagnostics.bananas=0;diagnostics.missiles=0;diagnostics.shields=0;
    diagnostics.trailInstances=0;diagnostics.dropped=0;diagnostics.drawCalls=0;diagnostics.triangles=0;
  }
  const valid=o=>Number.isFinite(o.x)&&Number.isFinite(o.z);
  function admit(){if(diagnostics.entities>=CAPACITY){diagnostics.dropped++;return false;}diagnostics.entities++;return true;}
  return {root,diagnostics,clear,
    update({race,time=0,visible=true,quality='high'}={}){
      if(disposed)return;clear();root.visible=visible;diagnostics.visible=visible;diagnostics.quality=quality==='low'?'low':'high';diagnostics.time=time;
      if(!visible||!race)return;
      const high=quality!=='low',clock=Number.isFinite(race.time)?race.time:0;
      glass.opacity=high?.38:.28;flame.opacity=high?.8:.55;shieldTime.value=time;shieldStrength.value=high?1:.75;
      // Reserve meaningful protection visuals before admitting optional scenery.
      for(const racer of race.racers??EMPTY)if(racer.shieldTime>0&&!racer.finished&&valid(racer)&&admit()){
        const pulse=1+Math.sin(time*3+racer.id)*.025,heading=racer.heading||0;
        put(shields,racer.x,1.35,racer.z,heading,1.62*pulse,1.55*pulse,2.32*pulse);
        put(shieldRings,racer.x,.10,racer.z,0,1.7,2.35,1,'#92eaff',Math.PI/2,-heading);diagnostics.shields++;
      }
      let index=0;
      for(const item of race.itemBoxes??EMPTY){
        if(!valid(item)||!admit())continue;const phase=index++*.91;
        if((item.readyAt??0)>clock){put(cooldowns,item.x,.065,item.z,0,1.03,1.03,1,null,Math.PI/2);diagnostics.cooldownBoxes++;continue;}
        const y=1.6+Math.sin(time*2+phase)*.17,spin=time*.8+phase,size=1.9;
        put(shells,item.x,y,item.z,spin,size);put(faces,item.x,y,item.z,spin,size*1.007);
        put(frames,item.x,y,item.z,spin,size,size,size,high?'#9decff':'#70cbe8');
        put(bases,item.x,.075,item.z,0,1.35,1.35,1,'#62d8ee',Math.PI/2);diagnostics.boxes++;
      }
      for(const hazard of race.hazards??EMPTY){
        if(!valid(hazard)||(hazard.life!==undefined&&hazard.life<=0)||(hazard.type!=='banana'&&hazard.type!=='missile')||!admit())continue;
        const heading=hazard.heading||0;
        if(hazard.type==='banana'){
          put(peel,hazard.x,.025,hazard.z,heading);put(insides,hazard.x,.025,hazard.z,heading);
          put(tips,hazard.x,.66,hazard.z,heading);diagnostics.bananas++;
        }else{
          const y=1.65+Math.sin(time*12+(hazard.age??0))*.035;
          put(body,hazard.x,y,hazard.z,heading);put(bands,hazard.x,y,hazard.z,heading);put(fins,hazard.x,y,hazard.z,heading);put(nozzles,hazard.x,y,hazard.z,heading);
          const trailCount=high?6:3,dx=Math.sin(heading),dz=Math.cos(heading);
          for(let n=0;n<trailCount;n++){
            const distance=.82+n*.42,radius=(.18-n*.023)*(1+Math.sin(time*23+n)*.1);
            put(exhaust,hazard.x-dx*distance,y,hazard.z-dz*distance,heading,radius,radius,radius*1.7,n<2?'#ffdc87':'#ee8659');
          }
          diagnostics.missiles++;
        }
      }
      diagnostics.trailInstances=exhaust.mesh.count;
      for(const entry of batches)if(entry.mesh.count){
        entry.range.count=entry.mesh.count*16;entry.mesh.instanceMatrix.clearUpdateRanges();entry.mesh.instanceMatrix.updateRanges.push(entry.range);entry.mesh.instanceMatrix.needsUpdate=true;
        if(entry.colored)entry.mesh.instanceColor.needsUpdate=true;
        diagnostics.drawCalls++;diagnostics.triangles+=(entry.mesh.geometry.index?.count??entry.mesh.geometry.attributes.position.count)/3*entry.mesh.count;
      }
    },
    dispose(){if(disposed)return;disposed=true;clear();diagnostics.disposed=true;root.removeFromParent();
      batches.forEach(entry=>entry.mesh.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());question.dispose();root.clear();},
  };
}
