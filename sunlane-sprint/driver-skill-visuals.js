import * as THREE from 'three';
import {getDriverSkill} from './driver-skills.js';

/** Four bounded batches for all six racers; no unique material per kart. */
export function createDriverSkillVisuals(scene){
  const root=new THREE.Group();root.name='driver-skill-effects';scene.add(root);
  const ringGeometry=new THREE.TorusGeometry(1,.024,4,48),sparkGeometry=new THREE.IcosahedronGeometry(1,0),trailGeometry=new THREE.BoxGeometry(.08,.06,1),bubbleGeometry=new THREE.SphereGeometry(1,18,10);
  const glow=new THREE.MeshBasicMaterial({transparent:true,opacity:.78,depthWrite:false,toneMapped:false});
  const shell=new THREE.MeshBasicMaterial({transparent:true,opacity:.10,depthWrite:false,toneMapped:false,wireframe:true});
  function batch(geometry,material,count){const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);return mesh;}
  const rings=batch(ringGeometry,glow,18),sparks=batch(sparkGeometry,glow,48),trails=batch(trailGeometry,glow,24),bubbles=batch(bubbleGeometry,shell,6);
  const batches=[rings,sparks,trails,bubbles],dummy=new THREE.Object3D(),tint=new THREE.Color();
  const diagnostics={active:0,slowed:0,drawCalls:0,instances:0};
  function put(mesh,color,x,y,z,sx,sy=sx,sz=sx,rx=0,ry=0){
    if(mesh.count>=mesh.instanceMatrix.count)return;
    dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(rx,ry,0);dummy.updateMatrix();mesh.setMatrixAt(mesh.count,dummy.matrix);mesh.setColorAt(mesh.count,tint.set(color));mesh.count++;
  }
  function clear(){for(const mesh of batches)mesh.count=0;Object.assign(diagnostics,{active:0,slowed:0,drawCalls:0,instances:0});}
  return {root,diagnostics,clear,
    update({race,visible=true,quality='low'}){
      clear();root.visible=visible;if(!visible)return;
      for(const r of race.racers){
        if(r.finished)continue;
        if(r.skillSlowTime>0){put(rings,'#b4ef50',r.x,.2,r.z,1.8,1.8,1,Math.PI/2);diagnostics.slowed++;}
        if(!(r.skillTime>0))continue;
        const skill=getDriverSkill(r.avatar),color=skill.color,t=skill.duration-r.skillTime;diagnostics.active++;
        if(skill.id==='emp'){
          const radius=1+13*Math.min(1,t/skill.duration),x=r.skillOriginX??r.x,z=r.skillOriginZ??r.z;
          put(rings,color,x,.15,z,radius,radius,1,Math.PI/2);put(rings,color,x,.22,z,radius*.88,radius*.88,1,Math.PI/2);continue;
        }
        const radius=skill.id==='magnet'?6:1.75;
        put(rings,color,r.x,.13,r.z,radius,radius,1,Math.PI/2);
        if(skill.id==='guardian'){
          put(bubbles,color,r.x,1.25,r.z,1.65,1.55,2.35,0,r.heading);
          put(rings,color,r.x,1.25,r.z,1.65,1.55,1,0,r.heading);
        }
        if(skill.id==='overdrive'){
          const fx=Math.sin(r.heading),fz=Math.cos(r.heading);
          for(const side of [-1,1])for(let n=0;n<2;n++){const back=1.6+n*1.3;put(trails,color,r.x-fx*back+fz*side*.65,.25+n*.1,r.z-fz*back-fx*side*.65,1,1,1.1+n*.4,0,r.heading);}
        }
        if(skill.id==='catwalk'||skill.id==='magnet'){
          const count=quality==='high'?8:4;
          for(let n=0;n<count;n++){const angle=n/count*Math.PI*2+t*(skill.id==='catwalk'?2:-1),distance=skill.id==='magnet'?radius*(1-(t*.7+n/count)%1):1.65;put(sparks,color,r.x+Math.cos(angle)*distance,.18+Math.sin(angle*2)**2*.22,r.z+Math.sin(angle)*distance,.10,.045,.10);}
        }
      }
      for(const mesh of batches)if(mesh.count){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;diagnostics.drawCalls++;diagnostics.instances+=mesh.count;}
    },
    dispose(){root.removeFromParent();for(const mesh of batches)mesh.dispose();for(const g of [ringGeometry,sparkGeometry,trailGeometry,bubbleGeometry])g.dispose();glow.dispose();shell.dispose();},
  };
}
