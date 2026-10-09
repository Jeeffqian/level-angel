import * as THREE from 'three';

/** One inexpensive instanced draw grounds the karts when shadow maps are off. */
export function createContactShadows(scene){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,6,32,32,32);
  gradient.addColorStop(0,'rgba(8,22,27,.48)');gradient.addColorStop(.6,'rgba(8,22,27,.25)');gradient.addColorStop(1,'rgba(8,22,27,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas),geometry=new THREE.PlaneGeometry(3.5,4.4);geometry.rotateX(-Math.PI/2);
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
  const mesh=new THREE.InstancedMesh(geometry,material,6),dummy=new THREE.Object3D();mesh.name='kart-contact-shadows';mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
  return {update(models,height,enabled){
    mesh.visible=enabled;if(!enabled)return;
    let count=0;for(const model of models)if(model.visible&&count<6){dummy.position.set(model.position.x,height,model.position.z);dummy.rotation.set(0,model.rotation.y,0);dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix);}
    mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
  },dispose(){geometry.dispose();material.dispose();texture.dispose();mesh.removeFromParent();}};
}
